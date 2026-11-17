import { flattenResumeText, tokenize } from '../similarity';
import type { JobTextSource, ResumeTextSource } from '../similarity';
import { SOFT_SKILLS, SOFT_SKILL_VARIANTS } from '../dictionaries';

/**
 * Alignment dimension (14% of the overall v2 score).
 *
 * Three sub-criteria, weighted 50/30/20:
 *   1. `tailoring`    — 50% — recall of the JD title's vocabulary in the
 *      resume summary. See `titleCoverage` below for why this is recall
 *      rather than Jaccard.
 *   2. `hasExtras`    — 30% — does the resume show anything distinctive?
 *      Binary: 0 or 100. See `calcUniqueValue` below for what counts.
 *   3. `softSkills`   — 20% — fraction of the soft-skill phrase list
 *      (12 phrases, expanded from the legacy 4 per the post-ship review)
 *      that appear in the resume.
 *
 * ## The `extras` argument is gone
 *
 * The dimension used to take `{ hasProjects, hasAwards, hasPublications }`
 * as a third argument — presence booleans computed by the caller. That
 * was the wrong test: an EMPTY project shell (a title and nothing else)
 * counted as "unique value" exactly like a substantial project.
 *
 * It also put the signal in the wrong place. The resume itself carries
 * projects, awards and publications now, so the dimension reads its own
 * input instead of being told about it by the caller — one source of
 * truth, which is the lesson of the whole field-coverage audit.
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
  job: JobTextSource
): AlignmentScore {
  const tailoring = titleCoverage(resume.basics.summary ?? '', job.title ?? '');

  const hasExtras = calcUniqueValue(resume);

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
 * "Unique Value" — does the resume show something the JD did not ask for?
 *
 * ## What counts
 *
 * A project, an award or a publication — but only if it says something.
 * An entry with a title and no body is a shell, and a shell is not
 * evidence of distinctive work.
 *
 * ## Why the COUNT is deliberately not rewarded
 *
 * The obvious improvement is "one project and ten projects should not
 * score identically" — that was the documented limitation, and it is
 * still true: `hasExtras` is binary.
 *
 * It is binary on purpose. This sub-criterion measures DISTINCTIVENESS,
 * not quantity. One substantial project demonstrates it; ten thin ones
 * do not make a candidate more distinctive, they make the resume longer
 * — and the "Optimal Length" criterion already penalises bloat. Grading
 * by count would reward padding, which is the opposite of what the
 * sub-criterion is for.
 *
 * What DID change is the test: presence became substance.
 */
function calcUniqueValue(resume: ResumeTextSource): number {
  const projects = resume.projects ?? [];
  const awards = resume.awards ?? [];
  const publications = resume.publications ?? [];

  const hasSubstance = (text: string): boolean => text.trim().length > 0;

  const substantiveProject = projects.some(
    (project) =>
      hasSubstance(project.name ?? '') ||
      hasSubstance(project.description ?? '') ||
      (project.highlights ?? []).some(hasSubstance)
  );
  const substantiveAward = awards.some(
    (award) => hasSubstance(award.title ?? '') || hasSubstance(award.summary ?? '')
  );
  const substantivePublication = publications.some(
    (publication) =>
      hasSubstance(publication.name ?? '') ||
      hasSubstance(publication.summary ?? '')
  );

  return substantiveProject || substantiveAward || substantivePublication ? 100 : 0;
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
 *
 * ## Each phrase is matched on its SURFACE FORMS, not one spelling
 *
 * A literal match meant 'analytical' did not credit "analysis",
 * 'mentorship' did not credit "mentored", and 'collaborated' did not
 * credit "collaboration". A resume that demonstrates the skill in the
 * words people actually use was not credited for it — the same defect
 * class as the ISO-only date parser.
 *
 * `SOFT_SKILL_VARIANTS` lists the inflections per phrase, and every
 * variant list contains the literal phrase, so a phrase can only ever
 * gain matches, never lose them.
 */
function calcSoftSkills(resume: ResumeTextSource): number {
  const haystack = flattenForSoftSkills(resume).toLowerCase();
  if (SOFT_SKILLS.length === 0) return 0;
  let hits = 0;
  for (const skill of SOFT_SKILLS) {
    const forms = SOFT_SKILL_VARIANTS[skill] ?? [skill];
    if (forms.some((form) => haystack.includes(form))) hits++;
  }
  return (hits / SOFT_SKILLS.length) * 100;
}

/**
 * The text the soft-skill phrases are matched against.
 *
 * It used to be its own copy of the flatten, and it read the SKILL
 * NAMES but not the skill KEYWORDS — so a soft skill listed under
 * "Skills → Communication" did not count, while the same words in a work
 * bullet did.
 *
 * Now it is THE text. One document, one list of fields, everywhere.
 */
function flattenForSoftSkills(resume: ResumeTextSource): string {
  return flattenResumeText(resume);
}
