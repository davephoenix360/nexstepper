/**
 * Prompt template for the inline-issue surface's AI rewrite.
 *
 * One prompt per (path, criterion, tipKind) tuple. We deliberately
 * keep the system prompt SHORT — the model is small (Mistral Nemo)
 * and the format constraint does the heavy lifting via Zod
 * structured output (no JSON mode drift).
 *
 * Hard constraints from Plan §"Risks" #2:
 *   1. Rewrites may NOT fabricate skills not already in the
 *      bullet vocabulary or the JD vocabulary. We pass both as
 *      allow-lists in the prompt.
 *   2. Rewrites should be 1-2 sentences, mirroring the input's
 *      shape (the user is editing a bullet, not a paragraph).
 *
 * Plan: docs/plans/inline-issue-surface.md §"AI model choice"
 * (locked: Mistral Nemo via PARSER_MODEL + PARSE_FALLBACKS).
 */

import type { TipKind } from './types';

/**
 * Inputs the prompt needs. `jdVocabulary` is the JD's
 * `mustHaveSkills ∪ niceToHaveSkills ∪ title` (deduped, lowercased).
 * `bulletVocabulary` is the same for the resume — extracted by the
 * action from `flattenResumeText()`.
 */
export type RewritePromptInput = {
  criterion: string;
  tipKind: TipKind;
  sectionTitle: string;
  currentBullet: string;
  jdVocabulary: string[];
  resumeVocabulary: string[];
};

/**
 * Build the system + user prompts. Returned as two strings so the
 * caller (the AI helper) can route them through the Vercel AI SDK
 * as `system` + `prompt`.
 *
 * Stable function — same inputs always produce the same strings.
 * Tests snapshot the output to catch unintended drift.
 */
export function buildRewritePrompt(input: RewritePromptInput): {
  system: string;
  prompt: string;
} {
  const system = [
    'You rewrite a single bullet from a resume so it scores higher against a job description.',
    'Return exactly 3 distinct rewrites.',
    'Each rewrite must be 1-2 sentences, in the first-person implied style of a resume bullet (no "I", no quotes).',
    'Preserve all factual claims from the original bullet. Do NOT invent new employers, dates, or metrics.',
    tipKindSystemLine(input.tipKind),
    '',
    'Vocabulary rules:',
    '- You MAY use any word from the JD vocabulary list.',
    '- You MAY use any word from the resume vocabulary list.',
    '- You MAY use common resume action verbs (led, built, shipped, etc.).',
    '- You MUST NOT introduce a specific tool, framework, certification, employer, or numeric metric that is not in either vocabulary list.',
    '- Prefer rewriting with stronger verbs and clearer outcomes over appending new keywords.',
    '',
    'Return JSON with this shape: { "rewrites": ["...", "...", "..."] }.'
  ].join('\n');

  const prompt = [
    `Job target: ${input.sectionTitle} section.`,
    `Optimization criterion: ${input.criterion}.`,
    '',
    'Current bullet:',
    input.currentBullet,
    '',
    'JD vocabulary (you may use these terms):',
    formatList(input.jdVocabulary),
    '',
    'Resume vocabulary (already used elsewhere in the resume):',
    formatList(input.resumeVocabulary)
  ].join('\n');

  return { system, prompt };
}

/**
 * Adds one extra hint line for the `gap` case (skill gap) so the
 * model frames the rewrite as "weave in this missing skill" rather
 * than "tweak the wording".
 */
function tipKindSystemLine(tipKind: TipKind): string {
  switch (tipKind) {
    case 'gap':
      return [
        'The bullet is missing a vocabulary term that the JD emphasizes.',
        'Your rewrite should weave one of the JD vocabulary terms into the existing bullet.',
        'Do not append the term as a parenthetical — fold it into the action.'
      ].join(' ');
    case 'rewrite':
      return [
        'The bullet is present but reads weak (vague verbs, no outcome).',
        'Your rewrite should sharpen the action verb, surface the outcome, and keep the same factual scope.'
      ].join(' ');
  }
}

/**
 * Format an allow-list for the prompt. Capped at 60 terms to
 * stay under the model's context budget; longer lists are
 * truncated with a "+N more" note so the snapshot test stays
 * stable across resume sizes.
 */
function formatList(words: string[]): string {
  if (words.length === 0) return '(empty)';
  const cap = 60;
  const head = words.slice(0, cap);
  const tail = words.length > cap ? ` (+${words.length - cap} more)` : '';
  return head.join(', ') + tail;
}

/**
 * Heuristic allow-list extraction. Pulls nouns / tool-ish tokens
 * from a free-text source. We don't tokenize heavily here — the
 * caller (the action) can swap this out for the existing
 * `flattenResumeText()` / `flattenJobText()` helpers in
 * `lib/scoring/similarity.ts` if it wants a stronger signal.
 *
 * Exposed as a named export so tests can pin it; the action uses
 * it as the default and the page action can swap in the richer
 * scoring helpers if it wants.
 */
export function extractVocabulary(
  text: string,
  options: { cap?: number } = {}
): string[] {
  const cap = options.cap ?? 80;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/[^A-Za-z0-9+.#-]+/g)) {
    const t = raw.trim().toLowerCase();
    if (!t || t.length < 2) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= cap) break;
  }
  return out;
}