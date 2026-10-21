import { sendEmail, FROM_ADDRESS } from './resend';

/**
 * Subprocessor change notice — the email the privacy policy promises.
 *
 * ## Why this exists (2026-10-21)
 *
 * `app/(legal)/privacy/page.tsx` says:
 *
 *   "We will give you 30 days' notice via email before adding a new
 *    subprocessor that handles personal data."
 *
 * Moving `CHAT_MODEL` from `inclusionai/ling-3.1-flash` to
 * `anthropic/claude-haiku-5.5` adds Anthropic as a named AI
 * subprocessor. The chat assistant receives the user's full resume and
 * conversation history, so this is squarely "handles personal data".
 *
 * Chat already sent resume content to a third-party model provider
 * before this change, so Anthropic is not a new *category* of
 * processor — but it is a new *named* one, and the notice obligation
 * in the policy is written plainly enough that we should just honour
 * it. Send this BEFORE the swap reaches production.
 *
 * ## Why this does not send itself
 *
 * There is no cron, no route, no signup hook. `sendSubprocessorNotice`
 * is called explicitly by a human, against an explicit recipient list,
 * after reading it. A legal notice that fires on a code path is a legal
 * notice you cannot take back.
 *
 * See `scripts/send-subprocessor-notice.cjs` for the send path.
 */

/**
 * Deliberately FORWARD-LOOKING: "we are switching", not "we switched".
 *
 * The 30-day notice is supposed to arrive BEFORE the subprocessor change
 * takes effect. Writing it in the past tense — which is what the first
 * draft did, because the swap was already merged on a branch — would
 * make the notice describe a change that hadn't happened yet for anyone
 * reading it on the day it lands. The founder reviewed the rendered
 * email on 2026-10-21 and asked for this specifically.
 */
export const SUBPROCESSOR_NOTICE_SUBJECT =
  'Update: Anthropic is joining as an AI subprocessor';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * The processors to list. Kept as data rather than prose so the email and
 * `app/(legal)/privacy/page.tsx` can be diffed against each other — they
 * are the same disclosure in two places, and they drifted once already.
 */
export const AI_SUBPROCESSORS_2026_10_21 = [
  { name: 'Anthropic', model: 'anthropic/claude-haiku-5.5', role: 'AI chat assistant' },
  { name: 'Mistral', model: 'mistral/mistral-nemo', role: 'Resume / job-description parsing' },
  { name: 'Reflection AI', model: 'reflection/beam-free', role: 'Fallback model' },
  { name: 'Amazon', model: 'amazon/nova-micro', role: 'Fallback model' },
  { name: 'OpenAI', model: 'openai/gpt-4o-mini', role: 'Fallback model (parsing only)' },
  { name: 'Z.ai', model: 'zai/glm-5.3-flash', role: 'Fallback model' },
  { name: 'NVIDIA', model: 'nvidia/nemotron-3.5-lightning-free', role: 'Fallback model' }
] as const;

