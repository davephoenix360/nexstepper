import { describe, expect, it } from 'vitest';

import { scoreContentQuality } from '@/lib/scoring/dimensions/content-quality';
import type { ResumeTextSource } from '@/lib/scoring/similarity';

/**
 * Locks the content-quality dimension in isolation. Two sub-criteria:
 *   - accomplishmentRatio (40%): % of work-highlights containing a digit.
 *   - actionVerbUsage     (30%): % of work-highlights starting with a
 *     strong action verb (and not a weak one).
 *
 * No JD interaction — content quality is a property of the resume
 * alone.
 *
 * Drift from plan §"Scope (in)": the legacy had a third sub-criterion
 * (readability via Flesch-Kincaid). We drop it per plan §"Non-goals"
 * to avoid the `flesch-kincaid` + `syllable` npm deps. The weights
 * here are 40/30 (sum to 70%); the legacy's were 40/30/30 (sum to
 * 100%). The dimension value is therefore bounded above by 70 ×
 * max-sub-score, not 100 × max-sub-score.
 */

function buildResume(highlights: string[]): ResumeTextSource {
  return {
    basics: {},
    skills: [],
    work: [
      {
        summary: '',
        positions: [{ title: 'Engineer', highlights }]
      }
    ]
  };
}

describe('scoreContentQuality', () => {
  it('returns 0 for a resume with no highlights', () => {
    const result = scoreContentQuality(buildResume([]));
    expect(result.value).toBe(0);
    expect(result.breakdown.accomplishmentRatio).toBe(0);
    expect(result.breakdown.actionVerbUsage).toBe(0);
  });

  it('scores 100% on accomplishment ratio when every highlight has a number', () => {
    const result = scoreContentQuality(
      buildResume([
        'Built a system serving 12M users',
        'Reduced latency by 40%',
        'Led a team of 8 engineers'
      ])
    );
    expect(result.breakdown.accomplishmentRatio).toBe(100);
  });

  it('scores 0 on accomplishment ratio when no highlights have a number', () => {
    const result = scoreContentQuality(
      buildResume([
        'Built a system',
        'Led a team',
        'Designed a workflow'
      ])
    );
    expect(result.breakdown.accomplishmentRatio).toBe(0);
  });

  it('scores 100% on action-verb usage when every highlight starts with a strong verb', () => {
    // Note: 'Shipped' is NOT in the legacy ACTION_VERBS list (we inherit
    // verbatim per the plan §"Open questions" #3 default). Use 'Led' / 'Built' /
    // 'Designed' / 'Delivered' instead.
    const result = scoreContentQuality(
      buildResume([
        'Built a payments platform',
        'Led a team of 5 engineers',
        'Designed the search rewrite',
        'Delivered the new dashboard'
      ])
    );
    expect(result.breakdown.actionVerbUsage).toBe(100);
  });

  it('skips weak verbs in the action-verb count (they are not strong)', () => {
    const result = scoreContentQuality(
      buildResume([
        'Made a payments platform', // "made" is in WEAK_VERBS
        'Built the search rewrite',
        'Worked on the dashboard' // "worked" is in WEAK_VERBS
      ])
    );
    // 1 of 3 strong → 33.3%
    expect(result.breakdown.actionVerbUsage).toBeCloseTo(33.33, 1);
  });

  it('does not count non-verb first words as either strong or weak', () => {
    const result = scoreContentQuality(
      buildResume([
        'The system served 12M users', // "the" is not strong, not weak
        'Built the payments platform'
      ])
    );
    // 1 of 2 strong → 50%
    expect(result.breakdown.actionVerbUsage).toBe(50);
  });

  it('combines the two sub-criteria with 40/30 weighting', () => {
    const result = scoreContentQuality(
      buildResume([
        'Built a payments platform serving 12M users', // 1/1 strong + 1/1 with digit
        'Designed the search rewrite', // 1/1 strong, no digit
        'Worked on the dashboard' // weak verb, ignored
      ])
    );
    // accomplishment: 1/3 ≈ 33.33
    // action-verb: 2/3 ≈ 66.67
    expect(result.breakdown.accomplishmentRatio).toBeCloseTo(33.33, 1);
    expect(result.breakdown.actionVerbUsage).toBeCloseTo(66.67, 1);
    // value = 0.4 * 33.33 + 0.3 * 66.67 = 13.33 + 20 = 33.33
    expect(result.value).toBeCloseTo(33.33, 1);
  });

  it('ignores empty / whitespace-only highlights', () => {
    const result = scoreContentQuality(
      buildResume(['', '   ', '\n\t', 'Built 5 features'])
    );
    // Empty/whitespace-only highlights are filtered out at the
    // collect step. So we only count "Built 5 features" — 1/1 strong,
    // 1/1 with digit → both 100.
    expect(result.breakdown.accomplishmentRatio).toBe(100);
    expect(result.breakdown.actionVerbUsage).toBe(100);
  });

  it('does not look at project highlights (work-only by design)', () => {
    const resume: ResumeTextSource = {
      basics: {},
      skills: [],
      work: [
        {
          summary: '',
          positions: [{ title: 'Engineer', highlights: [] }]
        }
      ],
      projects: [
        {
          name: 'Side project',
          description: '',
          highlights: ['Shipped 10 features']
        }
      ]
    };
    const result = scoreContentQuality(resume);
    // No work highlights → 0 across the board
    expect(result.value).toBe(0);
    expect(result.breakdown.accomplishmentRatio).toBe(0);
    expect(result.breakdown.actionVerbUsage).toBe(0);
  });

  it('is deterministic — same input → same output', () => {
    const a = scoreContentQuality(buildResume(['Built 10 features', 'Led a team']));
    const b = scoreContentQuality(buildResume(['Built 10 features', 'Led a team']));
    expect(a.value).toBe(b.value);
    expect(a.breakdown).toEqual(b.breakdown);
  });
});
