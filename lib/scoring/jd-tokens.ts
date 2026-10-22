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

/** The eligibility requirements a JD's own lines state. */
export function jobEligibilityGates(job: JobTextSource): EligibilityRequirement[] {
  const gates: EligibilityRequirement[] = [];
  for (const line of [
    ...(job.requirements ?? []),
    ...(job.niceToHaves ?? [])
  ]) {
    if (typeof line !== 'string') continue;
    const gate = detectQualification(line);
    if (gate) gates.push(gate);
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

  const seen = new Set<string>();
  const out: string[] = [];
  const push = (text: string) => {
    for (const t of tokensFromText(text)) {
      if (STOP_WORDS.has(t)) continue;
      if (excluded?.has(t)) continue;
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
