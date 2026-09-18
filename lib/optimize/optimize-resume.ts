import 'server-only';

import { generateObject } from 'ai';
import { z } from 'zod';

import {
  PARSER_MODEL,
  PARSE_FALLBACKS
} from '@/lib/ai/providers';
import { generateObjectWithFallbacks } from '@/lib/ai/fallback';

import {
  OPTIMIZER_SYSTEM_PROMPT,
  buildSummaryUserPrompt
} from './prompts';

/**
 * Optimize tool — rewrite a specific resume section to better
 * match a target job description.
 *
 * ## V0 scope
 *
 * Only the `basics.summary` section is wired up. The plumbing
 * (server action, UI, fallback chain, save-on-accept) is
 * section-type-agnostic so adding `work[*].highlights` next is
 * one function call + one prompt builder.
 *
 * ## Privacy
 *
 * Same posture as the JD + resume parsers: the candidate's data
 * is sent to Anthropic / OpenAI / etc. through the Vercel AI
 * Gateway for the rewrite. The original text is never stored
 * anywhere outside the user's own revisions — the Optimize tool
 * writes a new revision on accept, like every other save path.
 *
 * ## Tier gating
 *
 * The original rebuild plan has Optimize as Pro-only. V0 doesn't
 * implement the gate — anyone can use it. The gate is a small
 * follow-up that adds an entitlement check (Stripe subscription
 * status) at the top of the action.
 */

const MIN_JD_LENGTH = 200;
// Hard cap on how much JD we send to the model. Most JDs are
// 2-5K tokens; truncating at 8K chars (≈ 2K tokens) is a generous
// ceiling that still gives the model plenty of context.
const MAX_JD_CHARS = 8_000;
const MAX_SUMMARY_CHARS = 2_000;

export type OptimizeSectionKey = 'basics.summary';

export type OptimizeResult =
  | {
      ok: true;
      optimized: string;
      modelUsed: string;
    }
  | {
      ok: false;
      code: OptimizeErrorCode;
      error: string;
    };

export type OptimizeErrorCode =
  | 'jd_too_short'
  | 'summary_missing'
  | 'no_api_key'
  | 'ai_failure'
  | 'validation_failed';

/**
 * Rewrite the candidate's basics.summary against a target JD.
 *
 * Returns a discriminated union — the caller (server action)
 * turns the `code` into a user-facing message.
 */
export async function optimizeSummarySection({
  currentSummary,
  jdText
}: {
  currentSummary: string;
  jdText: string;
}): Promise<OptimizeResult> {
  const trimmedJd = jdText.trim();
  if (trimmedJd.length < MIN_JD_LENGTH) {
    return {
      ok: false,
      code: 'jd_too_short',
      error: `Job description is too short (${trimmedJd.length} chars; need at least ${MIN_JD_LENGTH}). Paste the full JD for a useful rewrite.`
    };
  }

  // We allow empty summaries (the optimizer will write a fresh
  // one from context), but flag the case so the user knows what
  // happened. Surface as a separate code rather than failing
  // silently.
  if (!currentSummary?.trim()) {
    // Don't reject — the prompt handles the "no summary yet" case.
    // We just won't reject the request.
  }

  if (!process.env.AI_GATEWAY_API_KEY) {
    return {
      ok: false,
      code: 'no_api_key',
      error:
        'AI_GATEWAY_API_KEY is not configured. Set it in .env.local to enable Optimize. Get a free key at vercel.com/dashboard → AI Gateway.'
    };
  }

  const truncatedJd = trimmedJd.slice(0, MAX_JD_CHARS);
  const safeSummary = (currentSummary ?? '').slice(0, MAX_SUMMARY_CHARS);

  try {
    const result = await generateObjectWithFallbacks<{ summary: string }>({
      models: [PARSER_MODEL, ...PARSE_FALLBACKS],
      system: OPTIMIZER_SYSTEM_PROMPT,
      prompt: buildSummaryUserPrompt({
        currentSummary: safeSummary,
        jdText: truncatedJd
      }),
      schema: optimizeSummarySchema,
      temperature: 0.4, // a little creativity, but still grounded
      abortSignal: AbortSignal.timeout(90_000)
    });

    const optimized = result.data.summary.trim();
    if (!optimized) {
      return {
        ok: false,
        code: 'validation_failed',
        error: 'The optimizer returned an empty summary. Try a different JD or a more detailed current summary.'
      };
    }

    return { ok: true, optimized, modelUsed: result.modelUsed };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      code: 'ai_failure',
      error: message || 'The optimizer failed to produce a rewrite.'
    };
  }
}

/**
 * Strict output schema for the summary rewrite. The model must
 * return a single string under 1,500 chars (our prompt asks for
 * ~600-900, so this is a sanity ceiling).
 */
const optimizeSummarySchema = z.object({
  summary: z
    .string()
    .min(1)
    .max(1500)
    .describe(
      'The rewritten summary text — 1-5 sentences, ~600-900 chars ideal. No preamble.'
    )
});

/**
 * Pull the candidate's current summary out of their resume data.
 * Returns the string (possibly empty) and the length for the
 * server action to log.
 */
export function extractSummaryFromResumeData(resumeData: {
  sections: { basics?: { summary?: string } };
}): { value: string; length: number } {
  const value = resumeData.sections?.basics?.summary ?? '';
  return { value, length: value.length };
}

/**
 * Apply an optimized rewrite to a resume's sections.basics.summary
 * and return the new sections envelope. Pure function — no DB.
 */
export function applyOptimizedSummary<
  T extends { sections: { basics?: { summary?: string } } }
>(resumeData: T, newSummary: string): T {
  return {
    ...resumeData,
    sections: {
      ...resumeData.sections,
      basics: {
        // `basics` is optional in the constraint but always present
        // on the returned shape — we create an empty one if missing.
        ...(resumeData.sections.basics ?? {}),
        summary: newSummary
      }
    }
  };
}
