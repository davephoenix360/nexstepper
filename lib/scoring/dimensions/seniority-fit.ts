import type { JobPosting, ResumeData } from '@/lib/resume-schema';
import { parseYearMonthForTenure, type YearMonth } from '@/lib/scoring/date-parse';

/**
 * v2 Seniority Fit dimension.
 *
 * Plan: docs/plans/ats-scoring-v2.md (Phase 2).
 *
 * Compares the candidate's total years of experience against the
 * JD's stated `yearsRequiredMin` / `yearsRequiredMax`. Returns
 * 100 when the candidate is at or above the requirement, and a
 * steep penalty when under-qualified (asymmetric — over-qualifying
 * costs far less).
 *
 * Lives in `lib/scoring/dimensions/` (sync engine) because the
 * computation is pure math — no model call, no async, no IO. Years
 * are inferred from the work-history dates already on the envelope.
 *
 * Asymmetric penalty rationale (per the research report + 50-row corpus):
 *   - Under-qualified: a JD asking for 5 years but the candidate
 *     has 2 should drop the score substantially — the candidate
 *     genuinely can't evidence the experience.
 *   - Over-qualified: a JD asking for 5 years but the candidate
 *     has 12 is a **neutral signal**, not a small negative. The
 *     corpus (Pearson r = 0.907 → 0.92+ after this fix) revealed
 *     that any over-qualification penalty was inverting the rank
 *     order for senior-track JDs: the BEST candidates were getting
 *     the LOWEST seniority scores because they were the most over-
 *     qualified. Recruiters don't penalize "too much experience"
 *     beyond the tolerance band.
 *   - Sweet spot: within ±TOLERANCE_YEARS of the requirement is 100.
 *   - Beyond the tolerance: linear penalty on the UNDER-qualified
 *     side; **no penalty** on the OVER-qualified side.
 *   - jdYearsMax ceiling: still penalizes if a JD explicitly states
 *     an upper bound (rare). Same OVER_QUALIFIED_SLOPE is reused.
 *
 * **Purity discipline.** This module is checked by
 * `tests/unit/scoring/purity.test.ts` which bans `Date`, `Date.now`,
 * `new Date`, `Math.random`, `fetch`, etc. to keep the engine
 * deterministic. We parse ISO date strings into a tiny
 * `{year, month}` shape and do arithmetic on integers — no `Date`
 * objects inside the dimension. The `now` parameter is the only
 * place a Date shows up, and it's required (no default) so the
 * purity test grep doesn't catch a sneaky `new Date()` somewhere
 * in the function body.
 */

export interface SeniorityFitResult {
  /** 0-100. Higher = better alignment with the JD's experience ask. */
  value: number;
  /** Computed total years of experience from the resume work history. */
  resumeYears: number;
  /** JD's minimum years (null when the JD didn't disclose). */
  jdYearsMin: number | null;
  /** JD's maximum years (null when not stated). */
  jdYearsMax: number | null;
  /** Signed gap (resume - jdMin). Negative = under-qualified. Null when JD has no years. */
  gap: number | null;
  /** True when no usable years signal was available. */
  fallback: boolean;
}

/** Neutral score when no usable seniority signal is present. */
export const NEUTRAL_SENIORITY_FIT_SCORE = 50;

/**
 * Tolerance band around the JD's required years. Within ±2 years,
 * the candidate is treated as "meets" the requirement and gets a
 * full 100. Outside this band, the penalty kicks in.
 *
 * 2 years matches how recruiters think: "5+ years" usually means
 * "anywhere from 3 to 10 years is fine". A 2-year band keeps the
 * sweet spot inclusive without being so loose that a 1-year
 * candidate still passes a "5+ years" JD.
 */
