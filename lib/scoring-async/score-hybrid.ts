import {
  scoreResumeFromEnvelope,
  type ScoreBreakdown
} from '@/lib/scoring';
import type { ResumeData, JobPosting } from '@/lib/resume-schema';
import { hybridSimilarity } from './hybrid-similarity';

/**
 * Hybrid score wrapper - Phase 3 of the post-ship engine review
 * (`docs/drift/2026-09-19-ats-engine-review.md`).
 *
 * Re-uses the always-on sync engine for every dimension EXCEPT the
 * ATS `similarityScore` sub-criterion. That sub-criterion is
 * replaced with the hybrid BM25+semantic value from
 * `hybrid-similarity.ts`, the dimension value is re-weighted to
 * use the new sub-score, and the overall score is recomputed
 * with the dimension's new value.
 *
 * Lives in `lib/scoring-async/` (NOT `lib/scoring/`) for the
 * same purity-invariant reasons as the underlying
 * `semantic-similarity.ts` and `hybrid-similarity.ts` modules.
 *
 * Why a wrapper, not a refactor of `scoreResume`:
 *   - The sync engine is purity-tested; making it async would
 *     break the contract and require touching every dimension.
 *   - The hybrid path is opt-in (default scoring still uses
 *     BM25). Wrapping lets us add it without modifying the
 *     always-on engine.
 *   - The single substituted sub-criterion is `ATS Similarity`
 *     (the 20% slice of the 30% atsMatching dimension - so
 *     6% of the overall score). All other sub-criteria stay
 *     identical to the sync engine. Drift is localized and
 *     visible.
 */

/**
 * Score a resume against a job posting using the HYBRID engine
 * (BM25 + semantic embeddings for the ATS similarity sub-criterion).
 *
 * Same return shape as `scoreResumeFromEnvelope` so the existing
 * Scorecard UI can render the breakdown without changes.
 *
 * Returns a modified `ScoreBreakdown`:
 *   - `criteriaScores['ATS Similarity']` <- hybrid value * 100
 *     (replaces the BM25-only similarity score from the sync
 *     engine).
 *   - `dimensionScores.atsMatching` <- re-weighted to use the new
 *     similarity score (replaces the sync engine's atsMatching
 *     dimension value).
 *   - `overallScore` <- recomputed from the new atsMatching +
 *     unchanged structure / content / alignment.
 *   - All other criteriaScores / dimensionScores unchanged from
 *     the sync engine's output.
 *
 * @param resume The full `ResumeData` envelope.
 * @param job The full `JobPosting` envelope. Required - the
 *   hybrid scorer always needs the JD.
 * @returns The modified `ScoreBreakdown`.
 */
export async function scoreResumeHybridFromEnvelope(
  resume: ResumeData,
  job: JobPosting
): Promise<ScoreBreakdown> {
  // 1. Run the sync engine first to get the unchanged baseline.
  const baseline = scoreResumeFromEnvelope(resume, job);

  // 2. Compute the hybrid similarity. Returns [0, 1] - convert to
  // 0-100 to match the unit of every other sub-criterion. The
  // helper accepts the union `ResumeTextSource | JobTextSource`
  // and discriminates internally; we feed each envelope through
  // the typed adapter to land on the right shape.
  const hybridSimilarityValue = await hybridSimilarity(
    toTextSource(resume),
    toTextSource(job)
  );
  const newSimilarityScore = hybridSimilarityValue * 100;

  // 3. Recompute the atsMatching dimension value using the new
  // similarity score. Mirrors the weighting logic in
  // `lib/scoring/dimensions/ats-matching.ts` so the dimension
  // arithmetic stays consistent. The dimension weights are
  // re-normalized when the JD has zero requirements (the sync
  // engine handles the same edge case identically). We read the
  // requirement count from the envelope directly - simpler and
  // exact, no heuristic.
  const hasRequirements = (job.requirements?.length ?? 0) > 0;
  const newAtsMatching = recomputeAtsMatchingDimension(
    baseline,
    newSimilarityScore,
    hasRequirements
  );

  // 4. Recompute the overall score from the new atsMatching
  // dimension value + the unchanged other three dimensions.
  // Mirrors `lib/scoring/score.ts`'s composition formula so the
  // top-level arithmetic stays consistent. Use the same weight
  // constants as the engine (hard-coded here too because we
  // don't want to couple this wrapper to internal exports).
  const newOverall =
    0.3 * newAtsMatching +
    0.2 * baseline.dimensionScores.structure +
    0.3 * baseline.dimensionScores.contentQuality +
    0.2 * baseline.dimensionScores.alignment;

  return {
    ...baseline,
    dimensionScores: {
      ...baseline.dimensionScores,
      atsMatching: newAtsMatching
    },
    criteriaScores: {
      ...baseline.criteriaScores,
      'ATS Similarity': newSimilarityScore
    },
    overallScore: Math.round(newOverall)
  };
}

