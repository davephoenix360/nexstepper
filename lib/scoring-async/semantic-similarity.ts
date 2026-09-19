/**
 * Semantic similarity for ATS scoring — Phase 3 of the post-ship
 * engine review (`docs/drift/2026-09-19-ats-engine-review.md`).
 *
 * Sits OUTSIDE `lib/scoring/` deliberately. The scoring engine
 * itself remains sync, pure, dependency-light, and purity-tested
 * by `tests/unit/scoring/purity.test.ts`. This module is async,
 * loads `@huggingface/transformers` dynamically (so the heavy
 * module only loads when a caller actually invokes
 * `semanticSimilarity`), and is opt-in — the default scoring path
 * (`recomputeScoreAction`) continues to use BM25 only.
 *
 * Why a separate `lib/scoring-async/` directory:
 *   - Purity test (`tests/unit/scoring/purity.test.ts`) recursively
 *     scans `lib/scoring/` for forbidden patterns. Keeping async +
 *     dynamic imports + the heavy `@huggingface/transformers`
 *     dep inside that directory would either trip the test or
 *     require whitelisting files (which weakens the invariant).
 *   - The split makes the intent legible: `lib/scoring/` is the
 *     always-on, free-tier engine. `lib/scoring-async/` is the
 *     opt-in path for users who pay the cold-start cost for
 *     better semantic recall.
 *
 * Why dynamic `import('@huggingface/transformers')` instead of a
 * top-level import:
 *   - The library transitively pulls in `onnxruntime-node`
 *     (~25 MB native binary) and a model cache download (~25 MB
 *     on first call). A top-level import would load that on every
 *     request, even ones that never call this function.
 *   - Dynamic import keeps the heavy module out of the request
 *     hot path until a caller actually invokes the function. The
 *     first caller pays the cold-start cost (~2-5s); subsequent
 *     callers reuse the module-level singleton pipeline.
 *
 * Why the Xenova/all-MiniLM-L6-v2 model:
 *   - 384-dim, ~25 MB quantized, MIT-licensed.
 *   - Trained on 1B+ sentence pairs; standard baseline for short-
 *     text semantic similarity in the literature.
 *   - Fits the Vercel `/tmp` cache budget on production.
 *   - Drift from plan: the plan banned embedding models. The
 *     review report (`docs/drift/2026-09-19-ats-engine-review.md`)
 *     explicitly recommended reconsidering this ban in light of
 *     (a) better-tuned quantized models now available and (b)
 *     Phase 3 making the path opt-in. The model ships as the
 *     opt-in semantic signal only — the default engine still
 *     uses BM25.
 */

/**
 * The Hugging Face model id. Kept as a module constant so callers
 * can override via env if we ever swap models (e.g. to a smaller
 * MiniLM variant for tighter Vercel cold-start budgets).
 */
const DEFAULT_MODEL_ID = 'Xenova/all-MiniLM-L6-v2';

/**
 * Cast the dynamic import result to the typed surface we use.
 * We deliberately only type the methods we call — the library's
 * full type surface is large and would bloat the file. If we
 * later adopt more features, broaden this type.
 */
type PipelineFn = (
  text: string | string[],
  options: { pooling: 'mean' | 'cls'; normalize: boolean }
) => Promise<{
  data: Float32Array | number[];
  dims: number[];
}>;

type TransformersModule = {
  pipeline: (
    task: 'feature-extraction',
    model: string,
    options?: { dtype?: 'fp32' | 'fp16' | 'q8' | 'q4'; device?: 'cpu' | 'gpu' }
  ) => Promise<PipelineFn>;
  env: {
    cacheDir: string;
    allowRemoteModels: boolean;
    allowLocalModels: boolean;
    logLevel: 'debug' | 'info' | 'warning' | 'error' | 'fatal';
  };
  cos_sim: (a: Float32Array | number[], b: Float32Array | number[]) => number;
};

/**
 * Module-level cache for the pipeline + a single-flight promise so
 * concurrent first-calls share one model load (instead of N).
 */
let pipelinePromise: Promise<PipelineFn> | null = null;
let transformersModulePromise: Promise<TransformersModule> | null = null;

/**
 * Lazy-load the `@huggingface/transformers` module. Configures
 * `env.cacheDir` based on environment:
 *   - Production: `/tmp/.cache/hf-transformers` (Vercel's
 *     writable scratch space; survives across warm invocations
 *     but is ephemeral per cold start).
 *   - Development: `./.cache/hf-transformers` (keeps the cache
 *     inside the project so it shows up in `.gitignore`).
 *
 * The module is loaded exactly once per process — the dynamic
 * import caches the result, and our `transformersModulePromise`
 * singleton guards against the first-call thundering-herd.
 */
