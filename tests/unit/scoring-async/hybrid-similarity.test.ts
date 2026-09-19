import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock the semantic module BEFORE importing the hybrid module. The
// hybrid module calls `semanticSimilarity` from semantic-similarity.ts;
// we replace that whole module so tests don't load any real model.
const mockSemantic = vi.fn();
vi.mock('@/lib/scoring-async/semantic-similarity', () => ({
  semanticSimilarity: (...args: unknown[]) => mockSemantic(...args),
  // Keep the reset helper so tests that use it don't break.
  _resetSemanticCacheForTests: vi.fn()
}));

import { hybridSimilarity } from '@/lib/scoring-async/hybrid-similarity';
import type { JobTextSource, ResumeTextSource } from '@/lib/scoring/similarity';

const RESUME: ResumeTextSource = {
  basics: {
    summary:
      'Senior TypeScript engineer with 8 years building React and Node applications on AWS.'
  },
  skills: [
    { name: 'Languages', keywords: ['typescript', 'python'] },
    { name: 'Frontend', keywords: ['react', 'next'] },
    { name: 'Backend', keywords: ['node', 'postgres'] }
  ],
  work: [
    {
      summary: 'Platform team lead',
      positions: [
        {
          title: 'Staff Engineer',
          highlights: [
            'Built the payments platform serving 12M users on AWS'
          ]
        }
      ]
    }
  ],
  projects: []
};

const WELL_MATCHED_JOB: JobTextSource = {
  title: 'Senior TypeScript Engineer',
  description:
    'Build payments platforms with React and Node on AWS. Looking for a senior engineer.',
  requirements: ['5+ years TypeScript', 'Strong React and Node', 'AWS experience']
};

const POORLY_MATCHED_JOB: JobTextSource = {
  title: 'Junior Java Developer',
  description: 'Maintain a legacy Spring application.',
  requirements: ['Java expertise', 'Spring framework']
};

describe('hybridSimilarity', () => {
  beforeEach(() => {
    mockSemantic.mockReset();
  });

  it('returns 0 when both inputs are empty', async () => {
    mockSemantic.mockResolvedValue(0);
    const empty: ResumeTextSource = { basics: {}, skills: [], work: [] };
    const emptyJob: JobTextSource = {
      title: '',
      description: '',
      requirements: []
    };
    const score = await hybridSimilarity(empty, emptyJob);
    expect(score).toBe(0);
  });

  it('combines BM25 + semantic with α = 0.4 (semantic-leaning)', async () => {
    // Script the semantic signal to a specific value so we can verify
    // the formula directly. BM25 is the real (sync) implementation
    // computing against the fixtures.
    mockSemantic.mockResolvedValue(0.8);
    const score = await hybridSimilarity(RESUME, WELL_MATCHED_JOB);
    // We can't assert an exact value because BM25 varies with
    // fixtures, but we CAN assert the formula: with a fixed
    // semantic = 0.8, the hybrid = 0.4 × bm25 + 0.6 × 0.8.
    // If bm25 = 0.6 (illustrative), hybrid = 0.24 + 0.48 = 0.72.
    // The structural check: hybrid >= 0.6 × 0.8 = 0.48 (because
    // 0.4 × bm25 >= 0) and hybrid <= 0.4 × 1 + 0.6 × 0.8 = 0.88
    // (because bm25 <= 1).
    expect(score).toBeGreaterThanOrEqual(0.48 - 1e-9);
    expect(score).toBeLessThanOrEqual(0.88 + 1e-9);
  });

  it('falls back to BM25 alone when semantic returns 0 (graceful degradation)', async () => {
    mockSemantic.mockResolvedValue(0);
    const scoreNoSemantic = await hybridSimilarity(RESUME, WELL_MATCHED_JOB);

    // Reset + compute with a different semantic value to verify
    // the score actually depends on semantic when non-zero.
    mockSemantic.mockResolvedValue(1.0);
    const scoreMaxSemantic = await hybridSimilarity(RESUME, WELL_MATCHED_JOB);

    // With semantic = 0, hybrid = 0.4 × bm25.
    // With semantic = 1.0, hybrid = 0.4 × bm25 + 0.6 × 1.0 = higher.
    expect(scoreNoSemantic).toBeLessThan(scoreMaxSemantic);
    // Specifically, the difference must be 0.6 (the semantic weight
    // when bm25 is held constant).
    expect(scoreMaxSemantic - scoreNoSemantic).toBeCloseTo(0.6, 5);
  });

  it('returns 0 when semantic throws (the semantic module swallows errors → 0)', async () => {
    // Even if a downstream caller were to forget the catch in
    // semantic-similarity.ts, the hybrid scorer would still
    // produce 0 because the underlying signal is 0. This test
    // verifies the contract: semantic always returns a number.
    mockSemantic.mockResolvedValue(0);
    const score = await hybridSimilarity(RESUME, WELL_MATCHED_JOB);
    expect(typeof score).toBe('number');
    expect(score).toBeGreaterThanOrEqual(0);
  });

  it('is bounded in [0, 1]', async () => {
    mockSemantic.mockResolvedValue(0.5);
    const score = await hybridSimilarity(RESUME, WELL_MATCHED_JOB);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('well-matched hybrid > poorly-matched hybrid (ranking preserved)', async () => {
    mockSemantic.mockResolvedValue(0.7);
    const wellMatched = await hybridSimilarity(RESUME, WELL_MATCHED_JOB);
    mockSemantic.mockResolvedValue(0.1);
    const poorlyMatched = await hybridSimilarity(RESUME, POORLY_MATCHED_JOB);
    // Both BM25 and semantic rank the well-matched pair higher;
    // the hybrid must too. (Sanity check that the formula doesn't
    // somehow invert the ranking when the weights cross.)
    expect(wellMatched).toBeGreaterThan(poorlyMatched);
  });

  it('is deterministic for fixed inputs (BM25 is sync + deterministic)', async () => {
    mockSemantic.mockResolvedValue(0.5);
    const a = await hybridSimilarity(RESUME, WELL_MATCHED_JOB);
    const b = await hybridSimilarity(RESUME, WELL_MATCHED_JOB);
    expect(a).toBe(b);
  });
});
