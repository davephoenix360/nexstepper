import { STOP_WORDS } from './dictionaries';
import {
  detectQualification,
  eligibilityVocabulary,
  type EligibilityRequirement
} from './qualifications';
import type { JobTextSource } from './similarity';

/**
 * The JD's token vocabulary — ONE implementation, shared by the ATS
 * Keyword Match score and the "add these missing keywords" tip.
 *
 * ## Why this is shared
 *
 * `dimensions/ats-matching.ts` (the score) and `tips.tsx` (the advice)
 * used to have two copies of the same tokenisation, with a comment
 * warning that they could drift. They DID drift once already — a
 * tokenization swap produced the `Python/Django` defect and a comment
 * admitting the two copies might diverge.
 *
 * An advice string that disagrees with the number it explains is worse
 * than no advice, so there is now one function and both call it.
 *
 * ## Eligibility vocabulary is excluded
 *
 * A JD's token set used to include the words of its own eligibility
 * requirements. For a JD asking for a bachelor's degree, that put
 * `bachelor`, `degree`, `equivalent` and `practical` into the vocabulary
 * — so a resume that could not possibly satisfy them was marked down
 * for missing them, and the tip told the user to add them to their
 * resume.
 *
 * Eligibility words are now excluded from the vocabulary, but ONLY when
 * the JD actually states an eligibility requirement. A JD with no
 * degree, certification or authorisation requirement keeps exactly the
 * vocabulary it had, so this cannot change a score for the majority of
 * JDs.
 *
 * The exclusion set is deliberately narrow. `certificate` and `license`
 * are NOT in it, because they have real technical uses ("SSL
 * certificate", "Apache License") that candidates legitimately list.
 * `master` is only excluded when a master's-level degree gate was
 * detected, because "Master Data Management" is a technology.
 *
 * See `lib/scoring/qualifications.ts`.
 */

/**
 * The eligibility requirements a JD's own lines state.
 *
 * ## Where it looks — and why
 *
 * It scans FOUR sources:
 *
 *   1. `job.requirements` — legacy rows with a parsed bullet list.
 *   2. `job.niceToHaves` — same.
 *   3. `job.mustHaveSkills` — the intent extractor's list. **This is the
 *      one that is populated in production.**
 *   4. `job.niceToHaveSkills` — same.
 *
 * It used to scan only 1 and 2, while the eligibility NOTES read 3 and 4
 * (`lib/scoring/dimensions/intent-coverage.ts`). Two halves of one fix,
 * reading two different sources — and the half that read the empty
 * sources never ran, so the JD's "bachelor's degree" stayed in the
 * keyword vocabulary and the candidate was marked down for not writing
 * it. Measured at **1.91 points** for a candidate who HAS the degree.
 *
 * Both halves now read the same place, so they cannot disagree.
 */
export function jobEligibilityGates(job: JobTextSource): EligibilityRequirement[] {
  const gates: EligibilityRequirement[] = [];
  const seen = new Set<string>();
  for (const line of [
    ...(job.requirements ?? []),
    ...(job.niceToHaves ?? []),
    ...(job.mustHaveSkills ?? []),
    ...(job.niceToHaveSkills ?? [])
  ]) {
    if (typeof line !== 'string') continue;
    const gate = detectQualification(line);
    if (!gate) continue;
    // The same requirement can appear in more than one list (the
    // extractor's must-have list and a parsed bullet). One gate is
    // enough — the note and the vocabulary must agree.
    const key = gate.text.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    gates.push(gate);
  }
  return gates;
}

/**
 * The JD's non-stop-word tokens, with eligibility vocabulary removed.
 *
 * The order is stable (title, description, requirements, nice-to-haves,
 * benefits) so the output is deterministic.
 */
export function jobTokensWithoutStopWords(job: JobTextSource): string[] {
  const gates = jobEligibilityGates(job);
  // Only exclude anything when the JD genuinely states an eligibility
  // requirement — otherwise the vocabulary is untouched.
  const excluded = gates.length > 0 ? eligibilityVocabulary(gates) : null;

  // The JD's OWN location is not a requirement the candidate can meet.
  //
  // A posting that says "we build our platform in San Francisco" puts
  // `san` and `francisco` into the keyword vocabulary, and the candidate
  // was charged for them — while their own location field could not pay
  // them off, because the location was excluded from the scored text.
  // The Edmonton bug: fixed in the tip (`lib/scoring/tips.tsx`), never in
  // the score.
  //
  // With the job's location known (from the intent extractor, which
  // already reads the posting), those tokens are dropped. A city is not
  // a skill, and nobody should be marked down for the job naming its own
  // address.
  const locationTokens = new Set(
    tokensFromText(job.location ?? '').filter((t) => t.length >= 2)
  );

  const seen = new Set<string>();
  const out: string[] = [];
  const push = (text: string) => {
    for (const t of tokensFromText(text)) {
      if (STOP_WORDS.has(t)) continue;
      if (excluded?.has(t)) continue;
      if (locationTokens.has(t)) continue;
      if (seen.has(t)) continue;
      seen.add(t);
      out.push(t);
    }
  };
  push(job.title ?? '');
  push(job.description ?? '');
  for (const r of job.requirements ?? []) push(r);
  for (const n of job.niceToHaves ?? []) push(n);
  for (const b of job.benefits ?? []) push(b);
  return out;
}

/** Lowercase, split on non-word characters, drop 1-character tokens. */
export function tokensFromText(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\W+/)
    .filter((t) => t.length >= 2);
}
