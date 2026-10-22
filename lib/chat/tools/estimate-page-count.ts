import 'server-only';

import { headers } from 'next/headers';
import { auth } from '@/lib/auth';

/**
 * `estimatePageCount` — how many pages will this resume print on, and
 * what would bring it down.
 *
 * ## Why the agent needs this
 *
 * "Make it fit on one page" is the most common request a resume tool
 * gets. Before this tool existed, the agent could only answer it by
 * guessing from the user's prose — which is how people end up printing,
 * finding three pages, and coming back annoyed. That is the exact step
 * this product exists to remove.
 *
 * The numbers behind this are measurements, not guesses: 486 real resumes
 * were printed through the real templates under the real print CSS and
 * their PDF pages counted (see `scripts/measure-page-counts.cjs`).
 *
 * ## What it returns
 *
 * The estimated page count, the estimated content height in inches, where
 * that height went, and — the part the user actually asked for — what
 * hiding each visible section would save and what the resume would then
 * print as.
 *
 * ## It is an estimate, and says so
 *
 * The assistant cannot render the document. The formula reproduces the
 * real page count on 27 of 27 measured content shapes for most templates
 * and settings, but a very long summary, an unusually large skills
 * section, or a template the user has heavily edited will move the
 * number. The tool therefore returns the inches as well as the pages, and
 * the system prompt tells the model to say "about".
 */
export async function executeEstimatePageCount(
  resumeId: string
): Promise<{ ok: true; result: string } | { ok: false; error: string }> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return { ok: false, error: 'Not authenticated' };

  const { getResume } = await import('@/lib/db/queries');
  const { coercePrintSettings } = await import('@/lib/print-settings');
  const { estimateResumeLength, formatPageEstimate } = await import(
    '@/lib/chat/page-fit'
  );

  const existing = await getResume(resumeId, session.user.id);
  if (!existing) return { ok: false, error: 'Resume not found or not owned' };

  const { resume, data } = existing;
  const settings = coercePrintSettings(resume.printSettings);
  const hidden = data.print?.hiddenSections ?? [];

  const estimate = estimateResumeLength(data, settings, hidden);
  if (!estimate) {
    return {
      ok: false,
      error:
        'No measured page-length data for this template yet, so there is nothing to estimate from. Say so rather than guessing a page count.'
    };
  }

  return { ok: true, result: formatPageEstimate(estimate) };
}
