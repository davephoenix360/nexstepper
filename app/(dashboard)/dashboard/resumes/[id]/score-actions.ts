'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';

import { auth } from '@/lib/auth';
import {
  getResume,
  recordScoreSnapshot,
  type MatchBreakdown
} from '@/lib/db/queries';
import { scoreResumeHybridFromEnvelope } from '@/lib/scoring-async/score-hybrid';
import { buildDynamicTips, type DynamicTips } from '@/lib/scoring/tips';
import type { ScoreBreakdown } from '@/lib/scoring';
import {
  buildMatchBreakdown,
  maybeAppendSkillGapEntry
} from '@/lib/inline-issue/build-match-breakdown';
import { trackServer } from '@/lib/posthog/server';
import { PostHogEvents } from '@/lib/posthog/events';

/**
 * Server Action: re-run the ATS scoring engine for a variant using
 * the HYBRID (BM25 + semantic embeddings) path.
 *
 * Plan: docs/plans/ats-scoring.md §"Files (New)" + acceptance
 * criterion #7 ("Refresh score button calls recomputeScoreAction
 * via useTransition, shows a spinner, and updates the bars in
 * place") and #12 (validates session + ownership, returns the
 * standard `ActionResult<…>` discriminated union).
 *
 * The action is intentionally narrow:
 *   - Input: just `{ resumeId: string }`. The score is computed
 *     from the resume's current `data.jobContext` (the source of
 *     truth on the resume), not from the client. The client can't
 *     inject a different JD for scoring — that would be a stale-
 *     score vector we don't want.
 *   - Output: `ActionResult<{ breakdown, tips }>` where tips are
 *     the per-sub-criterion dynamic improvement advice (merged
 *     with the static `CRITERIA_TIPS` at render time by the panel).
 *   - Side effects: `revalidatePath` on the variant editor so the
 *     server-rendered first-render score refreshes on next
 *     navigation. The client-side `useTransition` wrapper also
 *     keeps the in-memory score fresh.
 *
 * Auth model: Server Actions are public endpoints regardless of
 * where they appear in the UI. We re-check the session + ownership
 * at the top (acceptance criterion #12), exactly like
 * `setVariantJobContextAction` and the share-link actions.
 *
 * Drift: Phase 3 post-ship review consolidated the two-button UX
 * (BM25-only "Recompute" + hybrid "Try semantic") into a single
 * "Recompute" button using the hybrid path by default. The hybrid
 * path is strictly better signal (BM25 alpha=0.4 + semantic
 * weight=0.6), so showing users two numbers when one is strictly
 * more accurate adds confusion without value. The previous
 * `recomputeScoreSemanticAction` is kept for backwards compatibility
 * but this action is now the canonical default.
 *
 * Drift: this action also computes resume-specific dynamic tips
 * (alongside the score) so the scorecard panel can show
 * personalized advice — "Add these missing keywords: Kubernetes,
 * gRPC, Terraform" — instead of generic static guidance. The
 * helper is pure / sync and runs in the same RSC pass.
 */
export async function recomputeScoreAction(
  input: unknown
): Promise<
  | {
      ok: true;
      data: {
        breakdown: ScoreBreakdown;
        tips: DynamicTips;
        matchBreakdown: MatchBreakdown;
      };
    }
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
    const breakdown = await scoreResumeHybridFromEnvelope(data, data.jobContext);
    const tips = buildDynamicTips(breakdown, data, data.jobContext);
    // Per-leaf MatchBreakdown rows for the inline-issue surface.
    // The scorecard's controller reads these to anchor the
    // popovers; the dim bars still fall back to the
    // `defaultPathForCriterion` heuristic when the breakdown is
    // missing (first load + legacy rows).
    const matchBreakdown = maybeAppendSkillGapEntry(
      buildMatchBreakdown(breakdown),
      breakdown
    );
    // Persist a snapshot so the next page load has authoritative
    // per-leaf paths without re-running the scoring engine.
    // Silently no-ops if the resume ownership re-check fails
    // (defensive — the action already validated above).
    await recordScoreSnapshot(parsed.data.resumeId, session.user.id, {
      matchScore: breakdown.overallScore,
      matchBreakdown,
      dynamicTips: tips,
      computedInMs: breakdown.computedInMs
    });
    trackServer(session.user.id, PostHogEvents.SCORE_COMPUTED, {
      resumeId: parsed.data.resumeId,
      overallScore: breakdown.overallScore,
      computedInMs: breakdown.computedInMs
    });
    revalidatePath(`/dashboard/resumes/${parsed.data.resumeId}`);
    return { ok: true, data: { breakdown, tips, matchBreakdown } };
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
