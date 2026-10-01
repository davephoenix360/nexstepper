import { tokenize } from '../similarity';
import type { JobTextSource, ResumeTextSource } from '../similarity';
import { SOFT_SKILLS } from '../dictionaries';

/**
 * Alignment dimension (14% of the overall v2 score).
 *
 * Three sub-criteria, weighted 50/30/20:
 *   1. `tailoring`    — 50% — recall of the JD title's vocabulary in the
 *      resume summary. See `titleCoverage` below for why this is recall
 *      rather than Jaccard.
 *   2. `hasExtras`    — 30% — does the resume have any of
 *      projects / awards / publications? Either 0 or 100. (A
 *      binary signal — we don't count how many of each.)
 *   3. `softSkills`   — 20% — fraction of the soft-skill phrase list
 *      (12 phrases, expanded from the legacy 4 per the post-ship review)
 *      that appear in the resume.
 *
 * Known limitation: `hasExtras` is binary, so one project and ten projects
 * score identically. Noted, not changed — see
 * `docs/drift/2026-10-01-ats-scoring-review.md` §4.
 */

export type AlignmentScore = {
  /** 0-100. Weighted average of the three sub-criteria. */
  value: number;
  breakdown: {
    /** 0-100. Fraction of the JD title's tokens the summary names. */
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
  const tailoring = titleCoverage(resume.basics.summary ?? '', job.title ?? '');

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
 * How much of the JD's title vocabulary the summary actually uses.
 *
 * |summary ∩ title| / |title| — **recall**, not Jaccard.
 *
 * The original used `jaccard(summary, title)`, which is
 * `|A∩B| / |A∪B|`. The numerator can never exceed the *title's* length (2-4
 * tokens) while the denominator is the entire summary, so a 3-token title
 * against a 30-token summary capped this sub-criterion at ~10% however
 * perfectly targeted the summary was — and the cap *tightened* as the summary
 * got longer, so a more detailed summary lowered its own tailoring score.
 *
 * Measured on the 50-entry validation corpus, `alignment` averaged **12.7**
 * with a max of 41.5, i.e. a dimension carrying 0.14 of the overall score
 * contributed roughly 1.8 points of its 14 available. The corpus harness
 * already noted this as a "known compression" (validation-corpus.test.ts:
 * "alignment floor ~5-40 for summaries that don't echo the JD title").
 *
 * Recall matches the documented intent — *"a well-tailored resume's summary
 * echoes the words the JD uses in its title"* — and is bounded by the title,
 * not the summary, so a longer summary can only help.
 *
 * Known trade-off: recall alone is gameable by stuffing the summary with the
 * title's words. It is 0.5 inside a 0.14 dimension, so the exposure is small,
 * and the alternative (an F-mean) re-introduces a length penalty for the
 * summary's own sake. Revisit if a user actually games it.
 */
function titleCoverage(summary: string, title: string): number {
  const titleTokens = tokenize(title);
  if (titleTokens.size === 0) return 0;
  const summaryTokens = tokenize(summary);
  if (summaryTokens.size === 0) return 0;

  let hits = 0;
  for (const token of titleTokens) {
    if (summaryTokens.has(token)) hits++;
  }
  return (hits / titleTokens.size) * 100;
}

/**
 * Fraction of the soft-skill phrase list that appear in the resume text.
 *
 * Substring matching is retained here (and is correct for this list): the
 * phrases are multi-word English ("people management", "cross-functional"),
 * and over-counting a near-miss is far less harmful than missing a mention.
 * The short-skill false positives that made substring matching unacceptable
 * for *technical* skills do not apply to these — see `../skill-match.ts`.
 *
 * "substring" means "team" matches "teamwork" and "collaborated" matches
 * "collaborated with".
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
