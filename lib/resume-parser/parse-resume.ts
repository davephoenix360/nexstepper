import 'server-only';

import { generateObject } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';

import {
  resumeSectionsSchema,
  type ResumeSections
} from '@/lib/resume-schema';

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
const ANTHROPIC_MODEL = 'claude-sonnet-4-5';

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
 *  - Missing `ANTHROPIC_API_KEY` returns `no_api_key` (the UI shows a
 *    "configure your API key" banner — we don't pretend the parse
 *    succeeded with a fallback shape).
 *  - Any other failure (rate limit, network, model error) returns
 *    `ai_failure` with the underlying message.
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

  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      ok: false,
      code: 'no_api_key',
      error:
        'ANTHROPIC_API_KEY is not configured. Set it in .env.local to enable resume parsing.'
    };
  }

  try {
    const result = await generateObject({
      model: anthropic(ANTHROPIC_MODEL),
      system: PARSER_SYSTEM_PROMPT,
      prompt: buildParseUserPrompt(trimmed),
      schema: resumeSectionsSchema,
      temperature: 0
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
