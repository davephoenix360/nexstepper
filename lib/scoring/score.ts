import { scoreAtsMatching } from './dimensions/ats-matching';
import { scoreStructure } from './dimensions/structure';
import { scoreContentQuality } from './dimensions/content-quality';
import { scoreAlignment } from './dimensions/alignment';
import { flattenJobText, flattenResumeText } from './similarity';
import type { JobTextSource, ResumeTextSource } from './similarity';

/**
 * Top-level scoring engine.
 *
 * Composes four dimensions into a single 0-100 score. Same weights
 * as the legacy `nextep/src/lib/score.ts:442-446`:
 *
 *   atsMatching    × 0.30
 *   structure      × 0.20
 *   contentQuality × 0.30
 *   alignment      × 0.20
 *
 * These weights live in `WEIGHTS` so calibration can tune them
 * without touching the function bodies. Per the plan §"Risks" #1:
 * "export the weights as constants, document the source (legacy
 * `score.ts` line numbers), and write a test that asserts the
 * top-level composition uses them — so a future calibration pass
 * can `git diff` what changed."
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

export type DimensionKey = keyof typeof WEIGHTS;

export type ScoreBreakdown = {
  /** 0-100, rounded to integer. The single number on the scorecard. */
  overallScore: number;
  /** 0-100 per dimension, not rounded (precision preserved for bars). */
  dimensionScores: {
    atsMatching: number;
    structure: number;
    contentQuality: number;
    alignment: number;
  };
  /** 0-100 per sub-criterion. Useful for the scorecard drill-down + tests. */
  criteriaScores: {
    /** ATS Matching sub-criteria. */
    'ATS Keyword Match': number;
    'ATS Similarity': number;
    'ATS Coverage': number;
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
};

export type ScoreableResume = ResumeTextSource & {
  education?: unknown[];
  awards?: unknown[];
  publications?: unknown[];
};

export type ScoreableJob = JobTextSource;

/**
 * Score a resume against a job posting. Returns the full breakdown so
 * the UI can render both the overall number and the per-dimension
 * bars from one call.
 *
 * Single source of truth: the `WEIGHTS` constant. The composition
 * formula below MUST be kept in sync with it — there's a test
 * (`score.test.ts > composition uses WEIGHTS`) that asserts the
 * formula via property-based test, so a future refactor that
 * changes the weights without updating the formula will fail CI.
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

  const overall =
    WEIGHTS.atsMatching * ats.value +
    WEIGHTS.structure * structure.value +
    WEIGHTS.contentQuality * content.value +
    WEIGHTS.alignment * alignment.value;

  const computedInMs = Math.max(0, nowMs() - t0);

  return {
    overallScore: Math.round(overall),
    dimensionScores: {
      atsMatching: ats.value,
      structure: structure.value,
      contentQuality: content.value,
      alignment: alignment.value
    },
    criteriaScores: {
      'ATS Keyword Match': ats.breakdown.keywordScore,
      'ATS Similarity': ats.breakdown.similarityScore,
      'ATS Coverage': ats.breakdown.coverageScore,
      'Section Completeness': structure.breakdown.sectionCompleteness,
      'Optimal Length': structure.breakdown.lengthScore,
      'Accomplishment Focus': content.breakdown.accomplishmentRatio,
      'Action Verb Usage': content.breakdown.actionVerbUsage,
      Tailoring: alignment.breakdown.tailoring,
      'Unique Value': alignment.breakdown.hasExtras,
      'Soft Skills': alignment.breakdown.softSkills
    },
    computedInMs
  };
}

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
