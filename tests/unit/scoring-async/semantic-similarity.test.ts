import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock @huggingface/transformers BEFORE importing the module under test.
// The semantic module uses dynamic `import('@huggingface/transformers')`,
// but vitest intercepts both static AND dynamic imports via the same
// module registry, so this top-level mock catches both.
//
// We expose setters for `cos_sim` and `pipeline()` so each test can
// script the embedding behavior without spinning up a real model.
const mockCosSim = vi.fn();
const mockPipelineFn = vi.fn();
const mockPipelineInit = vi.fn(async (..._args: unknown[]) => mockPipelineFn);
const mockEnv = {
  cacheDir: '',
  allowRemoteModels: true,
  allowLocalModels: false,
  logLevel: 'error' as const
};

vi.mock('@huggingface/transformers', () => ({
  pipeline: (...args: unknown[]) => mockPipelineInit(...args),
  env: mockEnv,
  cos_sim: (a: Float32Array, b: Float32Array) => mockCosSim(a, b)
}));

import { semanticSimilarity, _resetSemanticCacheForTests } from '@/lib/scoring-async/semantic-similarity';

// Two distinguishable "embeddings". `cos_sim` is mocked to return
// a deterministic similarity per pair, scripted per-test.
function makeEmb(values: number[]): Float32Array {
  return new Float32Array(values);
}

