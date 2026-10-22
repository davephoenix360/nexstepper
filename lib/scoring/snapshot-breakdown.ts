import type { ScoreBreakdown } from './score';

/**
 * Choose the breakdown the variant page renders.
 *
 * ## The bug this exists to prevent
 *
 * The page used to recompute the ATS score with the SYNC engine on every
 * render. The Recompute button runs the ENHANCED engine (BM25 + semantic
 * embeddings + Jev's requirement measurement), so:
 *
 *   1. the user pressed Recompute and saw the enhanced score —
 *      keywords 37 → 66, overall 51 → 57;
 *   2. the action called `revalidatePath`, the page re-rendered, and the
 *      RSC handed the client a fresh SYNC breakdown — keywords back to
 *      37, overall back to 51;
 *   3. the client's `useEffect` replaced the value it had just set.
 *
 * So the number changed twice, less than a second apart, and the
 * persisted headline (`match_score`) disagreed with the rendered one the
 * whole time.
 *
 * ## The rule
 *
 * Render the breakdown the last recompute produced. Only when there is
 * no snapshot yet — a resume that has never been scored, or one scored
 * before the snapshot carried a breakdown — do we compute it here, and
 * that path is the sync engine, which is pure, instant and free.
 *
 * @param persisted The `breakdown` column of the latest score snapshot.
 *   Unknown-shaped values are ignored rather than trusted.
 * @param compute Computes the score from scratch. Only called when there
 *   is no usable persisted breakdown.
 */
export function resolveRenderedBreakdown(params: {
  persisted: unknown;
  compute: () => ScoreBreakdown;
}): ScoreBreakdown {
  const persisted = params.persisted as ScoreBreakdown | null | undefined;

  if (
    persisted &&
    typeof persisted === 'object' &&
    typeof (persisted as ScoreBreakdown).overallScore === 'number' &&
    Number.isFinite((persisted as ScoreBreakdown).overallScore) &&
    (persisted as ScoreBreakdown).dimensionScores &&
    (persisted as ScoreBreakdown).criteriaScores
  ) {
    return persisted as ScoreBreakdown;
  }

  return params.compute();
}
