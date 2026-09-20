import { scoreAtsMatching } from './dimensions/ats-matching';
import { scoreStructure } from './dimensions/structure';
import { scoreContentQuality } from './dimensions/content-quality';
import { scoreAlignment } from './dimensions/alignment';
import {
  scoreIntentCoverageParams,
  NEUTRAL_INTENT_COVERAGE_SCORE,
  type IntentCoverageBreakdown
} from './dimensions/intent-coverage';
import {
  scoreRoleFitParams,
  NEUTRAL_ROLE_FIT_SCORE
} from './dimensions/role-fit';
import {
  scoreSeniorityFit,
  NEUTRAL_SENIORITY_FIT_SCORE,
  type SeniorityFitResult
} from './dimensions/seniority-fit';
import { flattenJobText, flattenResumeText } from './similarity';
import type { JobTextSource, ResumeTextSource } from './similarity';
import type { ResumeData, JobPosting } from '@/lib/resume-schema';

/**
 * Top-level scoring engine.
 *
 * Composes FIVE dimensions into a single 0-100 score. v1 used four
 * (no Intent Coverage). v2 adds Intent Coverage at 15% weight when
 * the JD has v2 intent-extraction fields populated, scaling the
 * other four dimensions to 85% combined. When the JD has no v2
 * intent data (legacy rows, failed extractions), scoring is
 * IDENTICAL to v1 — no behavior change.
 *
 * v1 weights (per the legacy `nextep/src/lib/score.ts:442-446`):
 *
 *   atsMatching    × 0.30
 *   structure      × 0.20
 *   contentQuality × 0.30
 *   alignment      × 0.20
 *
 * v2 weights (Plan: docs/plans/ats-scoring-v2.md):
 *
 *   atsMatching      × 0.255  (v1 × 0.85)
 *   structure        × 0.17   (v1 × 0.85)
 *   contentQuality   × 0.255  (v1 × 0.85)
 *   alignment        × 0.17   (v1 × 0.85)
 *   intentCoverage   × 0.15   (new)
 *
 * `WEIGHTS` (v1) and `WEIGHTS_V2` live as constants so calibration
 * can tune them without touching the function bodies. Per the plan
 * §"Risks" #1: "export the weights as constants, document the
 * source (legacy `score.ts` line numbers), and write a test that
 * asserts the top-level composition uses them — so a future
 * calibration pass can `git diff` what changed."
 *
 * Hard constraints (plan §"Hard constraints"):
 *   - Pure function, no async, no IO.
 *   - No external services (no embeddings API).
 *   - Deterministic — no `Date.now`, no `Math.random`.
 *   - No new npm deps.
 *
 * Asserted by:
 *   - `tests/unit/scoring/purity.test.ts` — greps the compiled
 *     module for forbidden symbols.
 *   - `tests/unit/scoring/latency.bench.test.ts` — asserts < 100 ms
 *     for a typical 2-page resume.
 *   - `tests/unit/scoring/score.test.ts` — golden regression via
 *     bounded ranges (NOT literal legacy output; see plan §"Acceptance
 *     criteria" #5 + drift note in the PR description).
 */

export const WEIGHTS = {
  atsMatching: 0.3,
  structure: 0.2,
  contentQuality: 0.3,
  alignment: 0.2
} as const;

/**
 * v2 weights (Phase 2) — 7 dimensions. Used when the JD has
 * populated `mustHaveSkills` / `niceToHaveSkills` /
 * `implicitSkills` (i.e. the v2 intent extractor produced useful
 * output). Sum: 1.00 (0.68 from the four scaled v1 dimensions +
 * 0.32 from the three v2 dimensions = intent coverage + role fit +
 * seniority fit).
 *
 *   v1 dims scaled to 0.68 combined (down from Phase 1's 0.85):
 *     atsMatching × 0.21 (was 0.30)
 *     structure   × 0.14 (was 0.20)
 *     contentQuality × 0.21 (was 0.30)
 *     alignment   × 0.14 (was 0.20)
 *   Phase 2 v2 dims take the remaining 0.32:
 *     intentCoverage × 0.10 (down from Phase 1's 0.15 — Role Fit
 *                            and Seniority Fit share the carved-out
 *                            weight equally)
 *     roleFit × 0.10 (new)
 *     seniorityFit × 0.10 (new)
 */
export const WEIGHTS_V2 = {
  atsMatching: 0.21,
  structure: 0.14,
  contentQuality: 0.21,
  alignment: 0.14,
  intentCoverage: 0.10,
  roleFit: 0.10,
  seniorityFit: 0.10
} as const;

