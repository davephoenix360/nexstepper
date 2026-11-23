import 'server-only';

import { revalidatePath } from 'next/cache';

import {
  getResume,
  recordScoreSnapshot,
  type MatchBreakdown
} from '@/lib/db/queries';
import type { JobPosting, ResumeData } from '@/lib/resume-schema';
import type { ScoreBreakdown } from '@/lib/scoring';
import { buildDynamicTips, type DynamicTips } from '@/lib/scoring/tips';
import {
  buildMatchBreakdown,
  maybeAppendSkillGapEntry
} from '@/lib/inline-issue/build-match-breakdown';
import { trackServer } from '@/lib/posthog/server';
import { PostHogEvents } from '@/lib/posthog/events';

import { scoreResumeHybridFromEnvelope } from './score-hybrid';

/**
 * The one write path for a variant's ATS score.
 *
 * Two surfaces used to compute and persist this independently: the
 * Recompute button (`recomputeScoreAction`) and Scout's `getAtsScore` tool.
 * That is the repo's characteristic "two surfaces, two numbers" failure,
 * so both now go through this helper (the tool is being retired in favour
 * of the route-level recompute for bullet edits).
 *
 * IMPORTANT for callers after an edit: when `source` is omitted the helper
 * RE-READS the resume. A chat turn loads the resume before the model runs;
 * passing that stale `data` back here would score the pre-edit revision
 * and leave the old attention icon on screen after a successful fix.
 *
 * Callers that have already loaded and validated the current envelope
 * (the Recompute action) may pass `source` to avoid a second read. The
 * scoring + snapshot body below exists exactly once.
 *
 * Revalidation is deliberately NOT part of this helper. Next flushes
 * route-handler revalidations when the handler returns its `Response`,
 * before a streamed body finishes, so a `revalidatePath()` called after
 * a chat edit would be dropped. Server Actions call
 * `revalidateVariantScorePaths()` explicitly; chat turns rely on the
 * stream's `score_updated` event and the client's coalesced
 * `router.refresh()` instead.
 */
export async function recomputeVariantScore(
  resumeId: string,
  userId: string,
  source?: { data: ResumeData; job: JobPosting }
): Promise<{
  breakdown: ScoreBreakdown;
  tips: DynamicTips;
  matchBreakdown: MatchBreakdown;
}> {
  let data: ResumeData;
  let job: JobPosting;

  if (source) {
    ({ data, job } = source);
  } else {
    const loaded = await getResume(resumeId, userId);
    if (!loaded) throw new Error('Resume not found');
    if (loaded.resume.isMaster) {
      throw new Error('Scoring only applies to variants, not master resumes.');
    }
    if (!loaded.data.jobContext) {
      throw new Error('No job description attached. Attach a JD before scoring.');
    }
    data = loaded.data;
    job = loaded.data.jobContext;
  }

  const breakdown = await scoreResumeHybridFromEnvelope(data, job);
  const tips = buildDynamicTips(breakdown, data, job);
  const matchBreakdown = maybeAppendSkillGapEntry(
    buildMatchBreakdown(breakdown, data),
    breakdown
  );

  // Persist the FULL breakdown. The page renders the persisted snapshot
  // through `resolveRenderedBreakdown`; a snapshot with only a headline
  // number is invisible to it and the scorecard shows a different number
  // from the one this helper just computed.
  await recordScoreSnapshot(resumeId, userId, {
    matchScore: breakdown.overallScore,
    matchBreakdown,
    dynamicTips: tips,
    breakdown,
    computedInMs: breakdown.computedInMs
  });

  trackServer(userId, PostHogEvents.SCORE_COMPUTED, {
    resumeId,
    overallScore: breakdown.overallScore,
    computedInMs: breakdown.computedInMs
  });

  return { breakdown, tips, matchBreakdown };
}

/**
 * Invalidate the two pages that render a variant's score. Called by
 * Server Actions after `recomputeVariantScore()` succeeds — never from
 * a streaming route handler, where Next would discard the invalidation
 * before the stream finishes.
 */
export function revalidateVariantScorePaths(resumeId: string): void {
  revalidatePath(`/dashboard/resumes/${resumeId}`);
  // The list renders a score badge from this snapshot too. Without this
  // the badge keeps the stale number (the "score isn't updating" report).
  revalidatePath('/dashboard/resumes');
}
