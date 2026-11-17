/**
 * The dimension weights.
 *
 * ## Why this is its own file
 *
 * The scorecard's client bundle needs to know how much each dimension
 * is worth, so it can tell the candidate WHICH one to fix first ("you
 * are 28 points short on Keywords, which carries 21% of your score —
 * that is the biggest single win available").
 *
 * Importing them from `score.ts` would pull the whole scoring engine
 * into the client bundle. So the weights live here, and `score.ts`
 * re-exports them — one source of truth, two consumers.
 *
 * ## The weights themselves
 *
 * `WEIGHTS` (v1) and `WEIGHTS_V2` live as constants so calibration can
 * tune them without touching the function bodies. Per the plan
 * §"Risks" #1: "export the weights as constants, document the source
 * (legacy `score.ts` line numbers), and write a test that asserts the
 * top-level composition uses them — so a future calibration pass can
 * `git diff` what changed."
 *
 * `score.test.ts` asserts the composition uses them.
 */

export const WEIGHTS = {
  atsMatching: 0.3,
  structure: 0.2,
  contentQuality: 0.3,
  alignment: 0.2
} as const;

/**
 * v2 weights (Phase 2) — 7 dimensions. Used when the JD has
 * populated `mustHaveSkills` / `niceToHaveSkills` /
 * `implicitSkills` (i.e. the v2 intent extractor produced useful
 * output). Sum: 1.00 (0.70 from the four scaled v1 dimensions +
 * 0.30 from the three v2 dimensions = intent coverage + role fit +
 * seniority fit).
 *
 *   v1 dims scaled to 0.70 combined (down from Phase 1's 0.85):
 *     atsMatching × 0.21 (was 0.30)
 *     structure   × 0.14 (was 0.20)
 *     contentQuality × 0.21 (was 0.30)
 *     alignment   × 0.14 (was 0.20)
 *   Phase 2 v2 dims take the remaining 0.30:
 *     intentCoverage × 0.10 (down from Phase 1's 0.15 — Role Fit
 *                            and Seniority Fit share the carved-out
 *                            weight equally)
 *     roleFit × 0.10 (new)
 *     seniorityFit × 0.10 (new)
 */
export const WEIGHTS_V2 = {
  atsMatching: 0.21,
  structure: 0.14,
  contentQuality: 0.21,
  alignment: 0.14,
  intentCoverage: 0.10,
  roleFit: 0.10,
  seniorityFit: 0.10
} as const;

export type DimensionKey = keyof typeof WEIGHTS;
export type DimensionKeyV2 = keyof typeof WEIGHTS_V2;