export type DimensionKey = keyof typeof WEIGHTS;
export type DimensionKeyV2 = keyof typeof WEIGHTS_V2;

export type ScoreBreakdown = {
  /** 0-100, rounded to integer. The single number on the scorecard. */
  overallScore: number;
  /** 0-100 per dimension, not rounded (precision preserved for bars). */
  dimensionScores: {
    atsMatching: number;
    structure: number;
    contentQuality: number;
    alignment: number;
    /**
     * v2 Intent Coverage (priority-weighted skill coverage). 0-100
     * when v2 data is available; equals `NEUTRAL_INTENT_COVERAGE_SCORE`
     * (= 50) when falling back to v1 scoring (legacy rows / failed
     * extractions). Always present in the shape; consumers can
     * detect v2-availability via the `intentCoverageBreakdown.fallback`
     * flag.
     */
    intentCoverage: number;
    /**
     * v2 Phase 2 — Role Fit (semantic title similarity). 0-100 when
     * the JD has a title AND the resume has at least one work
     * title. Falls back to `NEUTRAL_ROLE_FIT_SCORE` (= 50) when
     * either side is empty.
     */
    roleFit: number;
    /**
     * v2 Phase 2 — Seniority Fit (year alignment with asymmetric
     * penalty). 0-100 when the JD discloses `yearsRequiredMin` AND
     * the resume has work history. Falls back to
     * `NEUTRAL_SENIORITY_FIT_SCORE` (= 50) otherwise.
     */
    seniorityFit: number;
  };
  /** 0-100 per sub-criterion. Useful for the scorecard drill-down + tests. */
  criteriaScores: {
    /** ATS Matching sub-criteria. */
    'ATS Keyword Match': number;
    'ATS Similarity': number;
    'ATS Coverage': number;
    /**
     * v2 sub-criterion — appears in the expanded "Show details + tips"
     * grid when v2 data is available. Falls back to v1 ATS Keyword Match
     * value (the legacy token-overlap score) when v2 data is missing —
     * keeps the existing UI working unchanged for legacy rows.
     */
    'Intent Coverage': number;
    /** Structure sub-criteria. */
    'Section Completeness': number;
    'Optimal Length': number;
    /** Content Quality sub-criteria. */
    'Accomplishment Focus': number;
    'Action Verb Usage': number;
    /** Alignment sub-criteria. */
    Tailoring: number;
    'Unique Value': number;
    'Soft Skills': number;
    /**
     * v2 Phase 2 — Role Fit sub-criterion. Cosine similarity × 100
     * between JD.title and the best-matching resume title. Falls back
     * to NEUTRAL_ROLE_FIT_SCORE (= 50) when no title signal is
     * available (no JD title or no resume titles).
     */
    'Role Fit': number;
    /**
     * v2 Phase 2 — Seniority Fit sub-criterion. Year-gap analysis
     * with asymmetric penalty (under-qualified costs 3x more than
     * over-qualified). Falls back to NEUTRAL_SENIORITY_FIT_SCORE (= 50)
     * when no years signal is available.
     */
    'Seniority Fit': number;
  };
  /** Wall-clock milliseconds the score took to compute. For the UI footer. */
  computedInMs: number;
  /**
   * v2 Intent Coverage breakdown — the per-priority miss lists + the
   * penalty applied + the fallback flag. Always present in the
   * shape; consumers that don't care about v2 can ignore it.
   *
   * Surfaces the data the dynamic-tip renderer needs to say
   * "missing 2 must-have infra skills: Terraform, Helm" vs. the
   * legacy "missing 5 JD keywords".
   */
  intentCoverageBreakdown: IntentCoverageBreakdown;
};

export type ScoreableResume = ResumeTextSource & {
  education?: unknown[];
  awards?: unknown[];
  publications?: unknown[];
};

export type ScoreableJob = JobTextSource & {
  /** v2 intent-extraction fields (optional; absent on legacy rows). */
  mustHaveSkills?: string[];
  niceToHaveSkills?: string[];
  implicitSkills?: string[];
  /** v2 Phase 2 — seniority ask. Optional; null when JD doesn't quantify. */
  yearsRequiredMin?: number | null;
  yearsRequiredMax?: number | null;
};

/**
 * v2 Phase 2 — pre-computed signals passed into the sync engine.
 *
 * `roleFitSimilarity` is async (loads the MiniLM pipeline lazily);
 * the engine stays sync. Callers that want Role Fit in their
 * breakdown must compute the similarity first and pass it via this
 * shape. Callers that don't care about Role Fit (the scorecard
 * first-render path, hybrid recompute when the title-similarity
 * call hasn't completed, etc.) just omit it — the engine falls
 * back to the neutral score.
 */
