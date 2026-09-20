import type { JobPosting, ResumeData } from '@/lib/resume-schema';

/**
 * v2 Intent Coverage dimension.
 *
 * Plan: docs/plans/ats-scoring-v2.md (Phase 1).
 *
 * Replaces the v1 "ATS Keyword Match" surface (token-set overlap on
 * JD description) with a priority-weighted score that uses the LLM-
 * extracted `mustHaveSkills`, `niceToHaveSkills`, and `implicitSkills`
 * lists. Missing a must-have skill costs ~3x more than missing a
 * nice-to-have, which is the whole point of v2 — the candidate
 * knows where to focus.
 *
 * Lives in `lib/scoring/dimensions/` (sync engine) because:
 *   1. The LLM extraction runs ONCE per JD attach (cached on the
 *      jobPosting row). By the time we score, the intent is just
 *      data — no model call here.
 *   2. Adding this dimension to the sync engine keeps the purity
 *      invariant: no async, no IO, no Math.random. Asserted by
 *      `tests/unit/scoring/purity.test.ts` and
 *      `tests/unit/scoring/latency.bench.test.ts`.
 *   3. The hybrid wrapper (`score-hybrid.ts`) still works — it
 *      calls `scoreResumeFromEnvelope` first (now with Intent
 *      Coverage included) and only swaps the ATS Similarity sub-
 *      criterion. Intent Coverage survives the wrapper because
 *      we don't touch it.
 *
 * Skill matching is case-insensitive substring on the flattened
 * resume text. Same as v1's `computeMissingKeywords` — keeps
 * the v1/v2 transition honest (no behavior change for JDs that
 * didn't run through the v2 extractor).
 *
 * When the JD has no v2 intent fields (legacy rows, failed
 * extraction), returns the neutral `NEUTRAL_SCORE` (50) so the
 * dimension contributes nothing signal — v1 token matching still
 * drives the ATS Keyword Match sub-criterion via the existing
 * scoring dimensions.
 */

export interface IntentCoverageBreakdown {
  /** 0-100. Higher = resume covers more of the JD's stated priorities. */
  value: number;
  /** Per-priority miss lists, in priority order. Empty when value is 100 or when v2 data is unavailable. */
  missed: {
    mustHave: string[];
    niceToHave: string[];
    implicit: string[];
  };
  /** Total weighted penalty applied. 0 = perfect coverage. */
  penalty: number;
  /** True when no v2 intent fields were available and we fell back to neutral. */
  fallback: boolean;
}

/** Neutral score when no v2 intent is available. Pulls no signal in either direction. */
export const NEUTRAL_INTENT_COVERAGE_SCORE = 50;

/** Penalty per missing must-have skill, in "points out of 100". */
const MUST_HAVE_PENALTY = 8;
/** Penalty per missing nice-to-have skill. ~1/3 the cost of a must-have. */
const NICE_TO_HAVE_PENALTY = 2.5;
/** Penalty per missing implicit skill. Half the cost of a nice-to-have. */
const IMPLICIT_PENALTY = 1.5;

/** Max items per priority list to penalize. Beyond this we cap — protects against runaway JDs. */
const MAX_PER_PRIORITY = 20;

/**
 * Low-level scorer. Takes the priority lists + a pre-flattened
 * lowercase resume text. Pure / sync / no IO.
 *
 * Exposed as the canonical entry point so the sync engine can
 * pass its already-computed `flattenResumeText(resume)` rather
 * than re-flattening. Returns a neutral breakdown when no v2
 * intent is available.
 */
