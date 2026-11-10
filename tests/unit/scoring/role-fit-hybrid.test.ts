/**
 * Role Fit is a dimension now, not a constant.
 *
 * ## The bug this pins
 *
 * Role Fit is one of the seven scored dimensions. Under the v2 weights
 * it carries 0.10 — five points out of a hundred.
 *
 * The hybrid engine used to hand the sync engine
 * `{ roleFitSimilarity: null }`, and the sync engine turns a null
 * similarity into `NEUTRAL_ROLE_FIT_SCORE = 50` with
 * `fallback: true`. So every resume, in every production path, got
 * exactly 0.10 × 50 = 5.0 points from a dimension that no candidate
 * could move and no edit could change. The scorecard showed a flat bar
 * and called it a dimension.
 *
 * The implementation was not missing. `roleFitSimilarity()` in
 * `lib/scoring-async/role-fit.ts` computed the cosine between the JD's
 * title and the candidate's best-matching work title, and it was
 * covered by tests. A repo-wide search found exactly one caller: the
 * test file. The wrapper simply never called it.
 *
 * These tests pin the wiring, because "the function exists" is exactly
 * what was true before.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  scoreResumeFromEnvelope: vi.fn(),
  composeOverallScore: vi.fn(),
  hybridSimilarity: vi.fn(),
  evaluateJevRequirements: vi.fn(),
  evaluateJevContentQuality: vi.fn(),
  roleFitSimilarity: vi.fn()
}));

vi.mock('@/lib/scoring', () => ({
  scoreResumeFromEnvelope: mocks.scoreResumeFromEnvelope,
  composeOverallScore: mocks.composeOverallScore
}));

vi.mock('@/lib/scoring-async/hybrid-similarity', () => ({
  hybridSimilarity: mocks.hybridSimilarity
}));

vi.mock('@/lib/scoring-async/jev-requirements', () => ({
  evaluateJevRequirements: mocks.evaluateJevRequirements
}));

vi.mock('@/lib/scoring-async/jev-content-quality', () => ({
  evaluateJevContentQuality: mocks.evaluateJevContentQuality
}));

vi.mock('@/lib/scoring-async/role-fit', () => ({
  roleFitSimilarity: mocks.roleFitSimilarity,
  NEUTRAL_ROLE_FIT_SCORE: 50
}));

import { scoreResumeHybridFromEnvelope } from '@/lib/scoring-async/score-hybrid';
import { blankResumeData } from '@/lib/resume-schema';
import type { JobPosting } from '@/lib/resume-schema';

const resume = blankResumeData();
const job = { title: 'Staff Engineer' } as unknown as JobPosting;

function baseline() {
  return {
    overallScore: 57,
    dimensionScores: {
      atsMatching: 58,
      structure: 80,
      contentQuality: 70,
      alignment: 60,
      intentCoverage: 90,
      roleFit: 50,
      seniorityFit: 50
    },
    criteriaScores: {
      'ATS Keyword Match': 66,
      'ATS Similarity': 88,
      'ATS Coverage': 80
    },
    computedInMs: 4,
    intentCoverageBreakdown: {
      value: 90,
      missed: { mustHave: [], niceToHave: [], implicit: [] },
      penalty: 0,
      fallback: false
    }
  };
}

describe('the hybrid engine feeds Role Fit a real signal', () => {
  beforeEach(() => {
    mocks.scoreResumeFromEnvelope.mockReset();
    mocks.composeOverallScore.mockReset();
    mocks.hybridSimilarity.mockReset();
    mocks.evaluateJevRequirements.mockReset();
    mocks.evaluateJevContentQuality.mockReset();
    mocks.roleFitSimilarity.mockReset();

    mocks.scoreResumeFromEnvelope.mockReturnValue(baseline());
    mocks.composeOverallScore.mockReturnValue(57);
    mocks.hybridSimilarity.mockResolvedValue(0.8);
    mocks.evaluateJevRequirements.mockResolvedValue({ ok: false });
    mocks.evaluateJevContentQuality.mockResolvedValue({ ok: false });
    mocks.roleFitSimilarity.mockResolvedValue({
      value: 72,
      bestSimilarity: 0.72,
      bestMatchingTitle: 'Staff Engineer',
      jdTitle: 'Staff Engineer',
      fallback: false
    });
  });

  it('passes the computed similarity into the sync engine', async () => {
    await scoreResumeHybridFromEnvelope(resume, job);

    expect(mocks.roleFitSimilarity).toHaveBeenCalledTimes(1);

    const precomputed = mocks.scoreResumeFromEnvelope.mock.calls[0]?.[3];
    // The whole point: NOT null any more. A null similarity is what
    // pinned the dimension at 50.
    expect(precomputed).toEqual({ roleFitSimilarity: 0.72 });
  });

  it('still passes null when the title signal is genuinely unavailable', async () => {
    // No JD title, or no work titles — the neutral fallback is correct
    // here. The difference is that this is now a MEASURED absence
    // rather than a hard-coded one.
    mocks.roleFitSimilarity.mockResolvedValue({
      value: 50,
      bestSimilarity: null,
      bestMatchingTitle: null,
      jdTitle: '',
      fallback: true
    });

    await scoreResumeHybridFromEnvelope(resume, job);

    const precomputed = mocks.scoreResumeFromEnvelope.mock.calls[0]?.[3];
    expect(precomputed).toEqual({ roleFitSimilarity: null });
  });

  it('does not let a Role Fit failure break the score', async () => {
    // `roleFitSimilarity` swallows its own model errors, but a
    // malformed envelope (a missing `sections.work`) would throw before
    // its own try/catch. An unhandled throw inside `Promise.all` would
    // take the WHOLE score down — the dimension must degrade to its
    // neutral 50 instead, exactly as it did before it was computed.
    mocks.roleFitSimilarity.mockRejectedValue(new Error('model offline'));

    const result = await scoreResumeHybridFromEnvelope(resume, job);

    expect(result.overallScore).toBe(57);
    const precomputed = mocks.scoreResumeFromEnvelope.mock.calls[0]?.[3];
    expect(precomputed).toEqual({ roleFitSimilarity: null });
  });

  it('computes Role Fit alongside the other two evaluations, not after them', async () => {
    await scoreResumeHybridFromEnvelope(resume, job);

    // All three are awaited together, so the MiniLM pipeline is loaded
    // once for the whole turn rather than twice.
    expect(mocks.evaluateJevRequirements).toHaveBeenCalledTimes(1);
    expect(mocks.evaluateJevContentQuality).toHaveBeenCalledTimes(1);
    expect(mocks.roleFitSimilarity).toHaveBeenCalledTimes(1);
  });
});
