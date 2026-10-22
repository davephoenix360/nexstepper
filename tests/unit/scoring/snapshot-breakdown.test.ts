/**
 * The variant page must render the score the last recompute produced.
 *
 * ## The bug this pins
 *
 * The user pressed Recompute and watched the number change twice:
 *
 *   1. the action returned the ENHANCED breakdown (Jev's requirement
 *      measurement) — keywords 37 → 66, overall 51 → 57;
 *   2. `revalidatePath` re-rendered the page, and the RSC handed the
 *      client a freshly computed SYNC breakdown — keywords back to 37,
 *      overall back to 51;
 *   3. the client's `useEffect` replaced the value it had just set.
 *
 * The persisted headline (`match_score`) said 57 while the screen said
 * 51. The user described it exactly: "it shows fifty seven, then it
 * goes back to fifty one".
 *
 * The fix: the page renders the breakdown the last recompute persisted.
 * Only a resume with no snapshot yet computes one on the spot.
 */
import { describe, expect, it, vi } from 'vitest';

import { resolveRenderedBreakdown } from '@/lib/scoring/snapshot-breakdown';
import type { ScoreBreakdown } from '@/lib/scoring';

function makeBreakdown(overallScore: number, keyword: number): ScoreBreakdown {
  return {
    overallScore,
    dimensionScores: {
      atsMatching: keyword,
      structure: 80,
      contentQuality: 70,
      alignment: 60,
      intentCoverage: 90,
      roleFit: 50,
      seniorityFit: 50
    },
    criteriaScores: {
      'ATS Keyword Match': keyword,
      'ATS Similarity': 90,
      'ATS Coverage': 80,
      'Intent Coverage': 90,
      'Section Completeness': 100,
      'Optimal Length': 70,
      'Accomplishment Focus': 70,
      'Action Verb Usage': 80,
      Tailoring: 60,
      'Unique Value': 50,
      'Role Fit': 50,
      'Seniority Fit': 50,
      'Soft Skills': 50
    },
    computedInMs: 4,
    intentCoverageBreakdown: {
      value: 90,
      missed: { mustHave: [], niceToHave: [], implicit: [] },
      penalty: 0,
      fallback: false,
      eligibility: []
    }
  };
}

describe('resolveRenderedBreakdown', () => {
  it('renders the persisted breakdown when there is one', () => {
    const compute = vi.fn(() => makeBreakdown(51, 37));
    const persisted = makeBreakdown(57, 66);

    const result = resolveRenderedBreakdown({ persisted, compute });

    expect(result.overallScore).toBe(57);
    expect(result.criteriaScores['ATS Keyword Match']).toBe(66);
    // The expensive path must NOT run when there is a snapshot.
    expect(compute).not.toHaveBeenCalled();
  });

  it('computes the score when there is no snapshot yet', () => {
    const compute = vi.fn(() => makeBreakdown(51, 37));

    const result = resolveRenderedBreakdown({ persisted: null, compute });

    expect(result.overallScore).toBe(51);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('computes the score when the snapshot predates the breakdown column', () => {
    // Snapshots written before the column existed have `breakdown: null`.
    const compute = vi.fn(() => makeBreakdown(51, 37));

    const result = resolveRenderedBreakdown({ persisted: null, compute });

    expect(result.overallScore).toBe(51);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('ignores a malformed persisted breakdown rather than rendering it', () => {
    // A truncated or hand-edited row must not blank the scorecard.
    const compute = vi.fn(() => makeBreakdown(51, 37));

    for (const bad of [
      {},
      { overallScore: 'fifty one' },
      { overallScore: 57 },
      { overallScore: Number.NaN },
      'not an object',
      42
    ]) {
      const result = resolveRenderedBreakdown({ persisted: bad, compute });
      expect(result.overallScore).toBe(51);
    }
    expect(compute).toHaveBeenCalledTimes(6);
  });
});
