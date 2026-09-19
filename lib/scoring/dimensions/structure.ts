import { wordCount } from '../similarity';
import type { ResumeTextSource } from '../similarity';

/**
 * Structure dimension (20% of the overall score).
 *
 * Two sub-criteria, each scored 0-100, then averaged with equal
 * weight:
 *   1. `sectionCompleteness` — 25% per present section (basics,
 *      work, education, skills). 4 sections × 25% = 100%.
 *   2. `lengthScore`        — penalty for over/under the 500-800
 *      word sweet spot. A 650-word resume scores 100; each word off
 *      the target costs 0.1 points (capped at 0). Same curve as
 *      the legacy's `score.ts:386-388`.
 *
 * No JD interaction — structure is a property of the resume alone.
 * That's why this is the simplest dimension and ships first.
 *
 * Drift from plan: the plan says "basics + work + education + skills"
 * for the section check. We also accept projects / awards /
 * publications as a 5th "extras" section that boosts completeness
 * above 100% — actually, no, we cap at 100. Just the 4 listed.
 */

export type StructureScore = {
  /** 0-100. Weighted average of `sectionCompleteness` and `lengthScore`. */
  value: number;
  /** Per-sub-criterion scores. Useful for the scorecard breakdown + tests. */
  breakdown: {
    /** 0-100. % of expected sections present. */
    sectionCompleteness: number;
    /** 0-100. Penalty for being over/under the 500-800 word sweet spot. */
    lengthScore: number;
  };
};

/**
 * Score the structure of a resume.
 *
 * Empty / missing sections don't throw — they just contribute 0 to
 * the section-completeness sub-criterion. A resume with only `basics`
 * filled in scores 25 on that sub-criterion.
 */
export function scoreStructure(resume: ResumeTextSource): StructureScore {
  const sectionsPresent = [
    // basics — always considered present if the resume object exists;
    // the "summary" can be empty, but the section exists by definition.
    true,
    resume.work.length > 0,
    hasEducation(resume),
    resume.skills.length > 0
  ];
  const sectionCompleteness =
    (sectionsPresent.filter(Boolean).length / sectionsPresent.length) * 100;

  const resumeText = textForLength(resume);
  const words = wordCount(resumeText);
  const lengthScore =
    words >= 500 && words <= 800
      ? 100
      : Math.max(0, 100 - Math.abs(650 - words) * 0.1);

  return {
    value: 0.5 * sectionCompleteness + 0.5 * lengthScore,
    breakdown: { sectionCompleteness, lengthScore }
  };
}

/**
 * Type guard — `education` is in our Zod schema but isn't on the
 * narrow `ResumeTextSource` (similarity only needs text-bearing
 * fields). We accept it as an optional extension here, with a
 * duck-type check.
 */
function hasEducation(resume: ResumeTextSource & { education?: unknown }): boolean {
  return Array.isArray(resume.education) && resume.education.length > 0;
}

/**
 * Build the text blob used for word-counting. Differs slightly from
 * `flattenResumeText` in that we DO want to count section headers
 * (because they're user-written prose too). The narrow source has
 * everything we need.
 */
function textForLength(resume: ResumeTextSource): string {
  // Re-use the flatten helper for consistency. If the resume is
  // extremely short (e.g. just `basics`), the score degrades
  // gracefully via `Math.max(0, ...)`.
  return [
    resume.basics.summary ?? '',
    resume.basics.label ?? '',
    resume.skills.map((s) => `${s.name} ${s.keywords.join(' ')}`).join(' '),
    resume.work
      .map(
        (w) =>
          `${w.summary ?? ''} ${w.positions
            .map((p) => `${p.title ?? ''} ${(p.highlights ?? []).join(' ')}`)
            .join(' ')}`
      )
      .join(' '),
    (resume.projects ?? [])
      .map(
        (p) =>
          `${p.name ?? ''} ${p.description ?? ''} ${(p.highlights ?? []).join(' ')}`
      )
      .join(' ')
  ].join(' ');
}
