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
 *
 * ## This is THE flattener — there is one, on purpose
 *
 * Until 2026-11-16 this file, `dimensions/bm25-similarity.ts`,
 * `scoring-async/hybrid-similarity.ts`, `dimensions/structure.ts`,
 * `dimensions/alignment.ts` and
 * `dimensions/intent-coverage.ts` each had their OWN copy of "the
 * resume's text". They were not equal: some included education, some
 * did not; some included skill keywords, some only skill names. The
 * ATS keyword score, the BM25 signal, the semantic signal and the word
 * count could therefore all be reading different documents — and the
 * one place that noticed it (`tips.tsx`) fixed only its own copy.
 *
 * Every one of those copies now calls this function. If a field needs to
 * be readable by the scorer, it is added HERE, once.
 *
 * ## What is deliberately NOT here
 *
 * A field earns its place by being **evidence a JD can ask for**:
 *
 *   IN  — summary, headline, skills (name + keywords), work
 *         descriptions/titles/bullets, project name/description/bullets/
 *         keywords/roles, education degree level/majors/minors/courses,
 *         certificate names, spoken languages, volunteer positions and
 *         bullets, award titles, publication names and summaries.
 *
 *   OUT — name, email, phone, url, online profiles (contact details,
 *         never evidence), location (a city is not a skill — and the
 *         JD's own location tokens are excluded from the keyword
 *         vocabulary, so location is out on BOTH sides), employer name
 *         and its location/url (a proper noun is not evidence), work
 *         dates (not text — Seniority Fit reads them from the envelope),
 *         institution, GPA and education urls (a proper noun, a number
 *         and a link), skill level (a self-assessment, not evidence),
 *         interests and references (noise).
 */
export function flattenResumeText(resume: ResumeTextSource): string {
  const parts: string[] = [];
  const basics = resume.basics;
  parts.push(
    basics.summary ?? '',
    basics.label ?? '',
    basics.location?.city ?? '',
    basics.location?.region ?? ''
  );
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
    parts.push(
      proj.name ?? '',
      proj.description ?? '',
      ...(proj.highlights ?? []),
      ...(proj.keywords ?? []),
      ...(proj.roles ?? [])
    );
  }
  for (const education of resume.education ?? []) {
    parts.push(
      education.degree?.degreeLevel ?? '',
      ...(education.degree?.majors ?? []),
      ...(education.degree?.minors ?? []),
      ...(education.courses ?? [])
    );
  }
  for (const certificate of resume.certificates ?? []) {
    parts.push(certificate.name ?? '');
  }
  for (const language of resume.languages ?? []) {
    parts.push(language.language ?? '');
  }
  for (const entry of resume.volunteer ?? []) {
    parts.push(entry.position ?? '', entry.summary ?? '', ...(entry.highlights ?? []));
  }
  for (const award of resume.awards ?? []) {
    parts.push(award.title ?? '', award.summary ?? '');
  }
  for (const publication of resume.publications ?? []) {
    parts.push(publication.name ?? '', publication.summary ?? '');
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
 *
 * Every section the scorer can read is here, with ONLY the fields that
 * carry evidence. The envelope's own fields (contact details, urls,
 * employers, locations, dates) are not here on purpose — see the
 * `flattenResumeText` doc comment for the full list and the reasoning.
 */
export type ResumeTextSource = {
  basics: {
    summary?: string;
    label?: string;
    /**
     * Where the candidate is.
     *
     * ## Why the location is readable now
     *
     * It used to be excluded, on the doctrine that "a city is not a
     * skill". But the JD's OWN text often names its city ("we build our
     * platform in San Francisco"), and that puts `san` and `francisco`
     * into the JD's keyword vocabulary. With the candidate's location
     * excluded, a candidate who lives in the city of the job was
     * **charged for a token they could not pay off** — the Edmonton bug,
     * which had been fixed in the tip (`lib/scoring/tips.tsx`) and never
     * in the score.
     *
     * So the location is readable: if the JD names a place, the
     * candidate's address is the evidence. City and region only — the
     * street address, the postal code and the country code are noise.
     */
    location?: { city?: string; region?: string };
  };
  skills: Array<{ name: string; keywords: string[] }>;
  work: Array<{
    summary?: string;
    positions: Array<{ title?: string; highlights?: string[] }>;
  }>;
  projects?: Array<{
    name?: string;
    description?: string;
    highlights?: string[];
    keywords?: string[];
    roles?: string[];
  }>;
  /**
   * Education.
   *
   * Carries BOTH the subject evidence (degree level, majors, minors,
   * courses — what a JD can ask about) AND the dates (what the
   * eligibility module needs to say "your BSc completes in June 2027").
   *
   * The institution, its location, the GPA and the url are deliberately
   * absent: a proper noun, a number and a link are not evidence a JD
   * can ask for. See `flattenResumeText`.
   */
  education?: Array<{
    degree?: {
      degreeLevel?: string;
      majors?: string[];
      minors?: string[];
    };
    courses?: string[];
    startDate?: string;
    endDate?: string;
  }>;
  /** Certification names and issuers — a JD can ask for a credential. */
  certificates?: Array<{ name?: string; issuer?: string }>;
  /** Spoken languages — a JD can ask for a language. */
  languages?: Array<{ language?: string }>;
  /** Unpaid roles: the position, the summary and the bullets. */
  volunteer?: Array<{
    position?: string;
    summary?: string;
    highlights?: string[];
  }>;
  /** Award titles and summaries — evidence of recognised achievement. */
  awards?: Array<{ title?: string; summary?: string }>;
  /** Publication names and summaries — a paper is evidence of expertise. */
  publications?: Array<{ name?: string; summary?: string }>;
};

export type JobTextSource = {
  title?: string;
  description?: string;
  requirements?: string[];
  niceToHaves?: string[];
  benefits?: string[];
  /**
   * The intent extractor's priority skill lists.
   *
   * Present because **the eligibility gate detection must read the same
   * source the eligibility notes read.**
   *
   * The eligibility fix has two halves: the NOTES (a gate is reported
   * separately instead of being scored as a missing skill) and the
   * VOCABULARY (the gate's words are removed from the JD's keyword set,
   * so the candidate is not marked down for not writing "bachelor's
   * degree" on their resume). The notes read the extractor's skill
   * lists. The vocabulary read `requirements` + `niceToHaves` — which
   * are **always empty in production**, because the attach paths never
   * populate them (the raw JD text lives in `description`).
   *
   * Measured: a candidate WITH a bachelor's degree lost **1.91 points**
   * purely because the JD stated a degree requirement.
   *
   * Both halves now read the skill lists, so they cannot disagree.
   */
  mustHaveSkills?: string[];
  niceToHaveSkills?: string[];
  /**
   * Where the job is, as the posting writes it ("San Francisco, CA").
   *
   * Present so the JD's own location can be EXCLUDED from the keyword
   * vocabulary: a city is not a skill, and the candidate should not be
   * marked down for the job naming its own address.
   *
   * Populated by the intent extractor
   * (`lib/jd-parser/extract-jd-intent.ts`) — it already reads the
   * posting, so the field is free on an existing round trip.
   */
  location?: string;
};