describe('semanticSimilarity', () => {
  beforeEach(() => {
    mockCosSim.mockReset();
    mockPipelineFn.mockReset();
    mockPipelineInit.mockReset();
    mockEnv.cacheDir = '';
    _resetSemanticCacheForTests();
  });

  it('returns 0 when resume text is empty (no model load)', async () => {
    mockPipelineInit.mockImplementation(async () => mockPipelineFn);
    const score = await semanticSimilarity('', 'some job description');
    expect(score).toBe(0);
    // No pipeline should have been initialized for empty input.
    expect(mockPipelineInit).not.toHaveBeenCalled();
  });

  it('returns 0 when job text is empty (no model load)', async () => {
    const score = await semanticSimilarity('some resume text', '');
    expect(score).toBe(0);
    expect(mockPipelineInit).not.toHaveBeenCalled();
  });

  it('returns 0 when both inputs are empty', async () => {
    const score = await semanticSimilarity('', '');
    expect(score).toBe(0);
  });

  it('maps cosine similarity [-1, 1] -> [0, 1]', async () => {
    mockCosSim.mockReturnValue(0.5);
    mockPipelineFn.mockResolvedValue({ data: makeEmb([1, 0, 0]), dims: [1, 3] });
    mockPipelineInit.mockResolvedValue(mockPipelineFn);

    const score = await semanticSimilarity('resume text', 'job text');
    // (0.5 + 1) / 2 = 0.75
    expect(score).toBeCloseTo(0.75, 5);
  });

  it('handles cosine = 1.0 (perfect match) → similarity = 1.0', async () => {
    mockCosSim.mockReturnValue(1.0);
    mockPipelineFn.mockResolvedValue({ data: makeEmb([1, 0, 0]), dims: [1, 3] });
    mockPipelineInit.mockResolvedValue(mockPipelineFn);

    const score = await semanticSimilarity('identical text', 'identical text');
    expect(score).toBeCloseTo(1.0, 5);
  });

  it('handles cosine = 0.0 (orthogonal) → similarity = 0.5', async () => {
    mockCosSim.mockReturnValue(0);
    mockPipelineFn.mockResolvedValue({ data: makeEmb([1, 0, 0]), dims: [1, 3] });
    mockPipelineInit.mockResolvedValue(mockPipelineFn);

    const score = await semanticSimilarity('text a', 'text b');
    expect(score).toBeCloseTo(0.5, 5);
  });

  it('clamps cosine slightly below zero to 0 (no negative similarity)', async () => {
    // Numerically noisy libraries sometimes return -0.01 for unrelated
    // pairs. We clamp to 0 rather than returning -0.005.
    mockCosSim.mockReturnValue(-0.01);
    mockPipelineFn.mockResolvedValue({ data: makeEmb([1, 0, 0]), dims: [1, 3] });
    mockPipelineInit.mockResolvedValue(mockPipelineFn);

    const score = await semanticSimilarity('a', 'b');
    // (-0.01 + 1) / 2 = 0.495; clamped to [0, 1] but no further
    // adjustment needed (already positive).
    expect(score).toBeCloseTo(0.495, 5);
  });

  it('clamps cosine slightly above 1.0 to 1.0', async () => {
    // Defensive: if cos_sim ever returns > 1 due to numerical noise,
    // we clamp at 1.0.
    mockCosSim.mockReturnValue(1.05);
    mockPipelineFn.mockResolvedValue({ data: makeEmb([1, 0, 0]), dims: [1, 3] });
    mockPipelineInit.mockResolvedValue(mockPipelineFn);

    const score = await semanticSimilarity('a', 'b');
    expect(score).toBe(1);
  });

  it('returns 0 when the model load throws (graceful degradation)', async () => {
    mockPipelineInit.mockRejectedValue(new Error('ONNX runtime not available'));
    const score = await semanticSimilarity('resume', 'job');
    // The semantic path catches its own errors and returns 0.
    // This is the contract the hybrid scorer relies on: a failed
    // semantic signal degrades to BM25-only, not to a thrown
    // action that breaks the user's scorecard.
    expect(score).toBe(0);
  });

  it('returns 0 when embedding inference throws', async () => {
    mockPipelineInit.mockResolvedValue(mockPipelineFn);
    mockPipelineFn.mockRejectedValue(new Error('inference failed'));
    const score = await semanticSimilarity('resume', 'job');
    expect(score).toBe(0);
  });

  it('initializes the pipeline exactly once across multiple calls (singleton)', async () => {
    mockCosSim.mockReturnValue(0.7);
    mockPipelineFn.mockResolvedValue({ data: makeEmb([1, 0, 0]), dims: [1, 3] });
    mockPipelineInit.mockResolvedValue(mockPipelineFn);

    await semanticSimilarity('resume 1', 'job 1');
    await semanticSimilarity('resume 2', 'job 2');
    await semanticSimilarity('resume 3', 'job 3');

    // The pipeline factory is called once (singleton). The pipeline
    // function is called 6 times (2 embeddings per semantic call).
    expect(mockPipelineInit).toHaveBeenCalledTimes(1);
    expect(mockPipelineFn).toHaveBeenCalledTimes(6);
  });

  it('configures env.cacheDir for production (Vercel)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    _resetSemanticCacheForTests();

    mockPipelineFn.mockResolvedValue({ data: makeEmb([1]), dims: [1, 1] });
    mockPipelineInit.mockResolvedValue(mockPipelineFn);
    mockCosSim.mockReturnValue(0.5);

    await semanticSimilarity('r', 'j');

    expect(mockEnv.cacheDir).toBe('/tmp/.cache/hf-transformers');

    vi.unstubAllEnvs();
  });

  it('configures env.cacheDir for development (relative path)', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    _resetSemanticCacheForTests();

    mockPipelineFn.mockResolvedValue({ data: makeEmb([1]), dims: [1, 1] });
    mockPipelineInit.mockResolvedValue(mockPipelineFn);
    mockCosSim.mockReturnValue(0.5);

    await semanticSimilarity('r', 'j');

    expect(mockEnv.cacheDir).toBe('./.cache/hf-transformers');

    vi.unstubAllEnvs();
  });

  it('uses the default model id Xenova/all-MiniLM-L6-v2', async () => {
    mockPipelineFn.mockResolvedValue({ data: makeEmb([1]), dims: [1, 1] });
    mockPipelineInit.mockResolvedValue(mockPipelineFn);
    mockCosSim.mockReturnValue(0.5);

    await semanticSimilarity('r', 'j');

    expect(mockPipelineInit).toHaveBeenCalledWith(
      'feature-extraction',
      'Xenova/all-MiniLM-L6-v2',
      expect.objectContaining({ dtype: 'q8' })
    );
  });
});
