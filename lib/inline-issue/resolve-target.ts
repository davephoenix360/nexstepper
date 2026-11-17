/**
 * Which leaf does a click target?
 *
 * ## The bug this pins
 *
 * The controller resolves a click's target in this order:
 *
 *   1. an explicit `path` the caller supplied,
 *   2. the `matchBreakdown` row for that criterion,
 *   3. the `defaultPathForCriterion` heuristic.
 *
 * And the scorecard's dimension-bar click **always supplied step 1**:
 *
 * ```ts
 * controller.trigger({
 *   path: defaultPathForCriterion(input.criterion),  // ← always
 *   criterion: input.criterion
 * });
 * ```
 *
 * So step 2 — the server's per-criterion target, which is the row that
 * points at the bullet the ADVICE NAMES — was never consulted. The
 * click always landed on the heuristic's bullet: the first work bullet.
 *
 * Reported as: *"the AI always tries to improve the top experience
 * bullet instead of one of the ones that were highlighted in the
 * message."* Exactly right.
 *
 * The fix is to make the client stop deciding targets: a dimension click
 * says WHICH criterion, and the server's breakdown says WHICH leaf.
 */
import { defaultPathForCriterion } from './criterion-to-path';
import type { SubCriterionKey } from './types';
import type { MatchBreakdown } from '@/lib/db/queries';

/**
 * Resolve the leaf a click targets.
 *
 * @param breakdown The server-rendered per-criterion rows. This is the
 *   authority: it was built with the resume in hand, so it can point at
 *   the bullet the advice names.
 * @param criterion The criterion the user clicked.
 * @param explicitPath Set ONLY when the user clicked a specific leaf in
 *   the editor (an inline issue) — then that leaf is the target, full
 *   stop. Dimension and skill clicks leave it undefined so the
 *   breakdown decides.
 */
export function resolveTargetPath(
  breakdown: MatchBreakdown | undefined,
  criterion: SubCriterionKey,
  explicitPath?: string
): string {
  if (explicitPath) return explicitPath;
  const row = breakdown?.find((r) => r.criterion === criterion);
  // An empty path is a broken row, not a usable target — the heuristic
  // is a better answer than an empty string.
  if (row?.path) return row.path;
  return defaultPathForCriterion(criterion);
}
