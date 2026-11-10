import 'server-only';

import { getLatestScoreSnapshot } from '@/lib/db/queries';
import type { ScoreSnapshot } from '@/lib/db/schema';
import { scoreResumeFromEnvelope, type ScoreBreakdown } from '@/lib/scoring';
import {
  resolveRenderedBreakdownWithSource,
  type RenderedBreakdownSource
} from '@/lib/scoring/snapshot-breakdown';
import type { JobPosting, ResumeData } from '@/lib/resume-schema';

/**
 * ONE place that answers "what is this variant's ATS score?".
 *
 * ## The bug this exists to prevent
 *
 * Three surfaces show or quote a variant's ATS score:
 *
 *   1. the scorecard on the variant page,
 *   2. the badge on the resume list,
 *   3. the chat agent's system prompt (and its `getAtsScore` tool).
 *
 * They used to answer the question three different ways:
 *
 *   - the PAGE read the persisted snapshot (the enhanced / Jev score),
 *   - the LIST computed a fresh score with the SYNC engine,
 *   - the CHAT computed a fresh score with the SYNC engine.
 *
 * Two of them disagreed with the page by design — the sync engine and
 * the hybrid engine differ exactly where the hybrid engine is meant to
 * disagree (ATS keyword evidence, content quality, intent coverage).
 * So a user could look at a scorecard saying 57 and ask the agent
 * "what's my score?" and be told 51. The agent was not wrong; it was
 * answering from a different engine.
 *
 * ## The rule
 *
 * The PERSISTED SNAPSHOT is the score. Every surface reads it. Only a
 * variant that has never been scored falls back to computing one, and
 * that fallback is the sync engine — which is what the page and the
 * badge already used, so they still agree with each other.
 *
 * This module is that rule, with the database read included, so the
 * page and the chat cannot drift apart again. The pure half lives in
 * `lib/scoring/snapshot-breakdown.ts` (`resolveRenderedBreakdown`),
 * which the resume LIST also uses because it needs a batched query.
 *
 * ## Why this is not in `lib/scoring/`
 *
 * `lib/scoring/` is sync, pure and IO-free by contract — the purity
 * test (`tests/unit/scoring/purity.test.ts`) scans it recursively for
 * `async`, `await`, `fetch`, `Date`, `crypto` and `Math.random`. This
 * module is async and reads the database, so it lives at the `lib/`
 * root next to the other cross-cutting server helpers
 * (`lib/resume-tips.ts`, `lib/print-settings.ts`).
 */

/** What the caller needs to know about the resolved score. */
export type VariantScore = {
  /** The score every surface should show and quote. Null when there is no JD. */
  breakdown: ScoreBreakdown | null;
  /**
   * Where the breakdown came from.
   *
   * - `snapshot` — the number the user sees on their scorecard.
   * - `computed` — no snapshot existed; this is a sync-engine estimate
   *   that the user has never actually been shown.
   */
  source: RenderedBreakdownSource;
  /**
   * The raw latest snapshot, for the inline-issue surface's per-leaf
   * paths (`matchBreakdown`). Null when nothing has been persisted.
   */
  snapshot: ScoreSnapshot | null;
};

/**
 * Resolve the score for one variant.
 *
 * @param resumeId The variant's id — used to read the latest snapshot.
 * @param resume The resume envelope (the current revision's data).
 * @param job The attached job description. Null for a master resume, or
 *   a variant the user has not attached a JD to yet. A score without a
 *   JD is meaningless, so the result is null in that case.
 */
export async function resolveVariantScore(params: {
  resumeId: string;
  resume: ResumeData;
  job: JobPosting | null;
}): Promise<VariantScore> {
  const { resumeId, resume, job } = params;

  // A master resume has no JD and therefore no ATS score. Skip the
  // query entirely rather than reading a snapshot that can only be null.
  if (!job) {
    return { breakdown: null, source: 'computed', snapshot: null };
  }

  const snapshot = await getLatestScoreSnapshot(resumeId);

  const { breakdown, source } = resolveRenderedBreakdownWithSource({
    persisted: snapshot?.breakdown ?? null,
    compute: () => scoreResumeFromEnvelope(resume, job, new Date())
  });

  return { breakdown, source, snapshot };
}
