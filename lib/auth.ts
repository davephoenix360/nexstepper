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
    /**
     * Where Better Auth should point the email's reset link.
     * Query param `?token=...` carries the single-use token.
     * Our `/reset-password` page renders the form and calls
     * `authClient.resetPassword({ token, newPassword })`.
     */
    resetPasswordURL: '/reset-password',
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
  advanced: {
    cookiePrefix: 'nextep'
  },
  plugins: [nextCookies()]
});

export type Auth = typeof auth;