const TOLERANCE_YEARS = 2;
/**
 * Penalty slope per year OUTSIDE the tolerance band.
 *
 * - UNDER_QUALIFIED_SLOPE = 25: a 4-year gap under-qualified scores 0
 *   (100 - 4×25 = 0). Steep, because the candidate genuinely can't
 *   evidence the experience the JD asks for.
 *
 * - OVER_QUALIFIED_SLOPE: only used by the `jdYearsMax` ceiling branch
 *   below (when a JD explicitly states an upper bound, e.g.
 *   "5-8 years"). The main over-qualification path past the
 *   tolerance band is a **no-op** — recruiters don't penalize
 *   "too much experience" beyond the tolerance. The 7.5 figure is
 *   kept here only for the rare JD-explicit-max case; if your
 *   corpus ever suggests it should be 0 too, the ceiling branch
 *   can be removed entirely.
 */
const UNDER_QUALIFIED_SLOPE = 25;
const OVER_QUALIFIED_SLOPE = 7.5;
/** Clamp the score to [0, 100]. */
const MIN_SCORE = 0;
const MAX_SCORE = 100;

/**
 * Compute Seniority Fit for a (resume, job) pair. Pure / sync.
 *
 * Returns NEUTRAL when:
 *   - JD has no `yearsRequiredMin` (most JDs don't quantify)
 *   - Resume has no work history (we can't compute years)
 *
 * `now` is REQUIRED (no default) so callers can't accidentally
 * import `new Date()` into the purity-tested engine module. The
 * single production caller (`score.ts`) injects its own clock so
 * the engine stays fully deterministic — same pattern as
 * `performance.now()` for `computedInMs`.
 *
 * Test fixtures pass an explicit `new Date('2026-01-01')` (or
 * similar) so the bench + unit tests have deterministic years.
 */
export function scoreSeniorityFit(
  resume: ResumeData,
  job: JobPosting,
  now: Date
): SeniorityFitResult {
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

  const resumeYears = computeResumeYears(resume, now);
  if (resumeYears === 0) {
    // No work history we can measure — can't compute years even if JD
    // asks for some. Fall back to neutral (consistent with how the
    // engine treats "no signal" elsewhere).
    return {
      value: NEUTRAL_SENIORITY_FIT_SCORE,
      resumeYears: 0,
      jdYearsMin,
      jdYearsMax,
      gap: -jdYearsMin,
      fallback: true
    };
  }

  const gap = resumeYears - jdYearsMin;
  let value: number;

  if (gap >= -TOLERANCE_YEARS && gap <= TOLERANCE_YEARS) {
    // Inside the tolerance band — full marks.
    value = 100;
  } else if (gap < -TOLERANCE_YEARS) {
    // Under-qualified by more than the tolerance. Steep penalty.
    const yearsShort = -gap - TOLERANCE_YEARS;
    value = Math.max(MIN_SCORE, 100 - yearsShort * UNDER_QUALIFIED_SLOPE);
  } else {
    // Over-qualified by more than the tolerance. No penalty — see
    // the doc comment at the top of the file. The corpus (Pearson r
    // analysis) confirmed that any over-qualification penalty here
    // was inverting the rank order for senior-track JDs.
    value = MAX_SCORE;
  }

  // Optional ceiling: when JD explicitly states a max (rare), treat
  // any resume-years above that max as over-qualified even within
  // the tolerance band. Symmetric penalty still applies.
  if (jdYearsMax !== null && resumeYears > jdYearsMax + TOLERANCE_YEARS) {
    const yearsOverMax = resumeYears - jdYearsMax - TOLERANCE_YEARS;
    value = Math.max(MIN_SCORE, 100 - yearsOverMax * OVER_QUALIFIED_SLOPE);
  }

  return {
    value: Math.round(value),
    resumeYears,
    jdYearsMin,
    jdYearsMax,
    gap,
    fallback: false
  };
}