export function scoreIntentCoverageParams(params: {
  mustHaveSkills: string[];
  niceToHaveSkills: string[];
  implicitSkills: string[];
  /** Lowercased — case-insensitive substring match. */
  resumeTextLower: string;
}): IntentCoverageBreakdown {
  const { mustHaveSkills, niceToHaveSkills, implicitSkills, resumeTextLower } =
    params;

  // No v2 intent data → neutral. This is the explicit fallback
  // path for legacy rows + JDs where the extractor failed.
  if (
    mustHaveSkills.length === 0 &&
    niceToHaveSkills.length === 0 &&
    implicitSkills.length === 0
  ) {
    return {
      value: NEUTRAL_INTENT_COVERAGE_SCORE,
      missed: { mustHave: [], niceToHave: [], implicit: [] },
      penalty: 0,
      fallback: true
    };
  }

  const missedMustHave = findMissing(mustHaveSkills, resumeTextLower);
  const missedNiceToHave = findMissing(niceToHaveSkills, resumeTextLower);
  const missedImplicit = findMissing(implicitSkills, resumeTextLower);

  // Weighted penalty. Cap each priority list at MAX_PER_PRIORITY
  // so a JD with 50 must-haves can't push the score below 0 from
  // one missing-skill classification (caller-side length cap, see
  // `extractJdIntentSchema`).
  const penalty =
    Math.min(missedMustHave.length, MAX_PER_PRIORITY) * MUST_HAVE_PENALTY +
    Math.min(missedNiceToHave.length, MAX_PER_PRIORITY) * NICE_TO_HAVE_PENALTY +
    Math.min(missedImplicit.length, MAX_PER_PRIORITY) * IMPLICIT_PENALTY;

  // Clamp to [0, 100]. A perfect score (every priority hit) yields
  // 100; a fully-empty resume yields 0. In practice, a resume
  // never hits either extreme.
  const value = Math.max(0, Math.min(100, 100 - penalty));

  return {
    value,
    missed: {
      mustHave: missedMustHave,
      niceToHave: missedNiceToHave,
      implicit: missedImplicit
    },
    penalty,
    fallback: false
  };
}

/**
 * Envelope-aware convenience wrapper. Adapts `ResumeData` +
 * `JobPosting` (the wide Zod-derived shapes) to the low-level
 * scorer. Used by external callers + tests that hold the envelope.
 *
 * Pure / sync. The resume text is flattened inline — fine for
 * one-off score calls but the sync engine uses the optimized
 * `scoreIntentCoverageParams` directly so it can share its
 * `flattenResumeText(resume)` pass with the other dimensions.
 */
export function scoreIntentCoverage(
  resume: ResumeData,
  job: JobPosting
): IntentCoverageBreakdown {
  return scoreIntentCoverageParams({
    mustHaveSkills: job.mustHaveSkills ?? [],
    niceToHaveSkills: job.niceToHaveSkills ?? [],
    implicitSkills: job.implicitSkills ?? [],
    resumeTextLower: flattenResumeTextForIntentCoverage(resume).toLowerCase()
  });
}

/**
 * Find the priority-list items NOT present in the resume text.
 * Case-insensitive substring match. Returns the original-cased
 * skill name (preserves the JD's terminology for the UI).
 */
function findMissing(skills: string[], resumeTextLower: string): string[] {
  const missed: string[] = [];
  for (const skill of skills) {
    if (typeof skill !== 'string' || skill.length === 0) continue;
    if (!resumeTextLower.includes(skill.toLowerCase())) {
      missed.push(skill);
    }
  }
  return missed;
}

/**
 * Flatten the resume envelope into a single searchable string.
 * Mirrors `flattenResumeText` from `lib/scoring/similarity.ts`
 * closely — same fields, same role-family coverage. Lives inline
 * here (not imported) so the v2 dimension has zero coupling to
 * the v1 similarity module. If we ever swap tokenization
 * strategies, we update both spots.
 */
function flattenResumeTextForIntentCoverage(resume: ResumeData): string {
  const sections = resume.sections;
  const parts: string[] = [];
  parts.push(sections.basics.summary ?? '', sections.basics.label ?? '');
  for (const s of sections.skills) {
    parts.push(s.name, ...(s.keywords ?? []));
  }
  for (const w of sections.work) {
    parts.push(w.description ?? '');
    for (const p of w.positions) {
      parts.push(p.title ?? '');
      if (p.highlights) parts.push(...p.highlights);
    }
  }
  for (const proj of sections.projects ?? []) {
    parts.push(proj.name ?? '', proj.description ?? '');
    if (proj.highlights) parts.push(...proj.highlights);
  }
  for (const edu of sections.education ?? []) {
    parts.push(
      edu.institution ?? '',
      edu.degree?.degreeLevel ?? '',
      ...(edu.degree?.majors ?? []),
      ...(edu.degree?.minors ?? [])
    );
  }
  for (const a of sections.awards ?? []) {
    parts.push(a.title ?? '', a.awarder ?? '');
  }
  for (const pub of sections.publications ?? []) {
    parts.push(pub.name ?? '', pub.publisher ?? '');
  }
  return parts.filter(Boolean).join(' ');
}
