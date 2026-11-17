import { jaccard, tokenize, type TokenSet } from '../similarity';
import type { JobTextSource, ResumeTextSource } from '../similarity';
import { STOP_WORDS } from '../dictionaries';
import {
  jobTokensWithoutStopWords as sharedJobTokensWithoutStopWords
} from '../jd-tokens';
import { bm25Similarity } from './bm25-similarity';

/**
 * ATS-matching dimension (30% of the overall score).
 *
 * TWO sub-criteria:
 *   1. `keywordScore`   — 75% — keyword coverage. We extract
 *      non-stop-word tokens from the JD, then count how many of
 *      those tokens appear (token-set match, case-insensitive)
 *      in the resume text.
 *   2. `similarityScore` — 25% — BM25 similarity of the full resume
 *      text vs the full JD text. Replaces the legacy's
 *      `@xenova/transformers` cosine similarity (which we don't
 *      ship in v1 — see plan §"Hard constraints").
 *
 * ## There was a third sub-criterion, and it is retired
 *
 * `coverageScore` measured "of the responsibilities the JD lists, how
 * many does the resume mention a token from?" — 20% of the dimension.
 *
 * It was **always skipped in production**: the JD's requirement list
 * lives in `job.requirements`, and NO attach path writes one (measured
 * 2026-11-17 — every variant in production stores `requirements: 0` and
 * `niceToHaves: 0`; the JD's bullets live only in the raw description
 * prose). So the dimension re-normalised to 0.75/0.25 and the
 * sub-criterion was dead weight.
 *
 * It is retired rather than revived because the v2 Intent Coverage
 * dimension already measures requirement coverage — with priority
 * weighting and a semantic (Jev) judgement of what counts as evidence.
 * Reviving the v1 term would count the same measurement twice in the
 * overall score.
 *
 * The weights below are therefore UNCHANGED for every production score
 * — this is the retirement of a dead branch, not a re-weighting.
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
  /** 0-100. Weighted average of the two sub-criteria. */
  value: number;
  breakdown: {
    keywordScore: number;
    similarityScore: number;
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
  },
  options?: {
    /**
     * Override the keyword sub-score.
     *
     * When a Jev requirement evaluation is available, the keyword
     * sub-criterion measures the JD's GENUINE requirements and how
     * strongly the resume evidences each one, instead of counting every
     * non-stop-word token in the JD. The token-based score counts a JD's
     * prose — `insurance`, `budget`, `remote`, `friendly` — as keywords
     * the resume is expected to contain.
     *
     * The other two sub-criteria (similarity, coverage) are untouched,
     * so the scorecard's criteria still decompose the dimension.
     *
     * See `lib/scoring/jev-requirements.ts`.
     */
    keywordScore?: number;
  }
): AtsMatchingScore {
  const keywordScore =
    options?.keywordScore ?? computeKeywordScore(job, flatten.resumeText);
  // Phase 2 calibration drift: replace the Jaccard token-set
  // similarity with a proper BM25 retrieval signal. The Jaccard
  // version treated every shared token as equal — "the" counted
  // the same as "Kubernetes". BM25 weights each term by its
  // inverse document frequency across the 2-document corpus
  // (resume + JD), so rare technical terms contribute more.
  // Same 20% weight in the dimension. Returns [0, 1]; we map
  // to a 0-100 scale to match the other sub-criteria's units.
  const similarityScore = bm25Similarity(resume, job) * 100;

  // The ATS dimension is TWO sub-criteria: keyword coverage of the JD's
  // tokens, and BM25 similarity of the two documents.
  //
  // There was a third — "coverage of the JD's requirement bullets" —
  // and it is GONE (2026-11-17). It measured "of the responsibilities
  // the JD lists, how many does the resume mention a token from?" — and
  // the JD's requirement list was **always empty in production**,
  // because no attach path writes one (measured: every variant in
  // production stores `requirements: 0` and `niceToHaves: 0`). So the
  // sub-criterion was skipped and the weights re-normalised — which is
  // why the weights below are what they are.
  //
  // It is retired rather than revived because the v2 Intent Coverage
  // dimension already measures requirement coverage, with priority
  // weighting and a semantic (Jev) judgement of what counts as
  // evidence. Reviving the v1 term would count the same measurement
  // twice in the overall score.
  const weights = { keyword: 0.75, similarity: 0.25 };

  const value =
    weights.keyword * keywordScore + weights.similarity * similarityScore;

  return {
    value,
    breakdown: { keywordScore, similarityScore }
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
 * The JD's non-stop-word token vocabulary.
 *
 * Shared with `lib/scoring/tips.tsx` via `lib/scoring/jd-tokens.ts`, so
 * the "add these missing keywords" tip can never disagree with the score
 * it explains. Eligibility vocabulary (degree, certification, clearance)
 * is excluded when the JD states an eligibility requirement.
 */
function jobTokensWithoutStopWords(job: JobTextSource): string[] {
  return sharedJobTokensWithoutStopWords(job);
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
