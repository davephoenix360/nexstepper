import 'server-only';

import { parsedJdSchema, type ParsedJd } from './schema';
import {
  PARSER_SYSTEM_PROMPT,
  buildParseUserPrompt
} from './prompts';
import { PARSER_MODEL, PARSE_FALLBACKS } from '@/lib/ai/providers';
import { generateObjectWithFallbacks } from '@/lib/ai/fallback';
import { aiStrict } from '@/lib/ai/ai-strict-schema';

/**
 * Discriminated union for the parser result — same shape the rest of the
 * app uses for Server Actions (see AGENTS.md §3). Lets callers handle
 * errors structurally instead of try/catching.
 */
export type ParseJdResult =
  | { ok: true; data: ParsedJd; usage: { inputTokens: number; outputTokens: number } }
  | { ok: false; code: ParseErrorCode; error: string };

export type ParseErrorCode =
  | 'no_api_key'
  | 'ai_failure'
  | 'validation_failed'
  | 'jd_too_short';

const MIN_JD_LENGTH = 50;

/**
 * Parse a free-form job description into the structured ParsedJd shape.
 *
 * Uses Vercel AI SDK 6's `generateObject` with `output: 'structured'` and
 * the `parsedJdSchema` as the output contract. The model can't return a
 * non-conforming object; if it does, the SDK throws and we surface a
 * `validation_failed` error.
 *
 * Behavior:
 *  - Empty / too-short JDs return `jd_too_short` without hitting the API.
 *  - Missing `AI_GATEWAY_API_KEY` returns `no_api_key` (the UI shows a
 *    "configure your API key" banner — we don't pretend the parse
 *    succeeded with a fallback shape). The gateway's free tier
 *    requires only a one-time signup at vercel.com/dashboard.
 *  - Any other failure (rate limit, network, model error) returns
 *    `ai_failure` with the underlying message.
 *
 * Routing: the call goes through Vercel AI Gateway (`@ai-sdk/gateway`)
 * so we get free observability + automatic cross-provider failover
 * even when using the Anthropic Claude model. Swap models by changing
 * `JD_PARSER_MODEL` in `lib/ai/providers.ts`.
 *
 * The function is intentionally pure with respect to its inputs: same JD
 * in → same ParsedJd out (assuming deterministic temperature, which is
 * the SDK default for `generateObject`). The caller decides what to do
 * with the result.
 */
export async function parseJd(jdText: string): Promise<ParseJdResult> {
  const trimmed = jdText.trim();
  if (trimmed.length < MIN_JD_LENGTH) {
    return {
      ok: false,
      code: 'jd_too_short',
      error: `Job description is too short (${trimmed.length} chars; need at least ${MIN_JD_LENGTH}).`
    };
  }

  if (!process.env.AI_GATEWAY_API_KEY) {
    return {
      ok: false,
      code: 'no_api_key',
      error:
        'AI_GATEWAY_API_KEY is not configured. Set it in .env.local to enable JD parsing. Get a free key at vercel.com/dashboard → AI Gateway.'
    };
  }

  try {
    // 90s cap per model in the chain. See resume-parser/parse-resume.ts
    // for the rationale on per-model timeouts + the fallback chain.
    const result = await generateObjectWithFallbacks<ParsedJd>({
      models: [PARSER_MODEL, ...PARSE_FALLBACKS],
      system: PARSER_SYSTEM_PROMPT,
      prompt: buildParseUserPrompt(trimmed),
      // `aiStrict()` peels every `.default(...)` wrapper so OpenAI's
      // strict JSON-schema mode accepts the schema. See
      // `lib/ai/ai-strict-schema.ts` for the production error this fixes.
      schema: aiStrict(parsedJdSchema),
      // generateObject already retries once on validation failure (it'll
      // re-prompt the model with the schema errors). We don't need to
      // wrap that in our own retry loop.
      temperature: 0,
      abortSignal: AbortSignal.timeout(90_000)
    });

    return {
      ok: true,
      data: result.data,
      usage: result.usage
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
