/**
 * Which dimension should the candidate fix first?
 *
 * ## The problem this solves
 *
 * The scorecard shows seven bars. A candidate looking at "Keywords 54,
 * Format 86, Impact 62, Experience match 83, Intent coverage 100, Role
 * fit 92, Seniority fit 100" cannot tell where to spend their time —
 * the bars are in a fixed order, not an order of opportunity.
 *
 * ## The measure
 *
 * **Recoverable points**: how many points of the OVERALL score a
 * dimension is currently leaving on the table, given the dimension's
 * weight.
 *
 *     recoverable = weight × (100 − dimensionScore)
 *
 * That is the honest ceiling: it assumes the dimension could be made
 * perfect, which it may not be. The surface says so — "up to N points"
 * — rather than promising N points.
 *
 * ## Why the weight matters
 *
 * A dimension at 50 that carries 21% of the score is worth more than a
 * dimension at 50 that carries 10%. Ranking by the raw score would
 * point the candidate at the wrong bar.
 *
 * ## Which weight set
 *
 * The same choice the engine makes: `WEIGHTS_V2` when the JD produced
 * usable v2 intent data, `WEIGHTS` (v1, four dimensions) otherwise.
 * The v2 dimensions score 0 in the v1 weight set, so they are not
 * offered as a "win" when the engine is not using them.
 */
import { WEIGHTS, WEIGHTS_V2, type DimensionKeyV2 } from './weights';

export type RecoverableWin = {
  /** The engine's dimension key. */
  dimension: DimensionKeyV2;
  /** The label the scorecard shows for it. */
  label: string;
  /** The dimension's current score. */
  score: number;
  /** Its share of the overall score. */
  weight: number;
  /** Points of the overall score a perfect score here would add. */
  points: number;
};

/**
 * The scorecard's own labels for the seven dimensions.
 *
 * They live here rather than in the component so the helper and the
 * surface cannot disagree about what a dimension is called.
 */
export const DIMENSION_LABELS: Record<DimensionKeyV2, string> = {
  atsMatching: 'Keywords',
  structure: 'Format',
  contentQuality: 'Impact',
  alignment: 'Experience match',
  intentCoverage: 'Intent coverage',
  roleFit: 'Role fit',
  seniorityFit: 'Seniority fit'
};

/** Below this, a dimension is close enough to perfect that it is not a "win". */
const MIN_RECOVERABLE_POINTS = 0.5;

export type DimensionScores = Record<DimensionKeyV2, number>;

/**
 * The weight set the engine is actually using.
 *
 * The v1 set gives the three v2 dimensions zero weight, so they are
 * never offered as a "win" when the engine is not using them.
 */
function weightsFor(useV2Weights: boolean): Record<DimensionKeyV2, number> {
  if (useV2Weights) return WEIGHTS_V2 as Record<DimensionKeyV2, number>;
  return {
    atsMatching: WEIGHTS.atsMatching,
    structure: WEIGHTS.structure,
    contentQuality: WEIGHTS.contentQuality,
    alignment: WEIGHTS.alignment,
    intentCoverage: 0,
    roleFit: 0,
    seniorityFit: 0
  };
}

/**
 * The dimension with the most recoverable points, or null when there
 * is nothing worth pointing at.
 *
 * Returns null when every dimension is already at (or near) 100 — a
 * candidate with nothing to fix should not be told to fix something.
 */
export function biggestRecoverableWin(
  dimensionScores: DimensionScores,
  options: { useV2Weights: boolean }
): RecoverableWin | null {
  const weights = weightsFor(options.useV2Weights);

  let best: RecoverableWin | null = null;

  for (const dimension of Object.keys(weights) as DimensionKeyV2[]) {
    const weight = weights[dimension];
    if (weight <= 0) continue;
    const score = dimensionScores[dimension];
    if (typeof score !== 'number') continue;
    const points = weight * (100 - score);
    if (points < MIN_RECOVERABLE_POINTS) continue;
    if (best && points <= best.points) continue;
    best = {
      dimension,
      label: DIMENSION_LABELS[dimension],
      score,
      weight,
      points
    };
  }

  return best;
}

/**
 * Every dimension's recoverable points, biggest first.
 *
 * Used by the scorecard's "what else" list, and by the tests that
 * assert the ranking.
 */
export function recoverableWins(
  dimensionScores: DimensionScores,
  options: { useV2Weights: boolean }
): RecoverableWin[] {
  const weights = weightsFor(options.useV2Weights);

  return (Object.keys(DIMENSION_LABELS) as DimensionKeyV2[])
    .map((dimension) => {
      const weight = weights[dimension];
      const score = dimensionScores[dimension];
      return {
        dimension,
        label: DIMENSION_LABELS[dimension],
        score,
        weight,
        points: weight * (100 - score)
      } satisfies RecoverableWin;
    })
    .filter((w) => w.weight > 0 && w.points >= MIN_RECOVERABLE_POINTS)
    .sort((a, b) => b.points - a.points);
}
