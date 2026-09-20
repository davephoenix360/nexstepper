/**
 * v2 Role Fit — semantic similarity between JD title and resume titles.
 *
 * Plan: docs/plans/ats-scoring-v2.md (Phase 2).
 *
 * Computes the maximum cosine similarity between the JD title and
 * each title in the candidate's work history, then maps to a 0-100
 * score. Captures "applied as Senior SWE but resume says Junior
 * Dev" or "applied as Backend Engineer but resume says iOS Engineer"
 * — the kind of title-mismatch the v1 keyword overlap misses.
 *
 * Lives in `lib/scoring-async/` (NOT `lib/scoring/`) for the same
 * purity-invariant reasons as `semantic-similarity.ts`: the dynamic
 * `@huggingface/transformers` import + the cold-start cost would
 * trip the engine's purity test. The sync engine can call this
 * through a wrapper that computes the dimension from a pre-computed
 * similarity value (see `lib/scoring/dimensions/role-fit.ts`).
 *
 * Reuses the existing MiniLM-L6-v2 pipeline (already loaded for
 * `semantic-similarity.ts`). The research report flagged JobBERT-V3
 * — specialized for job-title similarity — but adopting a second
 * model would add ~2s cold start + ~25MB cache, and we already
 * know general-purpose MiniLM works for short-text title pairs.
 * Validate on a labeled corpus first; promote to JobBERT-V3 only
 * if Pearson correlation < 0.7.
 */

import type { JobPosting, ResumeData } from '@/lib/resume-schema';
import { semanticSimilarity } from './semantic-similarity';

/**
 * Output of the Role Fit dimension. Surfaces the best-matching
 * resume title so the UI can highlight the title alignment (e.g.
 * "your 'Staff Engineer' at Acme best matches the JD's 'Senior
 * Platform Engineer' role family").
 */
export interface RoleFitResult {
  /** 0-100. Higher = the resume title best matches the JD title. */
  value: number;
  /**
   * Maximum cosine similarity in [0, 1] across all (jdTitle, resumeTitle)
   * pairs. Null when no titles could be compared (both sides empty).
   */
  bestSimilarity: number | null;
  /** The resume title that produced `bestSimilarity`. Null when no match. */
  bestMatchingTitle: string | null;
  /** The JD title (or empty string if absent). */
  jdTitle: string;
  /** True when no usable signal was available; dimension falls back to neutral. */
  fallback: boolean;
}

/** Neutral score when no usable title signal is present. */
export const NEUTRAL_ROLE_FIT_SCORE = 50;

/**
 * Compute Role Fit for a (resume, job) pair. Calls the shared
 * MiniLM pipeline once per (jdTitle, resumeTitle) pair, picks the
 * max similarity, and maps to 0-100.
 *
 * Pure-ish: the side effect is the model call (cached at module
 * level). Returns the neutral score when either title set is empty.
 */
export async function roleFitSimilarity(
  resume: ResumeData,
  job: JobPosting
): Promise<RoleFitResult> {
  const jdTitle = (job.title ?? '').trim();
  if (!jdTitle) {
    return {
      value: NEUTRAL_ROLE_FIT_SCORE,
      bestSimilarity: null,
      bestMatchingTitle: null,
      jdTitle: '',
      fallback: true
    };
  }

  const resumeTitles = collectResumeTitles(resume);
  if (resumeTitles.length === 0) {
    return {
      value: NEUTRAL_ROLE_FIT_SCORE,
      bestSimilarity: null,
      bestMatchingTitle: null,
      jdTitle,
      fallback: true
    };
  }

  // Score each title against the JD title; pick the best.
  // Sequential rather than Promise.all because the underlying
  // pipeline is a singleton — concurrent calls would serialize
  // anyway, and sequential keeps the per-call overhead lower
  // (no Promise.all microtask overhead).
  //
  // Swallow exceptions: model load failure, OOM, network timeout —
  // any of these shouldn't break the surrounding score. We mirror
  // `semantic-similarity.ts`'s contract: returns fallback (neutral)
  // on failure so callers don't need defensive try/catch around
  // every call.
  let bestSimilarity = 0;
  let bestMatchingTitle: string | null = null;
  try {
    for (const title of resumeTitles) {
      const sim = await semanticSimilarity(title, jdTitle);
      if (sim > bestSimilarity) {
        bestSimilarity = sim;
        bestMatchingTitle = title;
      }
    }
  } catch {
    return {
      value: NEUTRAL_ROLE_FIT_SCORE,
      bestSimilarity: null,
      bestMatchingTitle: null,
      jdTitle,
      fallback: true
    };
  }

  // Map cosine similarity in [0, 1] to a 0-100 score. The pipeline
  // already clamps + remaps [-1, 1] → [0, 1] inside
  // semantic-similarity, so `bestSimilarity` is already in [0, 1].
  const value = Math.round(bestSimilarity * 100);

  return {
    value,
    bestSimilarity,
    bestMatchingTitle,
    jdTitle,
    fallback: false
  };
}

/**
 * Collect every work-experience title from the resume envelope
 * (each company has 1+ positions). Duplicates are de-duplicated
 * case-insensitively to avoid redundant model calls. Same titles
 * across companies (e.g. "Software Engineer" at 3 startups) collapse
 * to a single embedding.
 */
function collectResumeTitles(resume: ResumeData): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const company of resume.sections.work) {
    for (const pos of company.positions) {
      const t = (pos.title ?? '').trim();
      if (!t) continue;
      const key = t.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(t);
    }
  }
  return out;
}
