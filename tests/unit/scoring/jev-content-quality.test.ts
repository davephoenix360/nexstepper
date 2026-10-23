/**
 * Tests for the semantic Content Quality score.
 *
 * ## What it replaces
 *
 * The dimension used to measure two string properties:
 *
 *   1. does the bullet contain a DIGIT?
 *   2. does the bullet start with a verb from our ACTION_VERBS list?
 *
 * Both are proxies, and both leak. The digit test punishes candidates
 * in roles where numbers are not the currency, and the verb list does
 * not know "Architected", so a bullet starting with it earned no point
 * at all.
 *
 * The semantic version asks the same two questions as rubrics.
 */
import { describe, expect, it } from 'vitest';

import {
  scoreJevContentQuality,
  type JevContentQualityEvaluation
} from '@/lib/scoring/jev-content-quality';
import { scoreContentQuality } from '@/lib/scoring/dimensions/content-quality';

const BULLETS = [
  'Reduced API latency by 40% by migrating to a CDN, cutting load times in half',
  'Established a patient-support triage protocol that cut wait times',
  'Owned the manual QA pass for 6 product releases',
  'Architected the ledger service, scaling it to 12M users'
];

function evaluation(
  bullets: Array<{ impact: number; opening: number }>,
  ok = true
): JevContentQualityEvaluation {
  return {
    bullets: bullets.map((b, i) => ({ text: BULLETS[i]!, ...b })),
    ok
  };
}

describe('scoreJevContentQuality', () => {
  it('returns null when there is no usable evaluation', () => {
    expect(scoreJevContentQuality(BULLETS, null)).toBeNull();
    expect(scoreJevContentQuality(BULLETS, undefined)).toBeNull();
    expect(scoreJevContentQuality(BULLETS, evaluation([], false))).toBeNull();
  });

  it('returns null when the bullets do not match the evaluation', () => {
    // A different resume, or a re-ordered list, must not be scored
    // against the wrong bullets.
    expect(
      scoreJevContentQuality(BULLETS, {
        bullets: [{ text: 'something else', impact: 3, opening: 3 }],
        ok: true
      })
    ).toBeNull();
    expect(
      scoreJevContentQuality(BULLETS, {
        bullets: [
          { text: BULLETS[0]!, impact: 3, opening: 3 },
          { text: BULLETS[1]!, impact: 3, opening: 3 }
        ],
        ok: true
      })
    ).toBeNull();
  });

  it('scores a strong set of bullets near the top of the rubric', () => {
    const score = scoreJevContentQuality(
      BULLETS,
      evaluation([
        { impact: 3, opening: 3 },
        { impact: 2.5, opening: 2.8 },
        { impact: 0.4, opening: 2.9 },
        { impact: 2.8, opening: 3 }
      ])
    )!;
    // Mean impact 2.175/3 and mean opening 2.925/3.
    expect(score.breakdown.accomplishmentRatio).toBeCloseTo(72.5, 1);
    expect(score.breakdown.actionVerbUsage).toBeCloseTo(97.5, 1);
    expect(score.value).toBeGreaterThan(70);
  });

  it('scores a set of duties near the bottom', () => {
    const score = scoreJevContentQuality(
      BULLETS,
      evaluation([
        { impact: 0.6, opening: 2.9 },
        { impact: 0.2, opening: 1.2 },
        { impact: 0.4, opening: 2.8 },
        { impact: 1.0, opening: 2.9 }
      ])
    )!;
    expect(score.breakdown.accomplishmentRatio).toBeCloseTo(18.3, 1);
    expect(score.value).toBeLessThan(50);
  });

  it('never credits a bullet the resume did not write', () => {
    const score = scoreJevContentQuality(
      BULLETS,
      evaluation([
        { impact: 0, opening: 0 },
        { impact: 0, opening: 0 },
        { impact: 0, opening: 0 },
        { impact: 0, opening: 0 }
      ])
    )!;
    expect(score.value).toBe(0);
  });
});

describe('the dimension', () => {
  const resume = {
    basics: { summary: '', label: '' },
    skills: [],
    work: [
      {
        summary: '',
        positions: [
          { title: 'Engineer', highlights: [...BULLETS] }
        ]
      }
    ],
    projects: []
  };

  it('uses the lexical score when Jev did not run', () => {
    const lexical = scoreContentQuality(resume);
    expect(lexical.value).toBeGreaterThan(0);
    // "Owned the manual QA pass for 6 product releases" has a digit, so
    // the lexical accomplishment ratio counts three of four.
    expect(lexical.breakdown.accomplishmentRatio).toBe(75);
  });

  it('uses the semantic score when Jev did', () => {
    const semantic = scoreContentQuality(resume, {
      jev: evaluation([
        { impact: 3, opening: 3 },
        { impact: 2, opening: 2 },
        { impact: 0.3, opening: 2.9 },
        { impact: 2.5, opening: 3 }
      ])
    });
    expect(semantic.breakdown.accomplishmentRatio).toBeCloseTo(65, 1);
  });

  it('falls back to the lexical score when the evaluation does not match', () => {
    const result = scoreContentQuality(resume, {
      jev: {
        bullets: [{ text: 'a different bullet', impact: 3, opening: 3 }],
        ok: true
      }
    });
    expect(result.breakdown.accomplishmentRatio).toBe(75);
  });
});
