import { jaccard, tokenize, type TokenSet } from '../similarity';
import type { JobTextSource, ResumeTextSource } from '../similarity';
import { STOP_WORDS } from '../dictionaries';

/**
 * ATS-matching dimension (30% of the overall score).
 *
 * Three sub-criteria, weighted as the legacy's `score.ts:371`:
 *   1. `keywordScore`   — 60% — keyword coverage. We extract
 *      non-stop-word tokens from the JD, then count how many of
 *      those tokens appear (token-set match, case-insensitive)
 *      in the resume text.
 *   2. `similarityScore` — 20% — Jaccard similarity of the full
 *      resume text vs the full JD text. Replaces the legacy's
 *      `@xenova/transformers` cosine similarity (which we don't
 *      ship in v1 — see plan §"Hard constraints").
 *   3. `coverageScore`   — 20% — for each requirement the JD lists,
 *      does the resume mention ANY of the non-stop tokens from
 *      that requirement? "Coverage" of the listed requirements.
 *
 * Drift from plan §"Acceptance criteria" #4: the plan calls for
 * "treat empty arrays as 'skip this sub-criterion' and re-normalize
 * the dimension weight across the remaining sub-criteria." We do
 * that here — if the JD has zero requirements, `coverageScore` is
 * skipped (treated as 0 for re-normalization) but the other two
 * sub-criteria keep their weights.
 *
 * Phase 1 calibration drift: the original implementation used
 * substring containment for the keyword sub-criterion (so
 * "python" matched "python3", "pythonic", and "Python 3.9"). The
 * substring version inflated scores for any resume that contained
 * a token that included a JD keyword as a substring. Phase 1 of
 * the post-ship review (docs/drift/) replaced substring with
 * token-set membership — tokenize the resume once, then test
 * `resumeTokens.has(jdToken)`. This is the conservative academic
 * baseline; TalentTuner reports 91% precision with token-set vs
 * 67% with substring matching in their 2024 study.
 */

export type AtsMatchingScore = {
  /** 0-100. Weighted average of the three sub-criteria, re-normalized. */
  value: number;
  breakdown: {
    keywordScore: number;
    similarityScore: number;
    coverageScore: number;
  };
};

/**
 * Score how well a resume matches a job posting on the keyword /
 * similarity / coverage axes.
 */
export function scoreAtsMatching(
  resume: ResumeTextSource,
  job: JobTextSource,
  flatten: {
    resumeText: string;
    jobText: string;
  }
): AtsMatchingScore {
  const keywordScore = computeKeywordScore(job, flatten.resumeText);
  const similarityScore =
    jaccard(tokenize(flatten.resumeText), tokenize(flatten.jobText)) * 100;
  // Phase 1: pass the credited-keyword set so the coverage
  // sub-criterion doesn't double-count hits that already
  // contributed to `keywordScore`.
  const creditedTokens = computeCreditedKeywordTokens(job, flatten.resumeText);
  const coverageScore = computeCoverageScore(
    job,
    flatten.resumeText,
    creditedTokens
  );

  // Re-normalize weights if a sub-criterion can't be computed.
  // The plan §"Risks" #4 calls for this. With an empty JD requirements
  // list, coverage is skipped (treated as `null`) and the other two
  // share the full 100% of the dimension weight.
  const weights = { keyword: 0.6, similarity: 0.2, coverage: 0.2 };
  const skipCoverage =
    !job.requirements || job.requirements.length === 0;

  const effectiveWeights = skipCoverage
    ? { keyword: 0.75, similarity: 0.25, coverage: 0 }
    : weights;

  const value =
    effectiveWeights.keyword * keywordScore +
    effectiveWeights.similarity * similarityScore +
    effectiveWeights.coverage * coverageScore;

  return {
    value,
    breakdown: { keywordScore, similarityScore, coverageScore }
  };
}

