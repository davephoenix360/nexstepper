import 'server-only';

import { sendEmail } from './resend';

/**
 * Password-reset email — template + sender.
 *
 * The reset link is built by Better Auth (using `resetPasswordURL`
 * in the auth config + the token). We just wrap it in a clean
 * HTML / text email and send via Resend.
 *
 * Privacy: the email body never contains the password. It only
 * contains a single-use URL with a short-lived (1h) token.
 *
 * Why we don't reveal whether the email exists:
 * The "forgot password" page already returns a generic success
 * regardless of whether the email is registered. The send-email
 * step is the same shape regardless — Better Auth short-circuits
 * silently if there's no matching user, so `sendResetPassword`
 * is never called with an unknown address. This means we can't
 * leak existence at the email layer either.
 */

const SUBJECT = 'Reset your Nextep password';

/**
 * Default expiry for the reset link, in minutes.
 *
 * MUST match `resetPasswordTokenExpiresIn` in `lib/auth.ts`.
 * Exported so tests can assert the two values stay in sync.
 */
export const EXPIRY_MINUTES_DEFAULT = 60;

const EXPIRY_MINUTES = EXPIRY_MINUTES_DEFAULT;

/**
 * Build the HTML body for the password-reset email. Exposed as a
 * pure function so it's trivially unit-testable without spinning
 * up Resend.
 */
export function buildResetPasswordHtml({
  name,
  url,
  expiryMinutes = EXPIRY_MINUTES
}: {
  name: string | null | undefined;
  url: string;
  expiryMinutes?: number;
}): string {
  // Fall back to "there" if the name is missing — better than a
  // weird empty greeting. Real users will always have a name from
  // signup (we use the email prefix as default in the sign-up
  // form), but be defensive.
  const greeting = name?.trim() ? name.trim() : 'there';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${SUBJECT}</title>
  </head>
  <body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#18181b;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f4f5;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border-radius:12px;padding:32px;">
            <tr>
              <td>
                <h1 style="margin:0 0 16px 0;font-size:20px;font-weight:600;color:#18181b;">
                  Reset your Nextep password
                </h1>
                <p style="margin:0 0 16px 0;font-size:15px;line-height:1.5;color:#3f3f46;">
                  Hi ${escapeHtml(greeting)},
                </p>
                <p style="margin:0 0 24px 0;font-size:15px;line-height:1.5;color:#3f3f46;">
                  We received a request to reset the password for your Nextep account.
                  Click the button below to choose a new one. This link expires in
                  ${expiryMinutes} minutes and can only be used once.
                </p>
                <p style="margin:0 0 24px 0;">
                  <a href="${escapeAttr(url)}"
                     style="display:inline-block;padding:12px 20px;background:#4f46e5;color:#ffffff;font-size:15px;font-weight:500;text-decoration:none;border-radius:8px;">
                    Reset password
                  </a>
                </p>
                <p style="margin:0 0 8px 0;font-size:13px;line-height:1.5;color:#71717a;">
                  Or paste this link into your browser:
                </p>
                <p style="margin:0 0 24px 0;font-size:12px;line-height:1.5;color:#71717a;word-break:break-all;background:#f4f4f5;padding:12px;border-radius:6px;">
                  ${escapeHtml(url)}
                </p>
                <hr style="border:none;border-top:1px solid #e4e4e7;margin:24px 0;" />
                <p style="margin:0;font-size:13px;line-height:1.5;color:#71717a;">
                  If you didn't request this, you can safely ignore this email —
                  your password will stay the same.
                </p>
              </td>
            </tr>
          </table>
          <p style="margin:16px 0 0 0;font-size:12px;color:#a1a1aa;">
            Nextep · AI-assisted resume builder
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/**
 * Plain-text fallback for clients that don't render HTML. Most
 * clients prefer the HTML version; the text version is a
 * accessibility fallback.
 */
export function buildResetPasswordText({
  name,
  url,
  expiryMinutes = EXPIRY_MINUTES
}: {
  name: string | null | undefined;
  url: string;
  expiryMinutes?: number;
}): string {
  const greeting = name?.trim() ? name.trim() : 'there';
  return [
    `Hi ${greeting},`,
    '',
    'We received a request to reset the password for your Nextep account.',
    `Click the link below to choose a new one. This link expires in ${expiryMinutes} minutes and can only be used once.`,
    '',
    url,
    '',
    "If you didn't request this, you can safely ignore this email — your password will stay the same.",
    '',
    '— Nextep'
  ].join('\n');
}

/**
 * Send the password-reset email. Thin wrapper that combines the
 * template builders with the Resend transport. The auth.ts
 * `sendResetPassword` callback calls this directly.
 *
 * Behavior when `RESEND_API_KEY` is unset (dev mode without email):
 * - Logs the URL to console so the developer can copy it manually
 * - Returns successfully so the auth flow continues
 *
 * This is intentional: the public "forgot password" UI shows a
 * generic success message regardless, so the dev experience is
 * "click the link in your terminal" rather than a dead end.
 */
export async function sendPasswordResetEmail({
  to,
  name,
  url,
  expiryMinutes
}: {
  to: string;
  name?: string | null;
  url: string;
  expiryMinutes?: number;
}): Promise<void> {
  const html = buildResetPasswordHtml({ name, url, expiryMinutes });
  const text = buildResetPasswordText({ name, url, expiryMinutes });

  const result = await sendEmail({ to, subject: SUBJECT, html, text });

  // The `sendEmail` wrapper returns `{ skipped: true }` when Resend
  // isn't configured. In that case the developer needs the URL —
  // log it to the server console so they can copy it.
  if ('skipped' in result && result.skipped) {
    console.info(
      `[password-reset] Resend not configured. Reset URL for ${to}:\n  ${url}`
    );
  }
}

// ─── Tiny HTML escaping helpers ─────────────────────────────────────────────
//
// The reset URL comes from Better Auth (trusted) and the name
// comes from the user record (set by the user at signup — not fully
// trusted, but limited to a name field). Escape both when
// interpolating into HTML to keep the email template robust against
// weird-but-not-malicious input.

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(s: string): string {
  // For attribute values we additionally need to escape backticks
  // and `=` to be safe inside quoted attrs (defense in depth — the
  // value is URL, so we don't expect these chars, but the cost is
  // zero).
  return escapeHtml(s).replace(/`/g, '&#96;');
}
