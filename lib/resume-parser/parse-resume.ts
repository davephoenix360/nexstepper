import 'server-only';

import {
  resumeSectionsSchema,
  type ResumeSections
} from '@/lib/resume-schema';
import {
  PARSER_MODEL,
  PARSE_FALLBACKS,
  getModel
} from '@/lib/ai/providers';
import { generateObjectWithFallbacks } from '@/lib/ai/fallback';

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
    // Hard cap on the WHOLE AI fallback chain. The per-model 90s
    // timeout inside `generateObjectWithFallbacks` handles a single
    // hung model; this 180s cap handles the "every model is slow"
    // case (e.g. provider-wide latency spike) where every model in
    // the chain burns its full 90s before falling through. Without
    // this, a slow-everywhere scenario could run 360s+ (4 models ×
    // 90s) and exhaust the Server Action's Vercel maxDuration
    // budget, returning 499 to the client.
    //
    // 180s is chosen because:
    //   - Observed happy-path latency is 57-153s (Sep 28 prod audit)
    //   - It's well under the 300s outer maxDuration set on the
    //     resumes page (see `app/(dashboard)/dashboard/resumes/page.tsx`)
    //   - It gives the user a clear "this took too long, please
    //     try again" error rather than a silent timeout
    const globalTimeout = AbortSignal.timeout(180_000);

    const result = await generateObjectWithFallbacks<ResumeSections>({
      models: [PARSER_MODEL, ...PARSE_FALLBACKS],
      system: PARSER_SYSTEM_PROMPT,
      prompt: buildParseUserPrompt(trimmed),
      // Schema per-model selection lives in `generateObjectWithFallbacks`:
      //   - OpenAI / Azure: stripped of `.default(...)` so its strict
      //     `response_format: json_schema` validator accepts it
      //   - Mistral / Meta / Amazon: kept loose so their form-friendly
      //     `.default(...)` style works AND so the recovery path
      //     (re-parse with `safeParse` after a valid JSON response fails
      //     the AI SDK's stricter validator) can apply defaults
      //     to keys the model omitted or set to `null`.
      schema: resumeSectionsSchema,
      temperature: 0,
      abortSignal: globalTimeout
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
