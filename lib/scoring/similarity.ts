/**
 * Token-set similarity helpers used by the scoring engine.
 *
 * Pure, synchronous, dependency-free. Used by:
 *   - `dimensions/ats-matching.ts` — Jaccard similarity of the full
 *     resume text against the full JD text. The plan replaces the
 *     legacy's `@xenova/transformers` embedding cosine-similarity
 *     with this. Same intuition (more shared tokens → higher score),
 *     no 25 MB model download, no async.
 *   - `dimensions/alignment.ts` — Jaccard similarity of the resume
 *     summary tokens against the JD title tokens. The "tailoring"
 *     sub-criterion measures how well the summary is aimed at the
 *     role.
 *
 * Determinism guarantee: no `Date.now`, no `Math.random`, no async,
 * no I/O. The same input → the same output. Asserted by
 * `tests/unit/scoring/purity.test.ts`.
 *
 * Tokenization rules (deliberately simple, deliberately boring):
 *   1. Lowercase the entire string.
 *   2. Split on `/\W+/` (any non-word character — letters, digits,
 *      underscores).
 *   3. Drop empty tokens.
 *   4. Drop tokens shorter than 2 characters.
 *
 * We deliberately do NOT stem ("engineer" vs "engineering"), lemmatize,
 * or expand synonyms in v1. The plan says "When in doubt, emit the
 * text unchanged rather than invent structure." Same principle
 * applies to similarity — we want a stable, predictable signal, not
 * a magic string-matcher that surprises reviewers.
 */

export type TokenSet = ReadonlySet<string>;

/**
 * Lowercase, split on non-word characters, drop empties and 1-char
 * tokens. Returns a `ReadonlySet` so callers can't accidentally
 * mutate the result.
 */
export function tokenize(text: string): TokenSet {
  const tokens = text
    .toLowerCase()
    .split(/\W+/)
    .filter((t) => t.length >= 2);
  return new Set(tokens);
}

/**
 * Jaccard similarity coefficient of two token sets.
 *
 *   |a ∩ b| / |a ∪ b|
 *
 * Returns a value in `[0, 1]`. Both-empty sets return 0 (not 1) —
 * an "empty resume vs empty JD" match isn't a perfect match, it's a
 * degenerate case we want surfaced as "no signal" rather than a
 * misleading 100%.
 *
 * Example:
 *   jaccard(tokenize('typescript react'), tokenize('react node'))
 *   → 1/3 ≈ 0.333
 */
export function jaccard(a: TokenSet, b: TokenSet): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  // Iterate the smaller set for the inner loop.
  const [smaller, larger] = a.size <= b.size ? [a, b] : [b, a];
  for (const token of smaller) {
    if (larger.has(token)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Flatten a resume's text-bearing fields into a single string.
 * Same shape as the legacy `getResumeText`, but uses our own
 * `ResumeData` schema (no Firebase / LangChain types).
 *
 * Used by `ats-matching` (Jaccard against the JD) and by the
 * dimension-internal helpers that need to count words, action
 * verbs, etc.
 */
export function flattenResumeText(resume: ResumeTextSource): string {
  const parts: string[] = [];
  const basics = resume.basics;
  parts.push(basics.summary ?? '', basics.label ?? '');
  for (const skill of resume.skills) {
    parts.push(skill.name, ...skill.keywords);
  }
  for (const job of resume.work) {
    parts.push(job.summary ?? '');
    for (const pos of job.positions) {
      parts.push(pos.title ?? '', ...(pos.highlights ?? []));
    }
  }
  for (const proj of resume.projects ?? []) {
    parts.push(proj.name ?? '', proj.description ?? '', ...(proj.highlights ?? []));
  }
  return parts.filter(Boolean).join(' \n ');
}

/**
 * Flatten a job posting's text-bearing fields into a single string.
 * Maps the legacy's `getJobText` over our `JobPosting` schema:
 *   - legacy `jobTitle`             → ours `title`
 *   - legacy `introduction`         → ours `description` (top-level)
 *   - legacy `responsibilities`     → ours `requirements`
 *   - legacy `basicQualifications`  → ours `requirements` (combined)
 *   - legacy `preferredQualifications` → ours `niceToHaves`
 *
 * The two-array structure (basic vs preferred) is collapsed into one
 * because our parser produces a single ranked requirements list. If
 * we later split them, this function splits accordingly.
 */
export function flattenJobText(job: JobTextSource): string {
  return [
    job.title ?? '',
    job.description ?? '',
    ...(job.requirements ?? []),
    ...(job.niceToHaves ?? []),
    ...(job.benefits ?? [])
  ]
    .filter(Boolean)
    .join(' \n ');
}

/**
 * Word count, splitting on `\s+`. Whitespace-only input → 0.
 * Used by the `length` sub-criterion in the structure dimension.
 */
export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * The narrow input shape `flattenResumeText` expects — a subset of
 * `ResumeData`. Defined here so the helper can be unit-tested without
 * pulling in the full Zod schema.
 */
export type ResumeTextSource = {
  basics: { summary?: string; label?: string };
  skills: Array<{ name: string; keywords: string[] }>;
  work: Array<{
    summary?: string;
    positions: Array<{ title?: string; highlights?: string[] }>;
  }>;
  projects?: Array<{ name?: string; description?: string; highlights?: string[] }>;
};

export type JobTextSource = {
  title?: string;
  description?: string;
  requirements?: string[];
  niceToHaves?: string[];
  benefits?: string[];
};
