/**
 * Which dimension is worth the candidate's time first?
 *
 * ## The problem this pins
 *
 * The scorecard shows seven bars in a FIXED order. A candidate cannot
 * tell where to spend their time — the bars are in an order of
 * layout, not an order of opportunity.
 *
 * The measure is `weight × (100 − score)`: how many points of the
 * OVERALL score a dimension is leaving on the table.
 *
 * The weight is the part that matters. A dimension at 50 carrying 21%
 * of the score is worth more than one at 50 carrying 10%, so ranking
 * by the raw score would point the candidate at the wrong bar.
 */
import { describe, expect, it } from 'vitest';

import { biggestRecoverableWin, recoverableWins } from '@/lib/scoring/priority';

const V2 = { useV2Weights: true };
const V1 = { useV2Weights: false };

describe('biggestRecoverableWin', () => {
  it('picks the dimension with the most recoverable points', () => {
    // Keywords: 0.21 × (100 − 40) = 12.6
    // Impact:   0.21 × (100 − 70) =  6.3
    // Format:   0.14 × (100 − 85) =  2.1
    const win = biggestRecoverableWin(
      {
        atsMatching: 40,
        structure: 85,
        contentQuality: 70,
        alignment: 95,
        intentCoverage: 100,
        roleFit: 100,
        seniorityFit: 100
      },
      V2
    );
    expect(win?.dimension).toBe('atsMatching');
    expect(win?.label).toBe('Keywords');
    expect(win?.points).toBeCloseTo(12.6, 5);
  });

  it('prefers the HEAVIER dimension when the scores are equal', () => {
    // Both at 50. Keywords carries 21%, Seniority fit carries 10%.
    const win = biggestRecoverableWin(
      {
        atsMatching: 50,
        structure: 100,
        contentQuality: 100,
        alignment: 100,
        intentCoverage: 100,
        roleFit: 100,
        seniorityFit: 50
      },
      V2
    );
    expect(win?.dimension).toBe('atsMatching');
  });

  it('returns null when there is nothing worth pointing at', () => {
    const win = biggestRecoverableWin(
      {
        atsMatching: 100,
        structure: 100,
        contentQuality: 100,
        alignment: 100,
        intentCoverage: 100,
        roleFit: 100,
        seniorityFit: 100
      },
      V2
    );
    expect(win).toBeNull();
  });

  it('does not offer a v2 dimension when the engine is using v1 weights', () => {
    // Under the v1 weight set the three v2 dimensions carry zero, so
    // a broken Role Fit must not be offered as a win — the engine is
    // not using it.
    const win = biggestRecoverableWin(
      {
        atsMatching: 100,
        structure: 100,
        contentQuality: 100,
        alignment: 100,
        intentCoverage: 100,
        roleFit: 20,
        seniorityFit: 20
      },
      V1
    );
    expect(win).toBeNull();
  });

  it('ignores a dimension whose score is missing', () => {
    const win = biggestRecoverableWin(
      {
        atsMatching: 40,
        structure: 100,
        contentQuality: 100,
        alignment: 100,
        intentCoverage: 100,
        roleFit: 100,
        seniorityFit: 100
      } as never,
      V2
    );
    expect(win?.dimension).toBe('atsMatching');
  });
});

describe('recoverableWins', () => {
  it('orders every dimension by recoverable points, biggest first', () => {
    const wins = recoverableWins(
      {
        atsMatching: 40,
        structure: 85,
        contentQuality: 70,
        alignment: 95,
        intentCoverage: 90,
        roleFit: 100,
        seniorityFit: 100
      },
      V2
    );
    expect(wins.map((w) => w.dimension)).toEqual([
      'atsMatching', // 0.21 × 60 = 12.6
      'contentQuality', // 0.21 × 30 =  6.3
      'structure', // 0.14 × 15 =  2.1
      'intentCoverage', // 0.10 × 10 =  1.0
      'alignment' // 0.14 ×  5 =  0.7
    ]);
    // Points are non-increasing.
    for (let i = 1; i < wins.length; i++) {
      expect(wins[i]!.points).toBeLessThanOrEqual(wins[i - 1]!.points);
    }
  });

  it('omits the v2 dimensions under v1 weights', () => {
    const wins = recoverableWins(
      {
        atsMatching: 40,
        structure: 85,
        contentQuality: 70,
        alignment: 95,
        intentCoverage: 10,
        roleFit: 10,
        seniorityFit: 10
      },
      V1
    );
    expect(wins.map((w) => w.dimension)).not.toContain('intentCoverage');
    expect(wins.map((w) => w.dimension)).not.toContain('roleFit');
    expect(wins.map((w) => w.dimension)).not.toContain('seniorityFit');
  });
});
