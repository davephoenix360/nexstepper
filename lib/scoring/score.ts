import { scoreAtsMatching } from './dimensions/ats-matching';
import { scoreStructure } from './dimensions/structure';
import { scoreContentQuality } from './dimensions/content-quality';
import { scoreAlignment } from './dimensions/alignment';
import {
  scoreIntentCoverageParams,
  NEUTRAL_INTENT_COVERAGE_SCORE,
  type IntentCoverageBreakdown
} from './dimensions/intent-coverage';
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
 * v2 weights — see the doc comment on `WEIGHTS`. Used when the JD
 * has populated `mustHaveSkills` / `niceToHaveSkills` /
 * `implicitSkills` (i.e. the v2 extractor produced useful output).
 * Sum: 1.00 (0.85 from the four scaled v1 dimensions + 0.15 from
 * Intent Coverage).
 */
export const WEIGHTS_V2 = {
  atsMatching: 0.255,
  structure: 0.17,
  contentQuality: 0.255,
  alignment: 0.17,
  intentCoverage: 0.15
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
  job: ScoreableJob
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

  // Pick the weight set based on v2 data availability. Pure v1
  // behavior when no v2 intent; v2 weights otherwise. The formula
  // below branches on `useV2Weights` but only computes arithmetic
  // — no IO, no async. Purity is preserved.
  const useV2Weights = !intentCoverageBreakdown.fallback;
  // The conditional creates a union type where TS can't statically
  // confirm `intentCoverage` exists on both branches. The v1
  // branch (WEIGHTS) gets `intentCoverage` defaulted to 0 inside
  // the score formula — neutral weight, neutral contribution.
  // Compose into a single `w` value with a stable shape so the
  // arithmetic below is one branch instead of two.
  const w = useV2Weights
    ? {
        atsMatching: WEIGHTS_V2.atsMatching,
        structure: WEIGHTS_V2.structure,
        contentQuality: WEIGHTS_V2.contentQuality,
        alignment: WEIGHTS_V2.alignment,
        intentCoverage: WEIGHTS_V2.intentCoverage
      }
    : {
        atsMatching: WEIGHTS.atsMatching,
        structure: WEIGHTS.structure,
        contentQuality: WEIGHTS.contentQuality,
        alignment: WEIGHTS.alignment,
        intentCoverage: 0
      };

  const overall =
    w.atsMatching * ats.value +
    w.structure * structure.value +
    w.contentQuality * content.value +
    w.alignment * alignment.value +
    w.intentCoverage * intentCoverageBreakdown.value;

  const computedInMs = Math.max(0, nowMs() - t0);

  return {
    overallScore: Math.round(overall),
    dimensionScores: {
      atsMatching: ats.value,
      structure: structure.value,
      contentQuality: content.value,
      alignment: alignment.value,
      intentCoverage: intentCoverageBreakdown.value
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
  job: JobPosting | null
): ScoreBreakdown {
  return scoreResume(resumeDataToScoreable(resume), job === null ? {} : {
    title: job.title ?? '',
    description: job.description ?? '',
    requirements: job.requirements ?? [],
    niceToHaves: job.niceToHaves ?? [],
    benefits: job.benefits ?? [],
    mustHaveSkills: job.mustHaveSkills ?? [],
    niceToHaveSkills: job.niceToHaveSkills ?? [],
    implicitSkills: job.implicitSkills ?? []
  });
}

// Re-export the neutral score so callers (e.g. tests) can reference it
// without importing the dimension directly.
export { NEUTRAL_INTENT_COVERAGE_SCORE };
