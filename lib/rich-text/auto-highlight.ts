import type { JevRequirementLine } from '@/lib/scoring/jev-requirements';
import type { RichMark, RichTextMap } from '@/lib/resume-schema/rich-text';
import { skillKeywordPath } from '@/lib/rich-text/paths';

/**
 * "Highlight this job's skills" — deciding WHICH words to mark.
 *
 * ## What it does
 *
 * A candidate who is applying to a posting that names specific skills
 * wants those skills to STAND OUT in their resume. That is close to
 * standard practice in engineering, product and data roles, and it
 * signals "I read this job description" rather than "here is my
 * general-purpose resume".
 *
 * ## What it must NOT do
 *
 * **Bold things the posting does not actually ask for.** The failure
 * mode is a resume full of emphasis that means nothing.
 *
 * **Bold eligibility gates.** A degree, a certification, a
 * work-authorisation requirement and a years-of-experience threshold
 * are things a candidate satisfies with a certificate, not with
 * wording. There is no text to bold for them, and pretending otherwise
 * is a category error.
 *
 * **Bold skills the resume does not evidence.** Bolding a skill the
 * candidate only name-drops is overclaiming, and this product's whole
 * promise is honesty about what the resume shows.
 *
 * ## The decision
 *
 * Jev already answers the hard questions about each of the posting's
 * requirement lines: is this a genuine skill (`pSkill`), is it an
 * eligibility gate (`pGate`), and how strongly does the resume
 * demonstrate it (`evidence`, 0–3). This module turns those answers
 * into marks on the resume's own skill keywords — and refuses to mark
 * anything it cannot justify.
 *
 * It is a pure function: no IO, no clock, no model. The evaluation is
 * computed by the caller (`lib/scoring-async/jev-requirements.ts`) and
 * passed in.
 */

/** A skill entry as it appears in the resume's skills section. */
export type AutoHighlightSkillEntry = {
  name: string;
  keywords: string[];
};

/** Why a skill keyword was not marked. */
export type AutoHighlightSkipReason =
  /** The posting line is a degree / certification / authorisation / years threshold. */
  | 'gate'
  /** The posting line does not name a specific skill, tool or technique. */
  | 'not-a-skill'
  /** The resume does not demonstrate it (or does not mention it at all). */
  | 'not-evidenced';

export type AutoHighlightPlan = {
  /** The marks to apply, keyed by the field's dotted path. */
  marks: RichTextMap;
  /** The keywords that were bolded. */
  bolded: string[];
  /** The keywords that were bolded AND underlined (must-haves). */
  underlined: string[];
  /** The keywords that were considered and left alone. */
  skipped: { keyword: string; reason: AutoHighlightSkipReason }[];
};

export type AutoHighlightOptions = {
  /** Jev's per-requirement classification of the posting's lines. */
  lines: JevRequirementLine[];
  /** The resume's skill entries, in order — the index IS the path. */
  skills: AutoHighlightSkillEntry[];
  /** Minimum evidence depth (0–3) for a skill to count as demonstrated. */
  evidenceThreshold?: number;
  /** Minimum probability that a line names a genuine skill. */
  pSkillThreshold?: number;
  /** Probability at or above which a line is treated as an eligibility gate. */
  pGateThreshold?: number;
};

/**
 * Does a posting line mention a skill keyword?
 *
 * Word-ish for plain keywords ("engineering" must not match
 * "engineers"), substring for keywords that are not words ("C++",
 * "Node.js"). A one-character keyword is never matched — "C" would
 * match "communication" and "client", and the candidate's language
 * skills are the one place a false match does real damage.
 */
export function lineMentionsKeyword(line: string, keyword: string): boolean {
  const needle = keyword.trim().toLowerCase();
  if (needle.length < 2) return false;

  const haystack = line.toLowerCase();
  const index = haystack.indexOf(needle);
  if (index === -1) return false;

  // A keyword with punctuation is a name, not a word — substring is
  // the right test for it.
  if (!/^[a-z0-9 ]+$/.test(needle)) return true;

  const before = index === 0 ? '' : haystack[index - 1];
  const after = haystack[index + needle.length] ?? '';
  const isWordChar = (char: string) => /[a-z0-9]/.test(char);
  return !isWordChar(before) && !isWordChar(after);
}

/**
 * Plan the marks for "highlight this job's skills".
 *
 * Returns the marks AND a summary, because the summary is what the
 * user is told happened: "Bolded 7 skills, underlined 3 must-haves" is
 * honest and checkable, and "your resume is now optimized" is not.
 */
export function planJobSkillHighlights({
  lines,
  skills,
  evidenceThreshold = 1,
  pSkillThreshold = 0.5,
  pGateThreshold = 0.5
}: AutoHighlightOptions): AutoHighlightPlan {
  const marks: RichTextMap = {};
  const bolded: string[] = [];
  const underlined: string[] = [];
  const skipped: { keyword: string; reason: AutoHighlightSkipReason }[] = [];

  skills.forEach((entry, skillIndex) => {
    entry.keywords.forEach((keyword, keywordIndex) => {
      const trimmed = keyword.trim();
      if (!trimmed) return;

      const candidates = lines.filter((line) =>
        lineMentionsKeyword(line.text, trimmed)
      );
      if (candidates.length === 0) return;

      const isGate = (line: JevRequirementLine) => line.pGate >= pGateThreshold;
      const isSkill = (line: JevRequirementLine) =>
        line.pSkill >= pSkillThreshold;
      const isEvidenced = (line: JevRequirementLine) =>
        (line.evidence ?? 0) >= evidenceThreshold;

      const eligible = candidates.filter(
        (line) => !isGate(line) && isSkill(line) && isEvidenced(line)
      );

      if (eligible.length === 0) {
        skipped.push({
          keyword: trimmed,
          reason: candidates.some(isGate)
            ? 'gate'
            : candidates.every((line) => !isSkill(line))
              ? 'not-a-skill'
              : 'not-evidenced'
        });
        return;
      }

      // A must-have is bold AND underlined, so a must-have and a
      // nice-to-have are distinguishable at a glance. A nice-to-have
      // is bold only.
      const mustHave = eligible.some((line) => line.bucket === 'must');
      const applied: RichMark[] = mustHave
        ? ['bold', 'underline']
        : ['bold'];

      marks[skillKeywordPath(skillIndex, keywordIndex)] = [
        { text: trimmed, start: 0, marks: applied }
      ];
      bolded.push(trimmed);
      if (mustHave) underlined.push(trimmed);
    });
  });

  return { marks, bolded, underlined, skipped };
}
