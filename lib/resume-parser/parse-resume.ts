import 'server-only';

import { generateObject } from 'ai';

import {
  resumeSectionsSchema,
  type ResumeSections
} from '@/lib/resume-schema';
import { RESUME_PARSER_MODEL, getModel } from '@/lib/ai/providers';

import {
  PARSER_SYSTEM_PROMPT,
  buildParseUserPrompt
} from './prompts';

/**
 * Discriminated union for the parser result — same shape the rest of
 * the app uses for Server Actions (see AGENTS.md §3). Lets callers
 * handle errors structurally instead of try/catching.
 */
export type ParseResumeResult =
  | {
      ok: true;
      data: ResumeSections;
      usage: { inputTokens: number; outputTokens: number };
    }
  | { ok: false; code: ParseResumeErrorCode; error: string };

export type ParseResumeErrorCode =
  | 'no_api_key'
  | 'ai_failure'
  | 'validation_failed'
  | 'resume_too_short';

const MIN_RESUME_LENGTH = 100;

/**
 * Parse free-form resume text into the structured ResumeSections shape.
 *
 * Uses Vercel AI SDK 6's `generateObject` with the `resumeSectionsSchema`
 * as the output contract. The model can't return a non-conforming object;
 * if it does, the SDK throws and we surface a `validation_failed` error.
 *
 * Behavior:
 *  - Empty / too-short input returns `resume_too_short` without hitting
 *    the API.
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
 * `RESUME_PARSER_MODEL` in `lib/ai/providers.ts`.
 *
 * The function is intentionally pure with respect to its inputs: same
 * resume text in → same ResumeSections out (assuming deterministic
 * temperature, which is the SDK default for `generateObject`).
 */
export async function parseResumeText(
  resumeText: string
): Promise<ParseResumeResult> {
  const trimmed = resumeText.trim();
  if (trimmed.length < MIN_RESUME_LENGTH) {
    return {
      ok: false,
      code: 'resume_too_short',
      error: `Resume text is too short (${trimmed.length} chars; need at least ${MIN_RESUME_LENGTH}). Paste a longer resume or upload a PDF/DOCX.`
    };
  }

  if (!process.env.AI_GATEWAY_API_KEY) {
    return {
      ok: false,
      code: 'no_api_key',
      error:
        'AI_GATEWAY_API_KEY is not configured. Set it in .env.local to enable resume parsing. Get a free key at vercel.com/dashboard → AI Gateway.'
    };
  }

  try {
    // 30s cap. Typical Gemini Flash response is 1-2s for our input
    // sizes; 30s is generous enough to absorb cold starts, queue
    // waits, and Gemini rate-limit retries, while preventing an
    // indefinite hang if the Gateway or upstream provider is
    // unreachable. The AbortError thrown by this surfaces in the
    // catch as `ai_failure` with the message "This operation was
    // aborted".
    const result = await generateObject({
      model: getModel(RESUME_PARSER_MODEL),
      system: PARSER_SYSTEM_PROMPT,
      prompt: buildParseUserPrompt(trimmed),
      schema: resumeSectionsSchema,
      temperature: 0,
      abortSignal: AbortSignal.timeout(30_000)
    });

    return {
      ok: true,
      data: result.object,
      usage: {
        inputTokens: result.usage.inputTokens ?? 0,
        outputTokens: result.usage.outputTokens ?? 0
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