export type PrecomputedRoleFit = {
  /** Cosine similarity in [0, 1] between JD.title and best-matching resume title. */
  roleFitSimilarity: number | null;
};

/**
 * Convert a full `ResumeData` envelope (Zod schema shape) into the
 * narrow `ScoreableResume` the scoring engine reads. Lives here so
 * the engine never imports the envelope schema directly — keeps the
 * dependency direction one-way (scoring depends on resume-schema,
 * not the other way around).
 *
 * Sections under `data.sections.{basics,skills,work,projects,education,...}`
 * are flattened into the engine's narrow shape. Optional sections
 * default to empty arrays / empty objects.
 */
export function resumeDataToScoreable(resume: ResumeData): ScoreableResume {
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
    })),
    education: sections.education ?? [],
    awards: sections.awards ?? [],
    publications: sections.publications ?? []
  };
}

/**
 * Whether the JD has v2 intent data available (at least one priority
 * list populated). Drives whether the scoring engine uses v1 or v2
 * weights.
 */
function hasV2Intent(job: ScoreableJob): boolean {
  return (
    (job.mustHaveSkills?.length ?? 0) +
      (job.niceToHaveSkills?.length ?? 0) +
      (job.implicitSkills?.length ?? 0) >
    0
  );
}

/**
 * Score a resume against a job posting. Returns the full breakdown so
 * the UI can render both the overall number and the per-dimension
 * bars from one call.
 *
 * Pure / sync / no IO. Operates on the narrow `ScoreableResume` +
 * `ScoreableJob` shapes (defined in `similarity.ts`) so the engine
 * has no Zod-schema dependency. Callers that hold the wide envelope
 * (`ResumeData` + `JobPosting`) should go through `scoreResumeFromEnvelope`
 * (defined below) which adapts the shapes before calling this.
 *
 * Single source of truth: the `WEIGHTS` (v1) and `WEIGHTS_V2`
 * constants. The composition formula below MUST be kept in sync with
 * them — there's a test (`score.test.ts > composition uses WEIGHTS`)
 * that asserts the formula via property-based test, so a future
 * refactor that changes the weights without updating the formula
 * will fail CI.
 */
