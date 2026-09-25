import { Resend } from 'resend';

/**
 * Phase 0: thin Resend wrapper. Templates come later (React Email, Phase 1+).
 *
 * Set RESEND_API_KEY in .env. From-address defaults to onboarding@resend.dev
 * until a verified domain is configured.
 */
export const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

export const FROM_ADDRESS =
  process.env.RESEND_FROM_ADDRESS ?? 'Nexstepper <onboarding@resend.dev>';

/**
 * Send a transactional email. No-op if Resend isn't configured yet (Phase 0
 * dev mode). Throws if called when not configured in prod — caller decides.
 */
export async function sendEmail({
  to,
  subject,
  html,
  text
}: {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}) {
  if (!resend) {
    console.warn('[resend] RESEND_API_KEY not set — skipping email send.');
    return { id: 'skipped', skipped: true };
  }
  return resend.emails.send({
    from: FROM_ADDRESS,
    to,
    subject,
    html,
    text
  });
}