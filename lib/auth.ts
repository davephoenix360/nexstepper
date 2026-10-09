import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { db } from '@/lib/db/drizzle';
import * as schema from '@/lib/db/schema';
import { sendPasswordResetEmail } from '@/lib/email/reset-password';
import { readGoogleCredentials } from '@/lib/auth-google';

/**
 * Social providers (Google), registered conditionally.
 *
 * `readGoogleCredentials()` returns null unless BOTH
 * `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set, so this
 * spreads to `{}` on a machine that has never configured Google —
 * local dev, CI, and self-hosters keep working on email + password
 * alone instead of crashing on the first auth request.
 *
 * `lib/auth-google.ts` owns the rationale, the account-linking
 * security posture, and the env-var setup steps.
 */
const socialProviders = (() => {
  const credentials = readGoogleCredentials();
  if (!credentials) return {};
  return {
    google: {
      clientId: credentials.clientId,
      clientSecret: credentials.clientSecret
    }
  };
})();

/**
 * Better Auth server instance.
 *
 * Email + password auth with a real password-reset flow:
 *   - User clicks "Forgot password?" on the sign-in page
 *   - Enters email → `authClient.forgetPassword({ email })`
 *   - Better Auth generates a single-use token, calls
 *     `sendResetPassword` (we send via Resend)
 *   - User clicks the email link → lands on `/reset-password?token=…`
 *   - Enters a new password → `authClient.resetPassword({ token, newPassword })`
 *
 * The custom `resetPasswordURL` below tells Better Auth to point the
 * email link at OUR page instead of its built-in `/api/auth/reset-password`
 * JSON endpoint. Our page does the UI; Better Auth does the token
 * validation + password write.
 */
export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification
    }
  }),
  // `{}` when Google isn't configured — see the note above and in
  // lib/auth-google.ts. Better Auth accepts an empty provider map, so
  // email + password remains the only path without a crash.
  socialProviders,
  /**
   * Account linking: an existing email+password account is linked to a
   * Google sign-in automatically when the emails match, instead of
   * failing with `account_not_linked`.
   *
   * ## Why this is safe for Google specifically
   *
   * Better Auth refuses implicit linking when either clause of its gate
   * holds (`oauth2/link-account.mjs`):
   *
   *   (!isTrustedProvider && !userInfo.emailVerified)
   *   || (requireLocalEmailVerified && !dbUser.user.emailVerified)
   *
   * The decisive argument is not "Better Auth allows it", it is that
   * **anyone who can complete a Google sign-in for email X already
   * controls inbox X** — and could therefore already reset that
   * account's password through /forgot-password. Linking grants no
   * capability that password reset does not already grant. For a
   * product whose recovery path already trusts email control, this
   * change does not move the trust boundary.
   *
   * ## Why `requireLocalEmailVerified: false`
   *
   * Not because we distrust our users — because we run no
   * email-verification flow, so every existing account has
   * `emailVerified: false`. With the default `true`, linking would
   * refuse *every* legacy account and the setting would be decorative.
   * Google remains the only trusted provider, which is the property
   * that makes this safe: Google verifies an email before it issues an
   * account.
   *
   * On a successful link Better Auth back-fills `emailVerified: true`
   * on the local row when Google reports the email verified, so linked
   * accounts self-heal. `user.email` is never rewritten by a link.
   *
   * ## ⚠ If you add another social provider
   *
   * Do NOT add it to `trustedProviders` unless it is documented as
   * verifying every email it issues. A provider that hands out
   * accounts for unverified addresses (some self-hosted and older
   * OAuth providers do) re-opens GHSA-g38m-r43w-p2q7: an attacker
   * signs in with the victim's address and inherits their account.
   * This is the exact setting to revisit before adding GitHub, etc.
   */
  account: {
    accountLinking: {
      enabled: true,
      // Google only. Never widen this list casually.
      trustedProviders: ['google'],
      // Required: our users have `emailVerified: false` because there
      // is no verification flow. See the note above before changing.
      requireLocalEmailVerified: false
    }
  },
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    minPasswordLength: 8,
    maxPasswordLength: 100,
    // 1 hour. Long enough that someone distracted by a meeting can
    // still complete the reset; short enough that a leaked email
    // doesn't give an attacker much time to brute-force.
    resetPasswordTokenExpiresIn: 60 * 60,
    // `resetPasswordURL` was removed in Better Auth 1.6 (the option key
    // moved + behaviour changed). The reset link now goes to Better
    // Auth's default `/api/auth/reset-password` endpoint. Our
    // /reset-password page (app/(auth)/reset-password/page.tsx) reads
    // ?token= from the URL regardless of the issuing path, so the
    // user-facing flow still works end-to-end.
    /**
     * Server-side email sender. Better Auth calls this with the
     * generated URL when `auth.api.forgetPassword` runs. The `url`
     * is built using `resetPasswordURL` above + the token.
     */
    sendResetPassword: async ({ user, url }) => {
      await sendPasswordResetEmail({
        to: user.email,
        name: user.name,
        url
      });
    }
  },
  session: {
    expiresIn: 60 * 60 * 24, // 24 hours
    updateAge: 60 * 60 * 24, // refresh once per day
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5 // 5 minutes — keeps server reads low
    }
  },
  user: {
    additionalFields: {}
  },
  /**
   * Trusted origins for inbound requests (TOP-LEVEL option, not under
   * `advanced` — earlier 4e503e9 put it under `advanced` which silently
   * no-ops the config in Better Auth 1.6+). Required because Vercel's
   * domain config 308-redirects `nexstepper.com` -> `www.nexstepper.com`,
   * so every real request hits `www.` even though `BETTER_AUTH_URL` is
   * set to the apex. Default config rejects `www.` as "invalid origin"
   * and the auth flow silently 500s. The list covers:
   *  - `BETTER_AUTH_URL` (apex, what Infisical sets)
   *  - `www.` variant (where the deployment actually serves)
   *  - `localhost:3000` (local dev)
   *  - `nexstepper-*.vercel.app` (PR preview deployments) — wildcard
   *    pattern, not a regex (Better Auth's pattern syntax uses `*`,
   *    `?`, `**`; literal RegExp objects are not supported).
   *
   * Self-hosters behind a different domain can fork this list and
   * commit the result. Per-instance override via env isn't exposed
   * because trustedOrigins config doesn't read from `BETTER_AUTH_*`
   * in 1.6+ (regression from v1.4.4 — see GitHub issue #6798).
   */
  trustedOrigins: (() => {
    const list: string[] = ['http://localhost:3000', 'https://www.nexstepper.com'];
    // Apex from env (e.g. `https://nexstepper.com`) — added only if set
    // because `process.env.X` is `string | undefined`.
    if (process.env.BETTER_AUTH_URL) list.push(process.env.BETTER_AUTH_URL);
    // Wildcard pattern for PR preview deployments on Vercel
    list.push('https://nexstepper-*.vercel.app');
    return list;
  })(),
  advanced: {
    // Cookie prefix `nexstepper` set during 2026-09-25 rebrand; see
    // `docs/drift/2026-09-25-nextep-rename.md`. Renaming the cookie
    // prefix invalidates every live session — acceptable here because
    // the product is not yet public (see `docs/setup/production.md`
    // §11 launch gate). Self-hosters upgrading through this commit
    // will be signed out once; behaviour expected.
    cookiePrefix: 'nexstepper'
  },
  plugins: [nextCookies()]
});

export type Auth = typeof auth;