import { ACTION_VERBS, WEAK_VERBS } from '../dictionaries';
import type { ResumeTextSource } from '../similarity';

/**
 * Content-quality dimension (21% of the overall v2 score).
 *
 * Two sub-criteria, in a 4:3 ratio, normalised back onto 0-100:
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
 * "Trivial follow-up if calibration warrants it." Its 30% was folded
 * into the two survivors (20% → accomplishment, 10% → action verbs),
 * which is why the raw weights total 0.7 — hence `WEIGHT_SUM` below.
 *
 * Known fairness concern, not yet addressed: quantifying impact is
 * genuinely unevenly available across fields, so this sub-criterion
 * scores honest candidates in less numerate roles lower. It is weighted
 * 0.21 — more than Intent Coverage (0.10), which is the dimension that
 * actually measures JD match. See
 * `docs/drift/2026-10-01-ats-scoring-review.md` §4.
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

/**
 * Sum of the sub-weights, used to normalise `value` back onto 0-100.
 *
 * The weights total **0.7**, not 1.0: readability was dropped as a third
 * sub-criterion and its 30% was never redistributed, so `value` was being
 * emitted on a 0-70 scale while its own docstring and the scorecard both
 * describe it as 0-100. A resume with *every* bullet quantified *and* every
 * bullet starting with a strong action verb scored 70, not 100 — and the
 * dimension carries 0.21 of the overall score, so 6.3 points of the 100-point
 * scale were structurally unreachable.
 *
 * Normalising by the running sum (rather than hardcoding a 0.7 divisor) keeps
 * the intended 4:3 ratio between the two surviving criteria and stays correct
 * if a weight is ever changed again.
 */
const WEIGHT_SUM = WEIGHTS.accomplishment + WEIGHTS.actionVerb;

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
      (WEIGHTS.accomplishment * accomplishmentRatio +
        WEIGHTS.actionVerb * actionVerbUsage) /
      WEIGHT_SUM,
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
