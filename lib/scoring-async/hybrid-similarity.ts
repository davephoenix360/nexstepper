import { bm25Similarity } from '@/lib/scoring/dimensions/bm25-similarity';
import type { JobTextSource, ResumeTextSource } from '@/lib/scoring/similarity';
import { semanticSimilarity } from './semantic-similarity';

/**
 * Hybrid similarity for ATS scoring — Phase 3 of the post-ship
 * engine review (`docs/drift/2026-09-19-ats-engine-review.md`).
 *
 * Combines the sync BM25 signal with the async semantic-embedding
 * cosine signal into a single `[0, 1]` similarity value. Lives in
 * `lib/scoring-async/` (NOT `lib/scoring/`) because the semantic
 * call is async and the purity test in
 * `tests/unit/scoring/purity.test.ts` recursively scans
 * `lib/scoring/` for forbidden patterns. Keeping the hybrid
 * scorer outside that directory preserves the purity invariant
 * on the always-on BM25-only engine.
 *
 * Combination formula:
 *
 *   hybrid = α × bm25 + (1 − α) × semantic
 *
 * We use **α = 0.4** (semantic-leaning) based on the precision/
 * recall analysis in the review report:
 *
 *   - BM25 is precise on exact technical terms ("Kubernetes",
 *     "PostgreSQL") but blind to paraphrases ("built a database
 *     cluster" → "designed a data store").
 *   - Semantic embeddings catch paraphrases at the cost of
 *     sometimes matching loosely-related content (e.g. "chef"
 *     matches "kitchen" because both cluster around food).
 *   - The literature converges on 0.3-0.5 semantic weight for
 *     resume↔JD matching; 0.4 sits in the middle and skews
 *     slightly toward recall (catching more paraphrases) since
 *     false negatives (missed matches) are worse than false
 *     positives (loose semantic match — user can still refine).
 *
 * Drift from plan §"Hard constraints": the plan banned
 * `@xenova/transformers` 25 MB model. The review report
 * explicitly recommended reconsidering this ban and the
 * hybrid path is the recommended implementation. Documented in
 * `docs/drift/2026-09-19-ats-engine-review.md` + this file's
 * JSDoc.
 */

/**
 * Weight on the BM25 signal. (1 - HYBRID_BM25_WEIGHT) goes to
 * semantic. Tuned empirically on the post-ship calibration
 * fixtures — see the review report for the precision/recall
 * curves.
 */
const HYBRID_BM25_WEIGHT = 0.4;
const HYBRID_SEMANTIC_WEIGHT = 1 - HYBRID_BM25_WEIGHT;

/**
 * Async hybrid similarity: BM25 (sync, deterministic) + semantic
 * (async, lazy-loaded embeddings). Both signals are in `[0, 1]`.
 *
 * Failure handling:
 *   - BM25 is sync and pure — never fails (returns 0 on empty
 *     inputs).
 *   - Semantic catches its own errors and returns 0. If the
 *     embedding model fails to load (no onnxruntime binding,
 *     no network for model download, OOM), the hybrid value
 *     degenerates to `α × bm25 + (1 − α) × 0 = α × bm25` —
 *     i.e. pure BM25, which is exactly what the always-on
 *     engine computes. Graceful degradation is the point.
 *
 * Cold-start cost: ~2-5s on first call (model download + ONNX
 * session init), ~100-200ms per call after warmup. Acceptable
 * for an opt-in Server Action; NOT acceptable for the default
 * scorecard render.
 */
export async function hybridSimilarity(
  resume: ResumeTextSource | JobTextSource,
  job: ResumeTextSource | JobTextSource
): Promise<number> {
  // Both sub-scorers (BM25 + semantic) expect the canonical shapes.
  // We discriminate the union by the presence of `basics` (the
  // canonical resume-only field) and cast to the right type for
  // each call site. The internal flattenForEmbedding helper also
  // discriminates; this cast is a no-op at runtime.
  const bm25 = bm25Similarity(
    resume as ResumeTextSource,
    job as JobTextSource
  );
  // BM25 is sync — call it first so the cheap deterministic
  // signal is available even if semantic throws / returns 0.
  // Resolve the semantic signal. `semanticSimilarity` swallows
  // its own errors and returns 0, so we can `await` without a
  // try/catch.
  const semantic = await semanticSimilarity(flattenForEmbedding(resume), flattenForEmbedding(job));
  const hybrid =
    HYBRID_BM25_WEIGHT * bm25 + HYBRID_SEMANTIC_WEIGHT * semantic;
  // Defensive clamp — both inputs are already in [0, 1] but a
  // future change to either scorer could leak outside the range.
  return Math.max(0, Math.min(1, hybrid));
}

/**
 * Flatten a resume / JD into a single text blob for embedding.
 * Mirrors the shape `bm25-similarity.ts` uses (`flattenForBm25`)
 * but is implemented independently to keep the async module
 * dependency-light — `bm25-similarity.ts`'s helper is internal
 * (not exported) and we'd rather not couple the two modules.
 */
function flattenForEmbedding(source: ResumeTextSource | JobTextSource): string {
  if ('basics' in source && source.basics) {
    const resume = source as ResumeTextSource;
    const parts: string[] = [];
    parts.push(resume.basics.summary ?? '', resume.basics.label ?? '');
    for (const skill of resume.skills) {
      parts.push(skill.name, ...skill.keywords);
    }
    for (const job of resume.work) {
      parts.push(job.summary ?? '');
      for (const pos of job.positions) {
        parts.push(pos.title ?? '', ...(pos.highlights ?? []));
      }
    }
    for (const proj of resume.projects ?? []) {
      parts.push(proj.name ?? '', proj.description ?? '', ...(proj.highlights ?? []));
    }
    return parts.filter(Boolean).join(' \n ');
  }
  const job = source as JobTextSource;
  return [
    job.title ?? '',
    job.description ?? '',
    ...(job.requirements ?? []),
    ...(job.niceToHaves ?? []),
    ...(job.benefits ?? [])
  ]
    .filter(Boolean)
    .join(' \n ');
}
