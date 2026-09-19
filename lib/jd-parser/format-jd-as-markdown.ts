import 'server-only';

import {
  JD_FORMATTER_MODEL,
  JD_FORMATTER_FALLBACKS
} from '@/lib/ai/providers';
import { generateTextWithFallbacks } from '@/lib/ai/fallback';
import { JD_FORMATTER_SYSTEM_PROMPT } from './prompts';

/**
 * Discriminated union for the formatter result.
 *
 * Why a union, not exceptions:
 *   - The formatter is a non-critical UI enhancement. The variant
 *     editor's right-rail `<JdPanel>` keeps working when this fails
 *     (it just renders the raw JD text instead). Surfacing a typed
 *     result lets the caller store `null` on the resume without a
 *     try/catch and without losing the structured parse that ran
 *     in parallel.
 *   - Matches the `ParseJdResult` shape used by `parse-jd.ts` so
 *     callers can use the same error-code handling pattern.
 */
export type FormatJdResult =
  | { ok: true; data: { markdown: string; markdownGeneratedAt: string } }
  | { ok: false; code: FormatErrorCode; error: string };

export type FormatErrorCode =
  | 'no_api_key'
  | 'input_too_short'
  | 'input_too_large'
  | 'ai_failure'
  | 'empty_output';

/** Below this, the AI round-trip isn't worth it. */
const MIN_INPUT_LENGTH = 50;
/** Above this, the formatter refuses (matches `setVariantJobContextSchema`). */
const MAX_INPUT_LENGTH = 16_000;
/** Per-model timeout. The free tier is usually <1s; 30s is the long tail. */
const FORMAT_TIMEOUT_MS = 30_000;
/** Output cap. Real formatted JDs are 1-3K chars; 4K is plenty. */
const FORMAT_MAX_OUTPUT = 4_000;

/**
 * Re-format a raw job-description string as well-structured Markdown.
 *
 * Used by:
 *   - `setVariantJobContextAction` — when the user pastes a JD into
 *     the right rail.
 *   - `createVariantFromJdAction` — when the user clicks the
 *     "Tailor with a JD" CTA on a master card.
 *
 * The output is stored on the resume's `jobContext.markdown` field
 * and re-rendered (cheaply) by `<JdPanel>` on every editor open. This
 * is a one-shot transformation — we never re-format on render.
 *
 * Failure as a value, not a throw:
 *   - Missing `AI_GATEWAY_API_KEY` → `{ ok: false, code: 'no_api_key' }`
 *   - Empty / too-short / too-long input → typed codes (no API call)
 *   - AI Gateway errors / rate limits / timeouts → `ai_failure`
 *   - Model returned an empty string (rare but possible if the prompt
 *     confused it) → `empty_output`
 *
 * The caller decides what to do with each code. The current caller
 * pattern is: store `markdown: null, markdownGeneratedAt: null` on
 * the resume and let the UI fall back to raw text.
 *
 * Anti-hallucination: the system prompt (see `prompts.ts`) is strict
 * about preserving the source verbatim — no summarization, no rewrite.
 * The formatter only adds Markdown structure to text that already
 * implies it.
 */
export async function formatJdAsMarkdown(
  rawText: string
): Promise<FormatJdResult> {
  const trimmed = rawText.trim();

  if (trimmed.length === 0 || trimmed.length < MIN_INPUT_LENGTH) {
    return {
      ok: false,
      code: 'input_too_short',
      error: `Job description is too short (${trimmed.length} chars; need at least ${MIN_INPUT_LENGTH}).`
    };
  }

  if (trimmed.length > MAX_INPUT_LENGTH) {
    return {
      ok: false,
      code: 'input_too_large',
      error: `Job description is too long (${trimmed.length} chars; max ${MAX_INPUT_LENGTH}).`
    };
  }

  if (!process.env.AI_GATEWAY_API_KEY) {
    return {
      ok: false,
      code: 'no_api_key',
      error:
        'AI_GATEWAY_API_KEY is not configured. The JD panel will render raw text.'
    };
  }

  try {
    const result = await generateTextWithFallbacks({
      models: [JD_FORMATTER_MODEL, ...JD_FORMATTER_FALLBACKS],
      system: JD_FORMATTER_SYSTEM_PROMPT,
      prompt: buildFormatUserPrompt(trimmed),
      temperature: 0,
      abortSignal: AbortSignal.timeout(FORMAT_TIMEOUT_MS),
      maxOutputTokens: FORMAT_MAX_OUTPUT
    });

    const cleaned = cleanOutput(result.text);

    if (!cleaned) {
      return {
        ok: false,
        code: 'empty_output',
        error:
          'The formatter returned an empty response. The JD panel will render raw text.'
      };
    }

    return {
      ok: true,
      data: {
        markdown: cleaned,
        // Generate the timestamp server-side so the client can't
        // back-date it. `randomUUID()` is included as the cheapest
        // available entropy source for the data hash (not used here,
        // but keeps the call site uniform with other modules).
        markdownGeneratedAt: new Date().toISOString()
      }
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      code: 'ai_failure',
      error: message
    };
  }
}