export function buildSubprocessorNoticeHtml({
  name,
  privacyUrl,
  effectiveDate
}: {
  name?: string | null;
  privacyUrl: string;
  effectiveDate: string;
}): string {
  const greeting = name?.trim() ? escapeHtml(name.trim()) : 'there';

  const rows = AI_SUBPROCESSORS_2026_10_21.map(
    (p) => `
                <tr>
                  <td style="padding:8px 12px 8px 0;border-bottom:1px solid #e4e4e7;font-size:14px;color:#18181b;vertical-align:top;white-space:nowrap;">
                    ${escapeHtml(p.name)}
                  </td>
                  <td style="padding:8px 0;border-bottom:1px solid #e4e4e7;font-size:13px;color:#52525b;">
                    ${escapeHtml(p.role)}
                  </td>
                </tr>`
  ).join('');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${SUBPROCESSOR_NOTICE_SUBJECT}</title>
  </head>
  <body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#18181b;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f4f5;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border-radius:12px;padding:32px;">
            <tr>
              <td>
                <h1 style="margin:0 0 20px 0;font-size:20px;font-weight:600;color:#18181b;">
                  One of our AI providers changed
                </h1>
                <p style="margin:0 0 16px 0;font-size:15px;line-height:1.5;color:#3f3f46;">
                  Hi ${greeting},
                </p>
                <p style="margin:0 0 16px 0;font-size:15px;line-height:1.5;color:#3f3f46;">
                  Our privacy policy promises 30 days' notice before we add a new
                  subprocessor that handles your personal data. We're keeping that
                  promise in writing: as of ${escapeHtml(effectiveDate)}, we are
                  switching the model behind your AI chat assistant from one provider
                  to <strong>Anthropic</strong>.
                </p>
                <p style="margin:0 0 16px 0;font-size:15px;line-height:1.5;color:#3f3f46;">
                  What this means in practice: when you use the chat assistant, your
                  resume and conversation will be processed by Anthropic's models to
                  generate a reply, instead of the provider we use now. We chose it
                  because in our testing it made noticeably better edits to your
                  resume — but the reason doesn't change what it sees. If you'd rather
                  we didn't, reply to this email and we'll delete your account and data.
                </p>
                <p style="margin:0 0 20px 0;font-size:15px;line-height:1.5;color:#3f3f46;">
                  Here's the complete current list of AI model providers:
                </p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0;">
                  ${rows}
                </table>
                <p style="margin:0 0 24px 0;font-size:15px;line-height:1.5;color:#3f3f46;">
                  The full policy, including how long anyone retains this data, is
                  here:
                </p>
                <p style="margin:0 0 24px 0;">
                  <a href="${escapeHtml(privacyUrl)}"
                     style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:9999px;font-size:14px;font-weight:500;">
                    Read the privacy policy
                  </a>
                </p>
                <p style="margin:0 0 16px 0;font-size:15px;line-height:1.5;color:#3f3f46;">
                  Nothing about your account, your data, or the price changed.
                </p>
                <p style="margin:16px 0 0 0;font-size:12px;color:#a1a1aa;">
                  Nexstepper · AI-assisted resume builder
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function buildSubprocessorNoticeText({
  name,
  privacyUrl,
  effectiveDate
}: {
  name?: string | null;
  privacyUrl: string;
  effectiveDate: string;
}): string {
  const greeting = name?.trim() ? name.trim() : 'there';
  return [
    `Hi ${greeting},`,
    '',
    'Our privacy policy promises 30 days\' notice before we add a new subprocessor that handles your personal data. We are keeping that promise in writing:',
    '',
    `As of ${effectiveDate}, we are switching the model behind your AI chat assistant to Anthropic.`,
    '',
    'What this means: when you use the chat assistant, your resume and conversation will be processed by Anthropic\'s models to generate a reply, instead of the provider we use now. We chose it because in our testing it made noticeably better edits to your resume - but the reason does not change what it sees.',
    '',
    'If you would rather we did not, reply to this email and we will delete your account and data.',
    '',
    'Current AI model providers:',
    ...AI_SUBPROCESSORS_2026_10_21.map((p) => `  - ${p.name} — ${p.role}`),
    '',
    'Full policy:',
    privacyUrl,
    '',
    'Nothing about your account, your data, or the price changed.',
    '',
    '- Nexstepper'
  ].join('\n');
}

/**
 * Send the notice. Explicit recipient list, explicit invocation — see the
 * module header for why nothing calls this automatically.
 */
export async function sendSubprocessorNotice({
  to,
  name,
  privacyUrl,
  effectiveDate
}: {
  to: string | string[];
  name?: string | null;
  privacyUrl: string;
  effectiveDate: string;
}) {
  return sendEmail({
    to,
    subject: SUBPROCESSOR_NOTICE_SUBJECT,
    html: buildSubprocessorNoticeHtml({ name, privacyUrl, effectiveDate }),
    text: buildSubprocessorNoticeText({ name, privacyUrl, effectiveDate })
  });
}

export { FROM_ADDRESS };