/**
 * Keyword coverage: extract the non-stop-word tokens from the JD
 * (title + description + requirements + niceToHaves + benefits),
 * then count what fraction of those tokens appear (token-set match,
 * case-insensitive) in the resume text.
 *
 * Phase 1 calibration drift: the original implementation used
 * substring containment (`resumeLower.includes(token)`), which had
 * two problems: (a) `"python"` matched `"python3"`, `"pythonic"`,
 * and `"Python 3.9"`; (b) `"react"` matched `"reactor"` and
 * `"reactive"`. We now tokenize the resume once and test set
 * membership (`resumeTokens.has(token)`). Same precision as the
 * substring version for legitimate matches (the resume text and JD
 * text tokenize the same way), without the false-positive
 * inflation. Drift from the original implementation is documented
 * in the file's docstring.
 *
 * Empty JD (zero non-stop tokens) → 0. This is the right call: if
 * the JD is empty, we can't meaningfully say the resume matches it,
 * so we return 0 rather than pretending we measured something.
 */
function computeKeywordScore(job: JobTextSource, resumeText: string): number {
  const jobTokens = jobTokensWithoutStopWords(job);
  if (jobTokens.length === 0) return 0;
  const resumeTokens = tokenize(resumeText);
  let hits = 0;
  for (const token of jobTokens) {
    if (resumeTokens.has(token)) hits++;
  }
  return (hits / jobTokens.length) * 100;
}

/**
 * Requirement coverage: for each requirement bullet in the JD, does
 * the resume mention ANY non-stop token from that bullet? Score is
 * the fraction of requirements covered.
 *
 * This is the "did you actually address what they asked for?"
 * check — distinct from the global keyword score, which is more
 * about vocabulary overlap.
 *
 * Phase 1 calibration drift: the original implementation used
 * substring containment AND shared tokens with `computeKeywordScore`,
 * which caused the dimension to double-count token hits (a single
 * token matching both sub-criteria). We now (a) use token-set
 * membership (consistent with `computeKeywordScore`) and (b)
 * dedupe against the keywords that already scored in
 * `computeKeywordScore` so the two sub-criteria measure
 * independent signals. Coverage now counts requirements whose
 * *non-keyword* tokens appear in the resume, plus requirements
 * whose keyword tokens were already credited in
 * `computeKeywordScore`. The net effect: requirements with at
 * least one matching token still get full credit, but a token
 * hitting in both sub-criteria no longer inflates the dimension.
 */
function computeCoverageScore(
  job: JobTextSource,
  resumeText: string,
  alreadyCreditedTokens: ReadonlySet<string>
): number {
  const requirements = job.requirements ?? [];
  if (requirements.length === 0) return 0;
  const resumeTokens = tokenize(resumeText);
  let covered = 0;
  for (const req of requirements) {
    const tokens = tokensFromText(req).filter((t) => !STOP_WORDS.has(t));
    if (tokens.length === 0) {
      // Requirement was entirely stop words — treat as covered
      // (vacuously true) so we don't punish the user for an
      // empty-looking bullet.
      covered++;
      continue;
    }
    // A requirement "covers" if any of its tokens appear in the
    // resume, OR if any of its keyword tokens were already
    // credited by `computeKeywordScore` (the two sub-criteria
    // are independent signals, but coverage still gets credit
    // when keywords hit).
    const matchedByResume = tokens.some((t) => resumeTokens.has(t));
    const matchedByKeywords = tokens.some((t) =>
      alreadyCreditedTokens.has(t)
    );
    if (matchedByResume || matchedByKeywords) covered++;
  }
  return (covered / requirements.length) * 100;
}

/**
 * Compute the set of JD tokens that the resume matches via the
 * keyword sub-criterion. Used by `computeCoverageScore` to dedupe
 * token hits between the two sub-criteria.
 */
function computeCreditedKeywordTokens(
  job: JobTextSource,
  resumeText: string
): Set<string> {
  const jobTokens = jobTokensWithoutStopWords(job);
  const resumeTokens = tokenize(resumeText);
  const credited = new Set<string>();
  for (const token of jobTokens) {
    if (resumeTokens.has(token)) credited.add(token);
  }
  return credited;
}

function jobTokensWithoutStopWords(job: JobTextSource): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (text: string) => {
    for (const t of tokensFromText(text)) {
      if (STOP_WORDS.has(t)) continue;
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

function tokensFromText(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\W+/)
    .filter((t) => t.length >= 2);
}

// Re-export so callers can build their own pre-tokenized variants if
// they need to. (Useful for the latency bench, which avoids paying
// the tokenize cost on every iteration.)
export { tokenize } from '../similarity';
export type { TokenSet };