/**
 * Recompute the `atsMatching` dimension value using the new
 * similarity sub-score. Mirrors the weighting logic in
 * `lib/scoring/dimensions/ats-matching.ts:scoreAtsMatching`:
 *
 *   - Default weights: keyword=0.6, similarity=0.2, coverage=0.2.
 *   - When JD has zero requirements: re-normalize to
 *     keyword=0.75, similarity=0.25, coverage=0.
 *
 * Caller passes the requirement-count signal directly (read from
 * the JD envelope) - we can't infer it from the baseline
 * breakdown without ambiguity.
 */
function recomputeAtsMatchingDimension(
  baseline: ScoreBreakdown,
  newSimilarityScore: number,
  hasRequirements: boolean
): number {
  const keywordScore = baseline.criteriaScores['ATS Keyword Match'];
  const coverageScore = baseline.criteriaScores['ATS Coverage'];
  const weights = hasRequirements
    ? { keyword: 0.6, similarity: 0.2, coverage: 0.2 }
    : { keyword: 0.75, similarity: 0.25, coverage: 0 };

  return (
    weights.keyword * keywordScore +
    weights.similarity * newSimilarityScore +
    weights.coverage * coverageScore
  );
}

/**
 * Adapter from the wide `ResumeData` / `JobPosting` envelopes to
 * the narrow `ResumeTextSource` / `JobTextSource` shapes the
 * hybrid similarity helper reads. Mirrors the adapter in
 * `lib/scoring/score.ts` (`resumeDataToScoreable`) but returns
 * only the text-bearing fields (no education/awards/etc.) since
 * the hybrid signal only needs searchable text.
 */
function toTextSource(
  source: ResumeData | JobPosting
):
  | import('@/lib/scoring/similarity').ResumeTextSource
  | import('@/lib/scoring/similarity').JobTextSource {
  // Discriminate by shape: ResumeData has `sections`, JobPosting
  // does not. This is the same shape-discriminator the Zod
  // schema uses internally.
  if ('sections' in source) {
    const resume = source as ResumeData;
    const sections = resume.sections;
    return {
      basics: {
        summary: sections.basics.summary ?? '',
        label: sections.basics.label ?? ''
      },
      skills: sections.skills.map((s) => ({
        name: s.name,
        keywords: s.keywords
      })),
      work: sections.work.map((w) => ({
        summary: w.description ?? '',
        positions: w.positions.map((p) => ({
          title: p.title ?? '',
          highlights: p.highlights ?? []
        }))
      })),
      projects: (sections.projects ?? []).map((p) => ({
        name: p.name,
        description: p.description,
        highlights: p.highlights
      }))
    };
  }
  const job = source as JobPosting;
  return {
    title: job.title ?? '',
    description: job.description ?? '',
    requirements: job.requirements ?? [],
    niceToHaves: job.niceToHaves ?? [],
    benefits: job.benefits ?? []
  };
}