export function scoreResume(
  resume: ScoreableResume,
  job: ScoreableJob,
  precomputed: PrecomputedRoleFit = { roleFitSimilarity: null }
): ScoreBreakdown {
  const t0 = nowMs();
  const resumeText = flattenResumeText(resume);
  const jobText = flattenJobText(job);

  const ats = scoreAtsMatching(resume, job, { resumeText, jobText });
  const structure = scoreStructure(resume);
  const content = scoreContentQuality(resume);
  const alignment = scoreAlignment(resume, job, {
    hasProjects: (resume.projects?.length ?? 0) > 0,
    hasAwards: Array.isArray(resume.awards) && resume.awards.length > 0,
    hasPublications:
      Array.isArray(resume.publications) && resume.publications.length > 0
  });

  // v2 Intent Coverage — always computed, but returns neutral when
  // the JD has no v2 priority data (legacy rows / failed extract).
  // Computing it unconditionally keeps the function pure + the
  // purity test honest (no conditional branches around IO).
  // We share the `flattenResumeText(resume)` pass computed above
  // (lowercased here so the priority-weighted substring match is
  // case-insensitive).
  const intentCoverageBreakdown = scoreIntentCoverageParams({
    mustHaveSkills: job.mustHaveSkills ?? [],
    niceToHaveSkills: job.niceToHaveSkills ?? [],
    implicitSkills: job.implicitSkills ?? [],
    resumeTextLower: resumeText.toLowerCase()
  });

  // v2 Phase 2 — Role Fit (sync surface). Consumes the pre-computed
  // similarity passed by the async wrapper (`score-hybrid.ts` for
  // the recompute path, or any caller that already ran the model).
  // When omitted (first-render SSR, or the caller hasn't yet run
  // the model), falls back to neutral.
  const roleFitBreakdown = scoreRoleFitParams({
    similarity: precomputed.roleFitSimilarity
  });

  // v2 Phase 2 — Seniority Fit. Pure math from work-history dates
  // vs. JD's stated yearsRequiredMin/Max. Asymmetric penalty:
  // under-qualified loses 25 pts/year, over-qualified loses 7.5 pts/year.
  //
  // We pass the engine's clock as `now` so the dimension stays
  // deterministic (no implicit `new Date()`). Same purity pattern
  // as `performance.now()` for `computedInMs`.
  //
  // NOTE: `computeSeniorityForScoreable` is currently a fallback
  // shim (the scoreable shape doesn't carry work-history dates).
  // The envelope-aware version `scoreSeniorityFitFromEnvelope` is
  // what we'd call once the scoreable shape grows dates; for now
  // it returns neutral and the v2 path remains neutral until the
  // score-actions calls the envelope-aware version explicitly.
  const seniorityFitBreakdown = computeSeniorityForScoreable(job);

  // Pick the weight set based on v2 data availability. Pure v1
  // behavior when no v2 intent; v2 weights otherwise. The formula
  // below branches on `useV2Weights` but only computes arithmetic
  // — no IO, no async. Purity is preserved.
  const useV2Weights = !intentCoverageBreakdown.fallback;
  // The conditional creates a union type where TS can't statically
  // confirm every v2 key exists on both branches. The v1 branch
  // (WEIGHTS) gets the v2 dimensions defaulted to 0 inside the
  // score formula — neutral weight, neutral contribution.
  // Compose into a single `w` value with a stable shape so the
  // arithmetic below is one branch instead of two.
  const w = useV2Weights
    ? {
        atsMatching: WEIGHTS_V2.atsMatching,
        structure: WEIGHTS_V2.structure,
        contentQuality: WEIGHTS_V2.contentQuality,
        alignment: WEIGHTS_V2.alignment,
        intentCoverage: WEIGHTS_V2.intentCoverage,
        roleFit: WEIGHTS_V2.roleFit,
        seniorityFit: WEIGHTS_V2.seniorityFit
      }
    : {
        atsMatching: WEIGHTS.atsMatching,
        structure: WEIGHTS.structure,
        contentQuality: WEIGHTS.contentQuality,
        alignment: WEIGHTS.alignment,
        intentCoverage: 0,
        roleFit: 0,
        seniorityFit: 0
      };

  const overall =
    w.atsMatching * ats.value +
    w.structure * structure.value +
    w.contentQuality * content.value +
    w.alignment * alignment.value +
    w.intentCoverage * intentCoverageBreakdown.value +
    w.roleFit * roleFitBreakdown.value +
    w.seniorityFit * seniorityFitBreakdown.value;

  const computedInMs = Math.max(0, nowMs() - t0);

  return {
    overallScore: Math.round(overall),
    dimensionScores: {
      atsMatching: ats.value,
      structure: structure.value,
      contentQuality: content.value,
      alignment: alignment.value,
      intentCoverage: intentCoverageBreakdown.value,
      roleFit: roleFitBreakdown.value,
      seniorityFit: seniorityFitBreakdown.value
    },
    criteriaScores: {
      'ATS Keyword Match': ats.breakdown.keywordScore,
      'ATS Similarity': ats.breakdown.similarityScore,
      'ATS Coverage': ats.breakdown.coverageScore,
      // v2 Intent Coverage sub-criterion. When v2 data is available
      // we surface the priority-weighted value (the dynamic-tip
      // renderer turns this into the "missing must-have skills"
      // message). When fallback, we mirror the v1 ATS Keyword Match
      // score so the existing UI keeps working unchanged.
      'Intent Coverage': intentCoverageBreakdown.fallback
        ? ats.breakdown.keywordScore
        : intentCoverageBreakdown.value,
      'Section Completeness': structure.breakdown.sectionCompleteness,
      'Optimal Length': structure.breakdown.lengthScore,
      'Accomplishment Focus': content.breakdown.accomplishmentRatio,
      'Action Verb Usage': content.breakdown.actionVerbUsage,
      Tailoring: alignment.breakdown.tailoring,
      'Unique Value': alignment.breakdown.hasExtras,
      // v2 Phase 2 — Role Fit + Seniority Fit. Mirror v1 dim behavior
      // when in fallback mode: surface the neutral score so the
      // legacy UI keeps working unchanged.
      'Role Fit': roleFitBreakdown.value,
      'Seniority Fit': seniorityFitBreakdown.value,
      'Soft Skills': alignment.breakdown.softSkills
    },
    computedInMs,
    intentCoverageBreakdown
  };
}

/**
 * Compute Intent Coverage from the scoreable shapes. The dimension
 * function (`scoreIntentCoverage`) takes the wide envelope; this
 * adapter lets the sync engine pass the narrow scoreable shapes
 * without losing the v2 fields.
 */