/**
 * Compute the candidate's total years of experience from the
 * work-history dates on the envelope.
 *
 * Strategy: sum the months of each work position, capped at
 * MAX_YEARS (30) so a candidate with 50 years of exp doesn't
 * produce an unbounded score. Months-accurate; rounds to integer
 * years at the end.
 *
 * Pure / sync — does NOT use `Date` (the purity test bans `new
 * Date` + `Date.now`). Instead parses date strings into a tiny
 * `{year, month}` shape and does arithmetic on integers. The `now`
 * Date parameter is only used to construct a `YearMonth` snapshot
 * of "today" for tenure math.
 */
function computeResumeYears(resume: ResumeData, now: Date): number {
  const MAX_YEARS = 30; // sanity cap
  const nowYM = nowToYearMonth(now);

  // Sum per-position tenure. Overlapping roles at different
  // companies count independently (parallel job-hops are common
  // in tech — candidates shouldn't be penalized for running two
  // concurrent gigs).
  let totalMonths = 0;
  for (const company of resume.sections.work) {
    for (const pos of company.positions) {
      const start = parseResumeDate(pos.startDate);
      if (!start) continue;
      const isPresent =
        !pos.endDate || pos.endDate.trim().toLowerCase() === 'present';
      const end = isPresent ? nowYM : parseResumeDate(pos.endDate);
      if (!end) continue;
      // A role that ENDS IN THE FUTURE has not happened yet. A
      // student listing "May 2026 – December 2026" has worked from
      // May to now — not for eight months. Clamping to `now` keeps
      // the dimension from paying the candidate for time they have
      // not worked yet.
      const effectiveEnd =
        end.year > nowYM.year ||
        (end.year === nowYM.year && end.month > nowYM.month)
          ? nowYM
          : end;
      const months = monthDiff(start, effectiveEnd);
      if (months > 0) totalMonths += months;
    }
  }

  return Math.min(MAX_YEARS, Math.round(totalMonths / 12));
}

/**
 * Tiny year/month value object. Avoids Date entirely so the
 * dimension stays inside the purity test's invariants.
 *
 * `YearMonth` itself now lives in `lib/scoring/date-parse.ts`, shared
 * with the eligibility module — see the note there for why there is
 * exactly one date parser in the engine.
 */
type DimensionYearMonth = YearMonth;

/**
 * Convert a Date to a YearMonth. Only called on the caller-provided
 * `now` parameter (which score.ts injects from `performance.timeOrigin
 * + performance.now()` style — outside the purity-tested module). The
 * purity test never executes this code path because every test
 * fixture passes an explicit Date.
 */
function nowToYearMonth(d: Date): DimensionYearMonth {
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

/**
 * Parse a resume date string into a year and month.
 *
 * ## Why this is not an ISO-only parser any more
 *
 * This dimension used to carry its own ISO-only parser, while the
 * eligibility module beside it understood the formats resumes actually
 * use. The consequence was invisible and unfair: **the date format a
 * candidate typed decided their Seniority Fit score.**
 *
 * A resume whose dates were "May 2026" / "September 2022" parsed to
 * nothing, the year total came out as 0, and the dimension returned its
 * neutral 50 — which reads like "we couldn't measure this" but
 * actually charges the candidate 5 of their 100 points against a JD
 * that asked for no experience at all. The same candidate with
 * "2026-05" scored 100.
 *
 * Now both dimensions share `parseYearMonthForTenure` from
 * `lib/scoring/date-parse.ts`.
 *
 * `parseYearMonthForTenure` (rather than the plain parser) because a
 * bare year ("2020") has no month and tenure arithmetic needs one —
 * January is the conventional stand-in.
 */
function parseResumeDate(
  value: string | undefined
): DimensionYearMonth | null {
  return parseYearMonthForTenure(value);
}

/**
 * Months between two YearMonth values. Both inclusive (treats
 * partial months as full months — matches how recruiters think:
 * "worked there from June 2020 to June 2023" is 3 years, not 2.99).
 */
function monthDiff(
  start: DimensionYearMonth,
  end: DimensionYearMonth
): number {
  return (end.year - start.year) * 12 + (end.month - start.month);
}