/**
 * Build the user prompt for the formatter. We wrap the JD in a thin
 * envelope so the model can distinguish "this is the JD" from "this
 * is your instructions" — same pattern as `buildParseUserPrompt`.
 */
function buildFormatUserPrompt(jdText: string): string {
  return `Re-format the following job description as Markdown. Output ONLY the formatted Markdown, no preamble, no closing remarks.

<job_description>
${jdText}
</job_description>`;
}

/**
 * Sanitize the model's output before we persist it.
 *
 * What this does:
 *   1. Strip leading/trailing whitespace.
 *   2. Strip a single leading "Here is the formatted JD:" / "Sure!"
 *      preamble if the model slipped one in despite the system prompt.
 *      Detection is conservative — we only strip if the line ends with
 *      ":" or "!" and is on its own line, so we don't accidentally
 *      strip a heading the user wants.
 *   3. Strip a leading/trailing \`\`\`markdown / \`\`\` fence pair if
 *      the model wrapped its output (the system prompt says don't, but
 *      small models occasionally do). We only strip if BOTH opening
 *      and closing fences are present and the content between is
 *      non-empty.
 *   4. Collapse runs of 3+ blank lines into a single blank line.
 *
 * The fence + preamble strip order matters: when both are present
 * ("Sure!\n\n\`\`\`markdown\n\n\`\`\`"), we strip the preamble FIRST
 * and then re-check for a fence wrap. The reverse order would miss
 * this pattern because the fence regex anchors at the start of the
 * string.
 *
 * What this does NOT do:
 *   - Parse or validate the Markdown. `react-markdown` handles
 *     edge cases (raw HTML, malformed links, etc.) on render.
 *   - Limit the output length. We trust the AI SDK's `maxOutputTokens`
 *     cap to keep the response within sane bounds; the storage slot
 *     is a regular TEXT column, so we don't need to enforce a second
 *     ceiling here.
 */
function cleanOutput(raw: string): string | null {
  let text = raw.trim();
  if (!text) return null;

  // Helper: strip a wrapping ```language ... ``` fence if present.
  const stripFence = (input: string): string | null => {
    const fenceMatch = input.match(
      /^```[a-zA-Z0-9_-]*\n([\s\S]*?)\n```\s*$/
    );
    if (fenceMatch) {
      const inner = fenceMatch[1].trim();
      return inner || null;
    }
    return input;
  };

  // 1. Strip a fence wrap, if any.
  const stripped = stripFence(text);
  if (stripped === null) return null;
  text = stripped;

  // 2. Strip a one-line preamble of the form "Here is the formatted...:".
  // Conservative — only matches a single short line that ends in
  // ":" or "!" or "." so we don't accidentally strip a heading.
  const preambleMatch = text.match(/^([^\n]{1,80}[:.!?])\s*\n/);
  if (
    preambleMatch &&
    /^here'?s|here is|sure|certainly|okay|of course|below is/i.test(
      preambleMatch[1]
    )
  ) {
    text = text.slice(preambleMatch[0].length).trim();
    if (!text) return null;
    // 3. After the preamble strip, re-check for a fence wrap. The
    // model occasionally outputs "Sure!\n\n```markdown\n\n```",
    // which the first fence check missed (the regex anchored on the
    // string start) but the cleaned-up form now matches.
    const restripped = stripFence(text);
    if (restripped === null) return null;
    text = restripped;
  }

  // 4. Collapse runs of 3+ blank lines into a single blank line.
  text = text.replace(/\n{3,}/g, '\n\n');

  return text || null;
}
