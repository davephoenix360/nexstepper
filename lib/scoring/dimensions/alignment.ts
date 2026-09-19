import { jaccard, tokenize } from '../similarity';
import type { JobTextSource, ResumeTextSource } from '../similarity';
import { SOFT_SKILLS } from '../dictionaries';

/**
 * Alignment dimension (20% of the overall score).
 *
 * Three sub-criteria, weighted as the legacy's `score.ts:429-430`:
 *   1. `tailoring`    — 50% — Jaccard similarity of the resume's
 *      summary tokens against the JD's title tokens. The intuition:
 *      a well-tailored resume's summary echoes the words the JD
 *      uses in its title.
 *   2. `hasExtras`    — 30% — does the resume have any of
 *      projects / awards / publications? Either 0 or 100. (A
 *      binary signal — we don't count how many of each.)
 *   3. `softSkills`   — 20% — fraction of the legacy's 4-word
 *      soft-skill list ("team", "leadership", "collaborated",
 *      "communication") that appear (substring-matched,
 *      case-insensitive) anywhere in the resume.
 *
 * Drift from plan: the plan §"Open questions" #3 asks whether to
 * expand the soft-skill list. We ship with the legacy's 4 words
 * verbatim per the plan's "default: inherit" call. Expand later if
 * calibration says the alignment score is uniformly low.
 */

export type AlignmentScore = {
  /** 0-100. Weighted average of the three sub-criteria. */
  value: number;
  breakdown: {
    /** 0-100. Summary ↔ title Jaccard similarity. */
    tailoring: number;
    /** 0 or 100. Binary "has extras" signal. */
    hasExtras: number;
    /** 0-100. Fraction of the soft-skill list present in the resume. */
    softSkills: number;
  };
};

const WEIGHTS = { tailoring: 0.5, hasExtras: 0.3, softSkills: 0.2 } as const;

export function scoreAlignment(
  resume: ResumeTextSource,
  job: JobTextSource,
  extras: { hasProjects: boolean; hasAwards: boolean; hasPublications: boolean }
): AlignmentScore {
  const tailoring =
    jaccard(tokenize(resume.basics.summary ?? ''), tokenize(job.title ?? '')) * 100;

  const hasExtras =
    extras.hasProjects || extras.hasAwards || extras.hasPublications ? 100 : 0;

  const softSkills = calcSoftSkills(resume);

  return {
    value:
      WEIGHTS.tailoring * tailoring +
      WEIGHTS.hasExtras * hasExtras +
      WEIGHTS.softSkills * softSkills,
    breakdown: { tailoring, hasExtras, softSkills }
  };
}

/**
 * Fraction of the legacy's 4-word soft-skill list that appear
 * (substring-matched, case-insensitive) in the resume text.
 *
 * The "substring" approach matches the legacy's `score.ts:425-427`.
 * It means "team" matches "teamwork" and "collaborated" matches
 * "collaborated with". That's a feature for short lists (we'd rather
 * over-count slightly than miss a mention) and would be a bug for
 * a longer list — hence the plan to "expand later if needed."
 */
function calcSoftSkills(resume: ResumeTextSource): number {
  const haystack = flattenForSoftSkills(resume).toLowerCase();
  if (SOFT_SKILLS.length === 0) return 0;
  let hits = 0;
  for (const skill of SOFT_SKILLS) {
    if (haystack.includes(skill)) hits++;
  }
  return (hits / SOFT_SKILLS.length) * 100;
}

function flattenForSoftSkills(resume: ResumeTextSource): string {
  // Same flatten as `scoreStructure` would use, but we only need
  // the body — no section completeness here. Just enough text to
  // substring-match against.
  const parts: string[] = [
    resume.basics.summary ?? '',
    resume.basics.label ?? '',
    resume.skills.map((s) => s.name).join(' ')
  ];
  for (const job of resume.work) {
    parts.push(job.summary ?? '');
    for (const pos of job.positions) {
      parts.push(pos.title ?? '');
      if (pos.highlights) parts.push(pos.highlights.join(' '));
    }
  }
  for (const proj of resume.projects ?? []) {
    parts.push(proj.name ?? '', proj.description ?? '');
    if (proj.highlights) parts.push(proj.highlights.join(' '));
  }
  return parts.filter(Boolean).join(' \n ');
}