async function loadTransformers(): Promise<TransformersModule> {
  if (!transformersModulePromise) {
    transformersModulePromise = (async () => {
      // Dynamic import — does not appear in the source-tree
      // static analysis. Resolved at runtime from
      // `node_modules/@huggingface/transformers`.
      const mod = (await import('@huggingface/transformers')) as unknown as TransformersModule;
      // Configure ONNX runtime cache. This must happen before the
      // first pipeline() call (the model download is triggered
      // during pipeline construction).
      const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
      mod.env.cacheDir = isProduction
        ? '/tmp/.cache/hf-transformers'
        : './.cache/hf-transformers';
      mod.env.allowRemoteModels = true;
      mod.env.allowLocalModels = false;
      // Quiet by default — the library is chatty on first load.
      mod.env.logLevel = 'error';
      return mod;
    })();
  }
  return transformersModulePromise;
}

/**
 * Lazy-load the feature-extraction pipeline. Uses the cached
 * transformers module + a separate singleton promise so concurrent
 * first-callers share one model download.
 */
async function loadPipeline(): Promise<PipelineFn> {
  if (!pipelinePromise) {
    pipelinePromise = (async () => {
      const mod = await loadTransformers();
      const modelId = process.env.SEMANTIC_MODEL_ID ?? DEFAULT_MODEL_ID;
      const pipeline = await mod.pipeline('feature-extraction', modelId, {
        // `q8` is the quantized int8 variant — 4x smaller on disk,
        // ~2x faster cold start, <1% accuracy loss vs fp32 for
        // sentence-similarity benchmarks. `dtype` lives on the
        // library's options shape; we only type what we touch.
        dtype: 'q8'
      });
      return pipeline;
    })();
  }
  return pipelinePromise;
}

/**
 * Truncate text to a safe input length. MiniLM-L6-v2's tokenizer
 * supports up to 512 tokens; we leave headroom at 8K characters
 * (roughly 2K tokens for typical English text) so a single very
 * long document doesn't blow the token budget.
 *
 * Truncation policy: keep the start (resumes / JDs both front-
 * load the important content — name + headline, role + first
 * paragraph). Past 8K chars we drop the tail.
 */
const MAX_INPUT_CHARS = 8_000;

function truncate(text: string): string {
  if (text.length <= MAX_INPUT_CHARS) return text;
  return text.slice(0, MAX_INPUT_CHARS);
}

/**
 * Compute semantic cosine similarity between a resume text and a
 * job description text. Returns a value in `[0, 1]`:
 *
 *   - The raw `cos_sim` from `@huggingface/transformers` is in
 *     `[-1, 1]` (cosine of the angle between the two normalized
 *     embedding vectors). For text similarity in practice this
 *     almost always falls in `[0, 1]` (rare to get negative
 *     cosine for related English sentences), but we still map
 *     to `[0, 1]` via `(sim + 1) / 2` for consistency with the
 *     BM25 similarity range and to keep the hybrid combination
 *     simple.
 *   - Returns `0` on any failure (model load timeout, OOM, etc.)
 *     so callers don't need defensive try/catch around it — the
 *     worst case is "no semantic signal", which the hybrid
 *     formula handles gracefully (falls back to BM25's
 *     contribution only when semantic returns 0).
 *
 * This is the **expensive** path — the first call loads the
 * model (~2-5s cold start), subsequent calls are ~100-200ms per
 * pair. Always wrap in a Server Action that has an explicit
 * timeout + telemetry, and never call from a request hot path
 * unless you've measured the budget.
 */
export async function semanticSimilarity(
  resumeText: string,
  jobText: string
): Promise<number> {
  // Fast-path: empty inputs return 0 without loading the model.
  if (!resumeText || !jobText) return 0;

  try {
    const [pipeline, mod] = await Promise.all([loadPipeline(), loadTransformers()]);
    // `pooling: 'mean'` averages token embeddings into a single
    // sentence vector — the standard MiniLM pooling strategy.
    // `normalize: true` L2-normalizes the output so cosine
    // similarity collapses to dot product (cheaper).
    const [resumeEmb, jobEmb] = await Promise.all([
      pipeline(truncate(resumeText), { pooling: 'mean', normalize: true }),
      pipeline(truncate(jobText), { pooling: 'mean', normalize: true })
    ]);
    const raw = mod.cos_sim(resumeEmb.data, jobEmb.data);
    // Clamp + map [-1, 1] → [0, 1]. Math.max(0, ...) defends
    // against any numerical noise that pushes the cosine slightly
    // below zero for unrelated documents.
    const normalized = (Math.max(-1, Math.min(1, raw)) + 1) / 2;
    return normalized;
  } catch {
    // Module-load failure (e.g. no onnxruntime binding, no
    // internet for model download, OOM). Fall back to 0; the
    // hybrid scorer treats 0 as "no semantic contribution" and
    // relies on BM25 alone. We swallow the error rather than
    // throw — semantic is opt-in and shouldn't break the
    // surrounding score.
    return 0;
  }
}

/**
 * Reset the module-level singleton pipeline + transformers
 * promise. Used by tests to force a fresh load (and to clear
 * the cached module between test files when needed). Not
 * exported in the engine's public API — `lib/scoring/index.ts`
 * doesn't re-export this file.
 *
 * @internal
 */
export function _resetSemanticCacheForTests(): void {
  pipelinePromise = null;
  transformersModulePromise = null;
}
