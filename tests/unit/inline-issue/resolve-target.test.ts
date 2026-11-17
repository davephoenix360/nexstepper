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
 * So step 2 — the server's per-criterion target, the row that points at
 * the bullet the ADVICE NAMES — was never consulted. Every dimension
 * click landed on the heuristic's leaf: the FIRST work bullet.
 *
 * Reported as: *"the AI always tries to improve the top experience
 * bullet instead of one of the ones that were highlighted in the
 * message."*
 *
 * The fix: the client stops deciding targets. A dimension click says
 * WHICH CRITERION; the server's breakdown says WHICH LEAF.
 */
import { describe, expect, it } from 'vitest';

import { resolveTargetPath } from '@/lib/inline-issue/resolve-target';
import { defaultPathForCriterion } from '@/lib/inline-issue/criterion-to-path';
import type { MatchBreakdown } from '@/lib/db/queries';

const BREAKDOWN: MatchBreakdown = [
  {
    path: 'sections.work.1.positions.0.highlights.1',
    weight: 0.5,
    criterion: 'Accomplishment Focus',
    tipKind: 'rewrite'
  },
  {
    path: 'sections.work.0.positions.0.highlights.0',
    weight: 0.4,
    criterion: 'ATS Keyword Match',
    tipKind: 'gap'
  }
];

describe('resolveTargetPath', () => {
  it('uses the breakdown row when no explicit path is given', () => {
    // This is the fix: the dimension click says which CRITERION, and
    // the breakdown says which LEAF.
    expect(resolveTargetPath(BREAKDOWN, 'Accomplishment Focus')).toBe(
      'sections.work.1.positions.0.highlights.1'
    );
  });

  it('falls back to the heuristic when there is no breakdown', () => {
    expect(resolveTargetPath(undefined, 'Accomplishment Focus')).toBe(
      defaultPathForCriterion('Accomplishment Focus')
    );
    expect(resolveTargetPath([], 'Accomplishment Focus')).toBe(
      defaultPathForCriterion('Accomplishment Focus')
    );
  });

  it('falls back to the heuristic when the breakdown has no row for the criterion', () => {
    expect(resolveTargetPath(BREAKDOWN, 'Tailoring')).toBe(
      defaultPathForCriterion('Tailoring')
    );
  });

  it('lets an EXPLICIT path win — the user clicked that leaf', () => {
    // An inline issue: the user clicked a specific bullet in the
    // editor, so that bullet IS the target, full stop.
    expect(
      resolveTargetPath(BREAKDOWN, 'Accomplishment Focus', 'sections.work.2.positions.0.highlights.0')
    ).toBe('sections.work.2.positions.0.highlights.0');
  });

  it('falls back to the heuristic when the breakdown row has an empty path', () => {
    const empty: MatchBreakdown = [
      { path: '', weight: 0, criterion: 'Accomplishment Focus', tipKind: 'rewrite' }
    ];
    // An empty path is a broken row, not a usable target — the
    // heuristic is the better answer than an empty string.
    expect(resolveTargetPath(empty, 'Accomplishment Focus')).toBe(
      defaultPathForCriterion('Accomplishment Focus')
    );
  });
});
