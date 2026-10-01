import { tokenize, type TokenSet } from './similarity';

/**
 * Skill-presence matching for the scoring engine.
 *
 * ## Why this module exists
 *
 * `dimensions/intent-coverage.ts` used to decide whether a JD skill was
 * present with a bare case-insensitive substring test:
 *
 * ```ts
 * resumeTextLower.includes(skill.toLowerCase())
 * ```
 *
 * That is wrong in **both** directions, and both errors cost real points:
 *
 * 1. **False negative.** A JD listing `Python/Django` (a Python-with-Django
 *    stack) is one *satisfied* requirement expressed as two technologies, but
 *    the substring test looks for the literal `python/django`. A resume
 *    listing Python *and* Django is recorded as **missing the skill**, is
 *    penalised 8 points, and the UI tells the user to add a skill they
 *    already have.
 * 2. **False positive.** `includes('go')` matches the `go` inside `mongodb`.
 *    The same test credited a resume mentioning only MongoDB and Redis with
 *    `Go`, `R` *and* `C` — a perfect intent-coverage score for skills it does
 *    not have.
 *
 * `dimensions/ats-matching.ts` had already moved off substring matching in
 * Phase 1, with a citation (token-set 91% vs substring 67% precision). This
 * module is that same token-set approach, extracted so the two dimensions
 * stop disagreeing with each other about the same job description.
 *
 * Pure, synchronous, no IO. Determinism asserted by `purity.test.ts`.
 */

/** Pre-computed view of a resume, so a JD with 20 skills does 20 lookups, not 20 scans. */
export interface SkillIndex {
  /** Whole-word tokens: `MongoDB` → `{ mongodb }`. */
  tokens: TokenSet;
  /**
   * Punctuation-collapsed forms: `Node.js` → `{ nodejs }`, `node-js` →
   * `{ nodejs }`, `NodeJS` → `{ nodejs }`. Catches spelling variants that
   * tokenisation alone would split apart.
   */
  collapsed: TokenSet;
  /** Lowercased source text, for the word-boundary fallback. */
  lower: string;
}

/** Build a reusable index from the flattened resume text. */
export function buildSkillIndex(resumeText: string): SkillIndex {
  const lower = resumeText.toLowerCase();
  const tokens = tokenize(resumeText);
  const collapsed = new Set<string>();

  // One collapsed form per alphanumeric run: "Node.js (v20)" → nodejs, v20.
  for (const chunk of lower.split(/[^a-z0-9+#.]+/i)) {
    const key = chunk.replace(/[^a-z0-9+#]/gi, '');
    // 1-char collapses are noise ("a", "-"), and a bare "c" would collide
    // with an enormous number of unrelated words. Require 2+ like tokenize.
    if (key.length >= 2) collapsed.add(key);
  }

  return { tokens, collapsed, lower };
}

/**
 * Strip everything but alphanumerics, so `"Node.js (v20)"` → `"nodejsv20"`.
 * Used to compare a skill against a resume on a punctuation-free footing.
 */
function collapse(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9+#]/gi, '');
}

/**
 * Whole-word match. `\bgo\b` does **not** match the `go` inside `mongodb`
 * (there is no word boundary before the `g`), which is precisely the
 * false positive we are removing. Used only as a fallback for skills that
 * tokenise to nothing — e.g. `"R"`, `"C"`, `"Go"` is fine but single letters
 * are dropped by `tokenize`'s length rule.
 */
function hasWordBoundary(haystackLower: string, needle: string): boolean {
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  try {
    return new RegExp(`\\b${escaped}\\b`, 'i').test(haystackLower);
  } catch {
    return false;
  }
}

/**
 * Is `skill` (a JD must-have / nice-to-have / implicit entry) demonstrated by
 * the resume?
 *
 * Three checks, cheapest and most likely first:
 *
 * 1. **Collapsed whole-skill match** — handles punctuation and casing variants
 *    of a *single* technology: `Node.js`, `node-js` and `NodeJS` all collapse
 *    to `nodejs`. Does **not** fire for stacks, because `Python/Django`
 *    collapses to `pythondjango` and won't appear as a word.
 * 2. **Every constituent token present** — the fix for compound skills.
 *    `Python/Django` becomes `{python, django}` and needs **both**, matching
 *    what a JD actually means by a slash-joined stack. Also the fix for false
 *    positives, because token membership never matches inside a word.
 * 3. **Word-boundary fallback** — for skills `tokenize` drops entirely
 *    (single characters like `"R"`), so they aren't permanently unmatchable.
 *
 * Deliberately not doing stemming, lemmatisation or synonym expansion. Synonym
 * expansion is a genuinely good idea and the *right* long-term answer (it is
 * what Jev-style semantic judging would replace) — but a hand-rolled synonym
 * map is guesswork that silently invents matches, and the previous
 * "conservative and predictable" call was the correct one for a number a user
 * will act on. See `docs/drift/2026-10-01-ats-scoring-review.md` §6.
 */
export function isSkillCovered(skill: string, index: SkillIndex): boolean {
  if (typeof skill !== 'string') return false;
  const raw = skill.trim();
  if (raw.length === 0) return false;

  // 1. Punctuation/casing variants of a single technology.
  const collapsed = collapse(raw);
  if (collapsed.length >= 2 && index.collapsed.has(collapsed)) return true;

  // 2. Compound stacks need every constituent.
  const tokens = [...tokenize(raw)];
  if (tokens.length > 0 && tokens.every((t) => index.tokens.has(t))) return true;

  // 3. Single-character skills ("R", "C") survive tokenize's length filter.
  return hasWordBoundary(index.lower, raw);
}

/**
 * Which of `skills` the resume does **not** demonstrate, in input order.
 * Returns the original strings (not normalised) so the UI keeps showing the
 * JD's own terminology.
 */
export function findMissingSkills(skills: string[], index: SkillIndex): string[] {
  const missed: string[] = [];
  for (const skill of skills) {
    if (typeof skill !== 'string' || skill.length === 0) continue;
    if (!isSkillCovered(skill, index)) missed.push(skill);
  }
  return missed;
}