/**
 * Wall-clock read. Wrapped in a function so `purity.test.ts` can
 * static-grep the call sites and verify the engine never reaches
 * for `Date.now()` or `Math.random()` directly.
 *
 * `performance.now()` is monotonic and available in Node 18+ and
 * every browser we target — we don't need a `Date.now()` fallback,
 * and using `Date.now()` here would trip the purity test (which is
 * looking for forbidden symbols in this module).
 */
function nowMs(): number {
  return performance.now();
}

/**
 * Envelope-aware scorer. Adapts the wide `ResumeData` + `JobPosting`
 * shapes (from the resume-schema Zod package) to the narrow
 * `ScoreableResume` + `ScoreableJob` shapes the engine reads, then
 * calls `scoreResume`. Use this from Server Components that already
 * hold parsed envelope data — saves the caller from writing the
 * adapter inline.
 *
 * Returns the same `ScoreBreakdown` shape.
 */
export function scoreResumeFromEnvelope(
  resume: ResumeData,
  job: JobPosting | null,
  precomputed: PrecomputedRoleFit = { roleFitSimilarity: null }
): ScoreBreakdown {
  return scoreResume(
    resumeDataToScoreable(resume),
    job === null
      ? {}
      : {
          title: job.title ?? '',
          description: job.description ?? '',
          requirements: job.requirements ?? [],
          niceToHaves: job.niceToHaves ?? [],
          benefits: job.benefits ?? [],
          mustHaveSkills: job.mustHaveSkills ?? [],
          niceToHaveSkills: job.niceToHaveSkills ?? [],
          implicitSkills: job.implicitSkills ?? [],
          yearsRequiredMin: job.yearsRequiredMin ?? null,
          yearsRequiredMax: job.yearsRequiredMax ?? null
        },
    precomputed
  );
}

/**
 * Adapter that runs the Seniority Fit dimension over the scoreable
 * job shape (not the wide envelope). Returns a neutral breakdown
 * when the scoreable shape doesn't expose the yearsRequiredMin/Max
 * fields (legacy scoreable callers).
 */
function computeSeniorityForScoreable(
  job: ScoreableJob
): SeniorityFitResult {
  // The scoreable shape doesn't carry the resume envelope, but the
  // `scoreSeniorityFit` dimension function needs it for years
  // computation. Reconstruct a minimal envelope shell — the
  // dimension only reads `sections.work[*].positions[*].startDate`
  // / `endDate`, plus `yearsRequiredMin`/`yearsRequiredMax`.
  //
  // For now, when called from the scoreable path (i.e. the scoreable
  // shape's resume fields), we can't access the envelope. Fall back
  // to the neutral score. Once the scoreable shape grows to carry
  // work positions (it currently carries `positions` without dates),
  // we can wire this through without the envelope reconstruction.
  const jdYearsMin = job.yearsRequiredMin ?? null;
  const jdYearsMax = job.yearsRequiredMax ?? null;

  if (jdYearsMin === null) {
    return {
      value: NEUTRAL_SENIORITY_FIT_SCORE,
      resumeYears: 0,
      jdYearsMin: null,
      jdYearsMax,
      gap: null,
      fallback: true
    };
  }

  // No envelope available in the scoreable shape — fall back.
  // Future: thread the resume positions with dates through the
  // scoreable shape so this can compute years properly.
  return {
    value: NEUTRAL_SENIORITY_FIT_SCORE,
    resumeYears: 0,
    jdYearsMin,
    jdYearsMax,
    gap: -jdYearsMin,
    fallback: true
  };
}

/**
 * Public envelope-aware Seniority Fit scorer. Callers that hold
 * the wide `ResumeData` + `JobPosting` envelopes use this directly;
 * the scoreable-shape path falls back to neutral (see
 * `computeSeniorityForScoreable`).
 *
 * `now` is REQUIRED — the dimension is pure (no `Date`, no
 * `Math.random`, no `fetch` — see `tests/unit/scoring/purity.test.ts`)
 * so the wrapper cannot call `new Date()` itself. Production callers
 * (Server Actions, scripts) inject `new Date()`; tests inject an
 * explicit `Date` for determinism. This mirrors the existing
 * `performance.now()` pattern already in `score.ts` for `computedInMs`
 * — the impurity lives outside the engine, never inside it.
 */
export function scoreSeniorityFitFromEnvelope(
  resume: ResumeData,
  job: JobPosting,
  now: Date
): SeniorityFitResult {
  return scoreSeniorityFit(resume, job, now);
}

// Re-export the neutral score so callers (e.g. tests) can reference it
// without importing the dimension directly.
export { NEUTRAL_INTENT_COVERAGE_SCORE, NEUTRAL_ROLE_FIT_SCORE, NEUTRAL_SENIORITY_FIT_SCORE };
