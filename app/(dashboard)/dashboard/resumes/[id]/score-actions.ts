'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';

import { auth } from '@/lib/auth';
import { getResume } from '@/lib/db/queries';
import { scoreResumeFromEnvelope } from '@/lib/scoring';

/**
 * Server Action: re-run the ATS scoring engine for a variant.
 *
 * Plan: docs/plans/ats-scoring.md §"Files (New)" + acceptance
 * criterion #7 ("Refresh score button calls recomputeScoreAction
 * via useTransition, shows a spinner, and updates the bars in
 * place") and #12 (validates session + ownership, returns the
 * standard `ActionResult<ScoreBreakdown>` discriminated union).
 *
 * The action is intentionally narrow:
 *   - Input: just `{ resumeId: string }`. The score is computed
 *     from the resume's current `data.jobContext` (the source of
 *     truth on the resume), not from the client. The client can't
 *     inject a different JD for scoring — that would be a stale-
 *     score vector we don't want.
 *   - Output: `ActionResult<ScoreBreakdown>` (ok | error). Same
 *     shape used by every other Server Action in the codebase
 *     (per AGENTS.md §"Server Action results use a discriminated
 *     union").
 *   - Side effects: `revalidatePath` on the variant editor so the
 *     server-rendered first-render score refreshes on next
 *     navigation. The client-side `useTransition` wrapper also
 *     keeps the in-memory score fresh.
 *
 * Auth model: Server Actions are public endpoints regardless of
 * where they appear in the UI. We re-check the session + ownership
 * at the top (acceptance criterion #12), exactly like
 * `setVariantJobContextAction` and the share-link actions.
 */
export async function recomputeScoreAction(
  input: unknown
): Promise<
  | { ok: true; data: import('@/lib/scoring').ScoreBreakdown }
  | { ok: false; error: string }
> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { ok: false, error: 'Not signed in' };
  }

  const parsed = recomputeScoreInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Invalid input' };
  }

  const result = await getResume(parsed.data.resumeId, session.user.id);
  if (!result) {
    return { ok: false, error: 'Resume not found' };
  }
  const { resume, data } = result;
  if (resume.isMaster) {
    return {
      ok: false,
      error: 'Scoring only applies to variants, not master resumes.'
    };
  }
  if (!data.jobContext) {
    return {
      ok: false,
      error:
        'No job description attached. Attach a JD before scoring.'
    };
  }

  try {
    const breakdown = scoreResumeFromEnvelope(data, data.jobContext);
    revalidatePath(`/dashboard/resumes/${parsed.data.resumeId}`);
    return { ok: true, data: breakdown };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: `Scoring failed: ${message}`
    };
  }
}

const recomputeScoreInputSchema = z.object({
  resumeId: z.string().min(1)
});
