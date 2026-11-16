/**
 * A scorer that stops being the scorer it claims to be must say so.
 *
 * ## The bug this pins
 *
 * The enhanced scorer combines BM25 with a semantic-embedding signal:
 *
 *   hybrid = 0.4 × BM25 + 0.6 × semantic
 *
 * `semanticSimilarity` catches its own errors and returns 0, so if the
 * embedding model cannot be loaded, the semantic term contributes
 * nothing and the scorer quietly becomes BM25-only.
 *
 * **That is what happened in production, for every score.** The
 * fingerprint: every snapshot on the account read
 * `ATS Similarity = 40`, which is exactly `0.4 × BM25` with the
 * semantic term at zero. Nothing errored, nothing was logged, and the
 * scorecard called it the enhanced score.
 *
 * The fix is not only to make the failure loud — it is to make the
 * score carry its own provenance:
 *
 *   - the failure reason is captured (not swallowed),
 *   - it travels in the breakdown as `degraded.semantic`,
 *   - it is persisted with the snapshot,
 *   - the scorecard renders a "keyword-only score" notice.
 *
 * The score itself is unchanged. Only the honesty about it changes.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  scoreResumeFromEnvelope: vi.fn(),
  composeOverallScore: vi.fn(),
  hybridSimilarity: vi.fn(),
  evaluateJevRequirements: vi.fn(),
  evaluateJevContentQuality: vi.fn(),
  roleFitSimilarity: vi.fn(),
  resetSemanticError: vi.fn(),
  getSemanticError: vi.fn()
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

vi.mock('@/lib/scoring-async/semantic-similarity', () => ({
  resetSemanticError: mocks.resetSemanticError,
  getSemanticError: mocks.getSemanticError
}));

import { scoreResumeHybridFromEnvelope } from '@/lib/scoring-async/score-hybrid';
import { blankResumeData } from '@/lib/resume-schema';

const resume = blankResumeData();
const job = { title: 'Staff Platform Engineer' } as never;

function baseline() {
  return {
    overallScore: 57,
    dimensionScores: {
      atsMatching: 58,
      structure: 80,
      contentQuality: 70,
      alignment: 60,
      intentCoverage: 90,
      roleFit: 72,
      seniorityFit: 50
    },
    criteriaScores: {
      'ATS Keyword Match': 66,
      'ATS Similarity': 88,
      'ATS Coverage': 80
    },
    computedInMs: 32,
    intentCoverageBreakdown: {
      value: 90,
      missed: { mustHave: [], niceToHave: [], implicit: [] },
      penalty: 0,
      fallback: false
    }
  };
}

describe('the enhanced scorer reports its own degradation', () => {
  beforeEach(() => {
    mocks.scoreResumeFromEnvelope.mockReset();
    mocks.composeOverallScore.mockReset();
    mocks.hybridSimilarity.mockReset();
    mocks.evaluateJevRequirements.mockReset();
    mocks.evaluateJevContentQuality.mockReset();
    mocks.roleFitSimilarity.mockReset();
    mocks.resetSemanticError.mockReset();
    mocks.getSemanticError.mockReset();

    mocks.scoreResumeFromEnvelope.mockReturnValue(baseline());
    mocks.composeOverallScore.mockReturnValue(57);
    mocks.hybridSimilarity.mockResolvedValue(0.9);
    mocks.evaluateJevRequirements.mockResolvedValue({ ok: false });
    mocks.evaluateJevContentQuality.mockResolvedValue({ ok: false });
    mocks.roleFitSimilarity.mockResolvedValue({
      value: 72,
      bestSimilarity: 0.72,
      bestMatchingTitle: 'Senior Software Engineer',
      jdTitle: 'Staff Platform Engineer',
      fallback: false
    });
    mocks.getSemanticError.mockReturnValue(null);
  });

  it('records no degradation when the semantic signal worked', async () => {
    const result = await scoreResumeHybridFromEnvelope(resume, job);

    expect(result.degraded).toBeUndefined();
  });

  it('records the reason when the semantic signal was unavailable', async () => {
    mocks.getSemanticError.mockReturnValue(
      'Could not find module onnxruntime-node'
    );

    const result = await scoreResumeHybridFromEnvelope(resume, job);

    expect(result.degraded?.semantic).toBe(
      'Could not find module onnxruntime-node'
    );
  });

  it('scopes the failure marker to one computation', async () => {
    // The marker lives at module scope, and a warm lambda serves many
    // requests — so it has to be cleared before each computation, or a
    // failure from an earlier request gets reported against this score.
    await scoreResumeHybridFromEnvelope(resume, job);

    expect(mocks.resetSemanticError).toHaveBeenCalled();
  });

  it('reports the wall-clock of the WHOLE computation, not just the baseline', async () => {
    // The baseline engine stamps `computedInMs` on itself, but that only
    // covers the deterministic part. The enhanced path then adds two AI
    // round trips and a model inference. The old code returned the
    // baseline's number unchanged — so the scorecard said "Computed in
    // 32 ms" for a computation that had really spent seconds in the
    // network.
    mocks.scoreResumeFromEnvelope.mockReturnValue({
      ...baseline(),
      computedInMs: 32
    });

    const before = Date.now();
    const result = await scoreResumeHybridFromEnvelope(resume, job);
    const elapsed = Date.now() - before;

    expect(result.computedInMs).toBeGreaterThanOrEqual(0);
    expect(result.computedInMs).toBeLessThan(elapsed + 50);
  });
});
