import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { db } from '@/lib/db/drizzle';
import * as schema from '@/lib/db/schema';
import { sendPasswordResetEmail } from '@/lib/email/reset-password';

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