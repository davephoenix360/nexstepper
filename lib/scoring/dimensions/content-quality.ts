import { ACTION_VERBS, WEAK_VERBS } from '../dictionaries';
import type { ResumeTextSource } from '../similarity';

/**
 * Content-quality dimension (30% of the overall score).
 *
 * Two sub-criteria, weighted 40/30 in the legacy's `score.ts:411-412`
 * (we drop the third — readability — per the plan §"Hard constraints"
 * to avoid the `flesch-kincaid` + `syllable` npm deps):
 *   1. `accomplishmentRatio` — 40% — fraction of work-highlights that
 *      contain at least one digit. Bullets with numbers ("increased
 *      revenue by 23%", "led a team of 8") are the strongest signal
 *      of impact.
 *   2. `actionVerbUsage`     — 30% — fraction of work-highlights that
 *      START with a strong action verb (from `ACTION_VERBS`) and not
 *      a weak verb (from `WEAK_VERBS`).
 *
 * Readability was the third sub-criterion in the legacy. We drop it
 * because the plan §"Non-goals" lists it explicitly as deferred:
 * "Trivial follow-up if calibration warrants it." The weight freed
 * up (30%) gets split: 20% → accomplishment, 10% → action verbs.
 *
 * Drift from plan: the original plan §"Scope (in)" lists 40/30/30
 * weights with readability as the third sub-criterion. We ship with
 * 40/30 (no readability), so the weights shown here match the
 * plan-as-shipped.
 */

export type ContentQualityScore = {
  /** 0-100. Weighted average of `accomplishmentRatio` + `actionVerbUsage`. */
  value: number;
  breakdown: {
    /** 0-100. % of work-highlights that contain a digit. */
    accomplishmentRatio: number;
    /** 0-100. % of work-highlights that start with a strong action verb. */
    actionVerbUsage: number;
  };
};

const WEIGHTS = { accomplishment: 0.4, actionVerb: 0.3 } as const;

export function scoreContentQuality(resume: ResumeTextSource): ContentQualityScore {
  const highlights = collectHighlights(resume);
  if (highlights.length === 0) {
    return { value: 0, breakdown: { accomplishmentRatio: 0, actionVerbUsage: 0 } };
  }

  const withNumbers = highlights.filter((h) => /\d/.test(h)).length;
  const accomplishmentRatio = (withNumbers / highlights.length) * 100;

  const actionVerbUsage = calcActionVerbUsage(highlights);

  return {
    value:
      WEIGHTS.accomplishment * accomplishmentRatio +
      WEIGHTS.actionVerb * actionVerbUsage,
    breakdown: { accomplishmentRatio, actionVerbUsage }
  };
}

/**
 * Flatten every `work[*].positions[*].highlights` entry into one
 * list. Projects are deliberately excluded — they're optional and
 * don't carry the same "this is what I did every day" signal that
 * work entries do. (A user with no projects shouldn't be punished,
 * and a user with lots of projects shouldn't be rewarded twice.)
 */
function collectHighlights(resume: ResumeTextSource): string[] {
  const out: string[] = [];
  for (const job of resume.work) {
    for (const pos of job.positions) {
      if (pos.highlights) out.push(...pos.highlights);
    }
  }
  return out.filter((h) => typeof h === 'string' && h.trim().length > 0);
}

/**
 * Same logic as the legacy's `calcActionVerbUsage` (lines 217-227):
 *   - For each highlight, take the first word (after trim + split
 *     on whitespace).
 *   - If it's a weak verb ("made", "worked"), skip.
 *   - If it's a strong verb ("led", "shipped"), count it as 1.
 *   - Otherwise (e.g. "the", "typescript"), don't count it as either.
 *
 * Result is `(strongCount / totalCount) * 100`. Empty highlights
 * list → 0 (handled by the early-return above).
 */
function calcActionVerbUsage(highlights: string[]): number {
  if (highlights.length === 0) return 0;
  let strong = 0;
  for (const h of highlights) {
    const first = h.trim().split(/\s+/)[0]?.toLowerCase();
    if (!first || WEAK_VERBS.has(first)) continue;
    if (ACTION_VERBS.has(first)) strong++;
  }
  return (strong / highlights.length) * 100;
}
