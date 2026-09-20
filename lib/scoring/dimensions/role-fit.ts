/**
 * v2 Role Fit dimension (sync scoring surface).
 *
 * Plan: docs/plans/ats-scoring-v2.md (Phase 2).
 *
 * Companion to `lib/scoring-async/role-fit.ts`. The async module
 * owns the model load + embedding compute; this sync module takes
 * a pre-computed similarity value and turns it into a 0-100 score
 * for the sync engine. This keeps the engine pure (no async) while
 * still allowing Phase 2's Role Fit dimension to live inside it.
 *
 * Pattern matches `lib/scoring/dimensions/intent-coverage.ts`
 * (which has both a params-based sync entry point and an envelope-
 * aware convenience wrapper). Same idea here, just shorter because
 * the async wrapper does the heavy lifting.
 */

export interface RoleFitBreakdown {
  /** 0-100. Higher = the resume title best matches the JD title. */
  value: number;
  /**
   * Cosine similarity in [0, 1] that produced `value`. Null when
   * no comparison was made (no JD title OR no resume titles).
   */
  similarity: number | null;
  /** True when no usable title signal was available (fallback to neutral). */
  fallback: boolean;
}

/** Neutral score when no usable title signal is present. */
export const NEUTRAL_ROLE_FIT_SCORE = 50;

/**
 * Sync entry point. Takes a pre-computed similarity in [0, 1].
 * Returns the neutral score when similarity is null.
 *
 * Maps similarity → score by `Math.round(similarity * 100)` —
 * already in the same units as the other sub-criteria. Pure / sync.
 */
export function scoreRoleFitParams(params: {
  /** [0, 1] cosine similarity between JD title and the best-matching resume title. */
  similarity: number | null;
}): RoleFitBreakdown {
  const { similarity } = params;
  if (similarity === null) {
    return {
      value: NEUTRAL_ROLE_FIT_SCORE,
      similarity: null,
      fallback: true
    };
  }
  return {
    value: Math.round(similarity * 100),
    similarity,
    fallback: false
  };
}
