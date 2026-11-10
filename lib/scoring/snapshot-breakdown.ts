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
  return resolveRenderedBreakdownWithSource(params).breakdown;
}

/**
 * Where the rendered breakdown came from.
 *
 * - `snapshot` — the breakdown the last recompute persisted. This is the
 *   number the scorecard shows, so it is the number every surface must
 *   quote.
 * - `computed` — no usable snapshot existed, so the score was computed
 *   on the spot with the sync engine.
 */
export type RenderedBreakdownSource = 'snapshot' | 'computed';

/**
 * The same rule as `resolveRenderedBreakdown`, but it also says WHICH
 * rule fired.
 *
 * ## Why the source matters
 *
 * A surface that quotes a score to the user has to know whether it is
 * quoting the number on their screen or a fallback the screen never
 * showed. The chat agent is the case that bites: if it quotes a
 * freshly-computed sync score while the scorecard renders the
 * persisted hybrid score, the two numbers disagree and the agent looks
 * like it is making things up.
 *
 * So the resolver returns the provenance, and the caller can say
 * "this is your score" (snapshot) or "this is a keyword-only estimate;
 * press Recompute for the full score" (computed).
 */
export function resolveRenderedBreakdownWithSource(params: {
  persisted: unknown;
  compute: () => ScoreBreakdown;
}): { breakdown: ScoreBreakdown; source: RenderedBreakdownSource } {
  const persisted = params.persisted as ScoreBreakdown | null | undefined;

  if (
    persisted &&
    typeof persisted === 'object' &&
    typeof (persisted as ScoreBreakdown).overallScore === 'number' &&
    Number.isFinite((persisted as ScoreBreakdown).overallScore) &&
    (persisted as ScoreBreakdown).dimensionScores &&
    (persisted as ScoreBreakdown).criteriaScores
  ) {
    return { breakdown: persisted as ScoreBreakdown, source: 'snapshot' };
  }

  return { breakdown: params.compute(), source: 'computed' };
}
