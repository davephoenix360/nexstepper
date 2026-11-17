/**
 * The sub-criteria behind each dimension — one canonical map.
 *
 * ## Why this file exists
 *
 * The scorecard shows SEVEN dimension bars, and each bar is made of
 * sub-criteria ("Impact" = Accomplishment Focus + Action Verb Usage).
 * Two surfaces need to talk about those sub-criteria:
 *
 *   1. the scorecard's drill-down (which criterion does this bar
 *      open?), and
 *   2. the chat agent (which sub-criterion is the weakest thing to
 *      fix?).
 *
 * The chat agent used to see ONLY the dimension numbers, so it could
 * not answer "what exactly is weak here?" — it guessed. And the
 * mapping from a criterion to its dimension lived in
 * `lib/inline-issue/dimension-criteria.ts`, where the chat could not
 * reach it. One list, one place.
 *
 * ## The "not measured" distinction — the important part
 *
 * Three of the twelve criteria can return a **neutral default**
 * instead of a measurement:
 *
 *   - **Intent Coverage** — v2 intent extraction did not run, so the
 *     criterion mirrors the keyword score instead of measuring
 *     requirement coverage.
 *   - **Role Fit** — there was no title to compare against.
 *   - **Seniority Fit** — the JD stated no years, or the resume has
 *     no work history to read years from.
 *
 * In every one of those cases the number is **50** — a value that
 * LOOKS like a mediocre score but means "we could not measure this".
 * Reporting one of them as "your weakest sub-criterion" would send
 * the candidate to fix something that is not broken, and would make
 * the agent's advice actively wrong.
 *
 * This is the same lesson the engine has learned three times: a
 * constant is a smell, and a value that means "could not measure" is
 * not a value that means "measured badly".
 *
 * So every criterion row carries a MEASUREMENT status, and the
 * weakest sub-criterion is chosen only among the rows that were
 * genuinely measured.
 */
import type { ScoreBreakdown } from './score';
import { NEUTRAL_ROLE_FIT_SCORE } from './dimensions/role-fit';
import { NEUTRAL_SENIORITY_FIT_SCORE } from './dimensions/seniority-fit';

/**
 * The canonical criterion → dimension map.
 *
 * The dimension labels are the scorecard's own ("Keywords", "Format",
 * "Impact", "Experience match", "Intent coverage", "Role fit",
 * "Seniority fit") — the same strings the bars carry — so the chat
 * agent and the scorecard name the same things.
 *
 * The key order is the display order: grouped by dimension, the
 * dimensions in the order the scorecard shows them.
 */
export const CRITERION_DIMENSIONS = {
  'ATS Keyword Match': 'Keywords',
  'ATS Similarity': 'Keywords',
  'Section Completeness': 'Format',
  'Optimal Length': 'Format',
  'Accomplishment Focus': 'Impact',
  'Action Verb Usage': 'Impact',
  Tailoring: 'Experience match',
  'Unique Value': 'Experience match',
  'Soft Skills': 'Experience match',
  'Intent Coverage': 'Intent coverage',
  'Role Fit': 'Role fit',
  'Seniority Fit': 'Seniority fit'
} as const;

/** A sub-criterion name. */
export type CriterionName = keyof typeof CRITERION_DIMENSIONS;

/** The dimension a sub-criterion belongs to. */
export type CriterionDimension =
  (typeof CRITERION_DIMENSIONS)[CriterionName];

/**
 * Whether a criterion's number is a MEASUREMENT or a neutral default.
 *
 * - `measured` — the engine measured something and the number is it.
 * - `not-measured` — there was no signal, so the number is the
 *   engine's neutral default and is NOT a weakness to fix.
 */
export type CriterionMeasurement = 'measured' | 'not-measured';

export interface CriterionRow {
  criterion: CriterionName;
  dimension: CriterionDimension;
  score: number;
  measurement: CriterionMeasurement;
  /**
   * Why this criterion could not be measured. Present only for
   * `not-measured` rows.
   */
  note?: string;
}

