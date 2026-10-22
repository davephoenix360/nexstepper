import {
  composeOverallScore,
  scoreResumeFromEnvelope,
  type ScoreBreakdown
} from '@/lib/scoring';
import type { ResumeData, JobPosting } from '@/lib/resume-schema';
import { hybridSimilarity } from './hybrid-similarity';
import { evaluateJevRequirements } from './jev-requirements';

/**
 * Enhanced score wrapper.
 *
 * Two signals are substituted into the always-on sync engine:
 *
 * 1. **The ATS `similarityScore` sub-criterion** is replaced with the
 *    hybrid BM25 + semantic-embedding value from `hybrid-similarity.ts`.
 *    (Phase 3 of the post-ship engine review —
 *    `docs/drift/2026-09-19-ats-engine-review.md`.)
 *
 * 2. **The ATS `keywordScore` sub-criterion** is replaced with Jev's
 *    measurement of the JD's GENUINE requirements and how strongly the
 *    resume evidences each one. The token-based score counted every
 *    non-stop-word token in the JD — including the description and the
 *    benefits — so a candidate with every required skill still lost
 *    points for not containing "insurance", "budget", "remote" and
 *    "friendly". Measured against the 50-JD validation corpus, this
 *    moves Pearson r from 0.910 to 0.934.
 *
 * Everything else — structure, content quality, alignment, intent
 * coverage, role fit, seniority fit — is the sync engine's own output,
 * untouched.
 *
 * Lives in `lib/scoring-async/` (NOT `lib/scoring/`) for the same
 * purity-invariant reasons as the underlying `semantic-similarity.ts`,
 * `hybrid-similarity.ts` and `jev-requirements.ts` modules.
 *
 * Why a wrapper, not a refactor of `scoreResume`:
 *   - The sync engine is purity-tested; making it async would break
 *     the contract and require touching every dimension.
 *   - The enhanced path is opt-in (default scoring still uses BM25).
 *     Wrapping lets us add it without modifying the always-on engine.
 *   - The substitutions are localized and visible.
 */

/**
 * Score a resume against a job posting using the ENHANCED engine.
 *
 * Same return shape as `scoreResumeFromEnvelope` so the existing
 * Scorecard UI can render the breakdown without changes.
 *
 * Returns a modified `ScoreBreakdown`:
 *   - `criteriaScores['ATS Similarity']` <- hybrid value * 100
 *     (replaces the BM25-only similarity score from the sync engine).
 *   - `criteriaScores['ATS Keyword Match']` <- Jev's genuine-requirement
 *     coverage and evidence depth (when the evaluation succeeded).
 *   - `dimensionScores.atsMatching` <- re-weighted to use the new
 *     sub-scores.
 *   - `overallScore` <- recomposed with the engine's own weights.
 *
 * @param resume The full `ResumeData` envelope.
 * @param job The full `JobPosting` envelope. Required - the enhanced
 *   scorer always needs the JD.
 * @returns The modified `ScoreBreakdown`.
 */
export async function scoreResumeHybridFromEnvelope(
  resume: ResumeData,
  job: JobPosting
): Promise<ScoreBreakdown> {
  // 0. Ask Jev which of the JD's requirement lines are genuine skills
  //    and how strongly the resume evidences each one.
  //
  //    A failed call is not an error: the evaluation comes back with
  //    `ok: false` and the engine keeps the token-based score.
  const evaluation = await evaluateJevRequirements(resume, job);

  // 1. Run the sync engine first to get the unchanged baseline.
  // Pass `new Date()` as the engine's clock so the envelope-aware
  // Seniority Fit dimension gets real tenure signal (drift memo
  // 2026-09-20-ats-v2-validation-corpus.md §3 follow-up #1).
  const baseline = scoreResumeFromEnvelope(
    resume,
    job,
    new Date(),
    { roleFitSimilarity: null },
    { evaluation }
  );

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

  // 4. Recompose the overall score from the new atsMatching dimension
  //    value + the other six dimensions.
  //
  //    Uses the engine's OWN composition function so the enhanced score
  //    and the sync score are on the same scale. This wrapper used to
  //    hard-code the v1 weights (0.3 / 0.2 / 0.3 / 0.2) and recompose
  //    from four dimensions only, dropping Intent Coverage, Role Fit and
  //    Seniority Fit — so pressing "Recompute with semantic" produced a
  //    score on a different scale to the default one. Same resume,
  //    different number, depending on the button.
  const newOverall = composeOverallScore(
    {
      ...baseline.dimensionScores,
      atsMatching: newAtsMatching
    },
    !baseline.intentCoverageBreakdown.fallback
  );

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
 * The keyword sub-score is whatever the sync engine computed — the
 * Jev-derived one when the evaluation succeeded, the token-based one
 * otherwise. Either way this function only substitutes the similarity.
 *
 * Caller passes the requirement-count signal directly (read from the
 * JD envelope) - we can't infer it from the baseline breakdown without
 * ambiguity.
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