/**
 * The measurement status of one criterion, plus the reason when it
 * could not be measured.
 *
 * ## The "no signal recorded" case
 *
 * `breakdown.roleFit` / `breakdown.seniorityFit` are carried on the
 * breakdown so the status is EXACT. But score snapshots are persisted
 * — a snapshot written before those blocks existed has neither. For
 * those rows we cannot tell whether the 50 is a measurement or the
 * neutral default, so we apply the engine's own rule: **a reading
 * that is exactly the neutral constant, with no signal recorded, is
 * the neutral default.** Anything else (a non-50 reading) is treated
 * as a measurement, because the engine only produces a non-neutral
 * value when it had a signal.
 */
function measurementFor(
  criterion: CriterionName,
  breakdown: ScoreBreakdown,
  score: number
): { measurement: CriterionMeasurement; note?: string } {
  switch (criterion) {
    case 'Intent Coverage': {
      if (breakdown.intentCoverageBreakdown?.fallback) {
        return {
          measurement: 'not-measured',
          note: 'v2 intent extraction was unavailable — this mirrors the keyword match'
        };
      }
      return { measurement: 'measured' };
    }
    case 'Role Fit': {
      const fallback = breakdown.roleFit?.fallback;
      if (fallback === true) {
        return {
          measurement: 'not-measured',
          note: 'no title signal to compare against'
        };
      }
      if (fallback === undefined && score === NEUTRAL_ROLE_FIT_SCORE) {
        return {
          measurement: 'not-measured',
          note: 'no signal recorded for this score — the reading is the engine default'
        };
      }
      return { measurement: 'measured' };
    }
    case 'Seniority Fit': {
      const fallback = breakdown.seniorityFit?.fallback;
      if (fallback === true) {
        return {
          measurement: 'not-measured',
          note: 'no years signal to compare against'
        };
      }
      if (fallback === undefined && score === NEUTRAL_SENIORITY_FIT_SCORE) {
        return {
          measurement: 'not-measured',
          note: 'no signal recorded for this score — the reading is the engine default'
        };
      }
      return { measurement: 'measured' };
    }
    default:
      return { measurement: 'measured' };
  }
}

/**
 * Every sub-criterion of the score, with its dimension, its number
 * and whether that number is a measurement.
 *
 * Criteria missing from the breakdown (an older persisted snapshot)
 * are skipped rather than reported as zero.
 */
export function criterionRows(breakdown: ScoreBreakdown): CriterionRow[] {
  const criteria = (breakdown.criteriaScores ?? {}) as Record<
    string,
    number | undefined
  >;

  const rows: CriterionRow[] = [];
  for (const criterion of Object.keys(
    CRITERION_DIMENSIONS
  ) as CriterionName[]) {
    const score = criteria[criterion];
    if (typeof score !== 'number' || !Number.isFinite(score)) continue;
    const { measurement, note } = measurementFor(criterion, breakdown, score);
    rows.push({
      criterion,
      dimension: CRITERION_DIMENSIONS[criterion],
      score,
      measurement,
      ...(note ? { note } : {})
    });
  }
  return rows;
}

/**
 * The weakest sub-criterion that was actually MEASURED.
 *
 * Returns null when nothing was measured (nothing to point at) —
 * a candidate with nothing to fix should not be told to fix
 * something, the same rule the dimension-level "Start here" follows.
 */
export function weakestMeasuredCriterion(
  rows: CriterionRow[]
): CriterionRow | null {
  let weakest: CriterionRow | null = null;
  for (const row of rows) {
    if (row.measurement !== 'measured') continue;
    if (!weakest || row.score < weakest.score) weakest = row;
  }
  return weakest;
}

/**
 * The weakest measured sub-criterion of a breakdown, in one call.
 */
export function weakestCriterionOf(
  breakdown: ScoreBreakdown
): CriterionRow | null {
  return weakestMeasuredCriterion(criterionRows(breakdown));
}
