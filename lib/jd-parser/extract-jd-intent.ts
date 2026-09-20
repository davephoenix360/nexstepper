import 'server-only';

import { z } from 'zod';

import { JD_INTENT_EXTRACTOR_MODEL, JD_INTENT_EXTRACTOR_FALLBACKS } from '@/lib/ai/providers';
import { generateObjectWithFallbacks } from '@/lib/ai/fallback';

import { JD_INTENT_EXTRACTOR_SYSTEM_PROMPT } from './prompts';

/**
 * Zod schema for the v2 intent-extraction output. Drives both the
 * AI structured-output call (passed as `schema` to `generateObjectWithFallbacks`)
 * and the persisted payload on `jobPostingSchema` v2 fields.
 *
 * Kept in this module (not `lib/resume-schema/job-posting.ts`) because
 * it's a transport shape between the AI and the storage schema -- the
 * storage schema applies tighter validation (max-50 arrays, dedupe, etc.)
 * at write time.
 *
 * Field rationale lives on `JD_INTENT_EXTRACTOR_SYSTEM_PROMPT`. The
 * schema mirrors it 1:1.
 */
export const extractJdIntentSchema = z.object({
  mustHaveSkills: z.array(z.string().min(1).max(120)).max(50).default([]),
  niceToHaveSkills: z.array(z.string().min(1).max(120)).max(50).default([]),
  implicitSkills: z.array(z.string().min(1).max(120)).max(50).default([]),
  seniorityLevel: z
    .enum(['intern', 'junior', 'mid', 'senior', 'staff', 'principal', 'manager', 'director', 'vp'])
    .nullable()
    .default(null),
  yearsRequiredMin: z.number().int().nonnegative().nullable().default(null),
  yearsRequiredMax: z.number().int().nonnegative().nullable().default(null),
  roleFamily: z.string().min(1).max(120).nullable().default(null),
  domainSignals: z.array(z.string().min(1).max(60)).max(20).default([])
});

export type ExtractedJdIntent = z.infer<typeof extractJdIntentSchema>;

/**
 * Discriminated union for the extractor result.
 *
 * Why a union, not exceptions:
 *   - The extractor is a non-critical enrichment. The variant scoring
 *     keeps working when this fails (it just uses the legacy token-based
 *     matching). Surfacing a typed result lets the caller persist
 *     `extractedAt: null` without a try/catch and without losing the
 *     rest of the structured data.
 *   - Matches the `FormatJdResult` shape used by `format-jd-as-markdown.ts`
 *     so callers can use the same error-code handling pattern.
 */
export type ExtractJdResult =
  | {
      ok: true;
      data: { intent: ExtractedJdIntent; extractedAt: string; model: string };
    }
  | { ok: false; code: ExtractErrorCode; error: string };

export type ExtractErrorCode =
  | 'no_api_key'
  | 'input_too_short'
  | 'input_too_large'
  | 'ai_failure'
  | 'empty_output';

/** Below this, the AI round-trip isn't worth it. */
const MIN_INPUT_LENGTH = 50;
/** Above this, the extractor refuses (matches `setVariantJobContextSchema`). */
const MAX_INPUT_LENGTH = 16_000;
/** Per-model timeout. The free tier is usually <2s; 30s is the long tail. */
const EXTRACT_TIMEOUT_MS = 30_000;
/** Output cap. Real extraction outputs are ~1K tokens; 2K is plenty. */
const EXTRACT_MAX_OUTPUT = 2_000;

/**
 * Extract structured intent from a raw JD text.
 *
 * Used by:
 *   - `createVariantFromJdAction` -- when the user clicks the
 *     "Tailor with a JD" CTA on a master card.
 *   - `setVariantJobContextAction` -- when the user pastes a JD
 *     into the right rail.
 *   - Lazy first-read backfill (Phase 1 follow-up) for legacy JDs
 *     attached before this extractor shipped.
 *
 * The output is stored on the resume's `jobContext.mustHaveSkills[]`,
 * `niceToHaveSkills[]`, etc. fields (see `lib/resume-schema/job-posting.ts`)
 * and consumed by the v2 Intent Coverage dimension (Phase 1) and Phase 2
 * Seniority Fit / Role Fit dimensions. Pure-additive: the v1 scoring
 * continues to work when the v2 fields are empty.
 *
 * Failure as a value, not a throw:
 *   - Missing `AI_GATEWAY_API_KEY` -> `{ ok: false, code: 'no_api_key' }`
 *   - Empty / too-short / too-long input -> typed codes (no API call)
 *   - AI Gateway errors / rate limits / timeouts -> `ai_failure`
 *   - Model returned an empty / all-defaults object -> `empty_output`
 *
 * The caller decides what to do with each code. Current pattern: persist
 * `extractedAt: null` and let the v1 scoring continue. Phase 1 also
 * adds a flag that runs the extractor lazily on first variant open.
 *
 * Anti-hallucination: the system prompt (see `prompts.ts`) is strict
 * about conservative classification -- ambiguous sections default to
 * nice-to-have, not must-have. Empty arrays are valid output.
 *
 * Plan: docs/plans/ats-scoring-v2.md
 */
export async function extractJdIntent(
  rawText: string
): Promise<ExtractJdResult> {
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
        'AI_GATEWAY_API_KEY is not configured. v2 intent scoring will use v1 token-based scoring.'
    };
  }

  try {
    const result = await generateObjectWithFallbacks({
      models: [JD_INTENT_EXTRACTOR_MODEL, ...JD_INTENT_EXTRACTOR_FALLBACKS],
      system: JD_INTENT_EXTRACTOR_SYSTEM_PROMPT,
      prompt: buildExtractUserPrompt(trimmed),
      schema: extractJdIntentSchema,
      temperature: 0,
      abortSignal: AbortSignal.timeout(EXTRACT_TIMEOUT_MS)
    });

    if (isEmptyOutput(result.data)) {
      return {
        ok: false,
        code: 'empty_output',
        error:
          'The extractor returned an empty result. The JD may be too vague to extract intent from. v2 intent scoring will use v1 token-based scoring.'
      };
    }

    return {
      ok: true,
      data: {
        intent: result.data,
        // Generate the timestamp server-side so the client can't back-date it.
        extractedAt: new Date().toISOString(),
        // The fallback chain returns the model that actually served the
        // request -- store for cost attribution and reproducibility.
        model: result.modelUsed
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
 * Build the user prompt for the extractor. We wrap the JD in a thin
 * envelope so the model can distinguish "this is the JD" from "this
 * is your instructions" -- same pattern as `buildParseUserPrompt` and
 * `buildFormatUserPrompt`.
 */
function buildExtractUserPrompt(jdText: string): string {
  return `Extract the structured intent from the following job description. Output ONLY the JSON object matching the schema, no preamble, no closing remarks.

<job_description>
${jdText}
</job_description>`;
}

/**
 * Heuristic for "the model gave us nothing useful". We treat an
 * extraction as empty when every field is null/empty -- a real JD
 * almost always surfaces at least one must-have skill or a seniority
 * level. Empty outputs are still VALID JSON (Zod parses them fine),
 * they just don't move the scorecard needle.
 *
 * Note: this is a deliberate design choice. We could return an "all
 * nulls" extraction as success and let the downstream scoring fall
 * back to v1 token-based scoring. We instead surface it as `empty_output`
 * so the caller can decide whether to log a warning, surface a UI hint,
 * or skip persisting the cache entry (which would force re-extraction
 * next time).
 */
function isEmptyOutput(intent: ExtractedJdIntent): boolean {
  return (
    intent.mustHaveSkills.length === 0 &&
    intent.niceToHaveSkills.length === 0 &&
    intent.implicitSkills.length === 0 &&
    intent.seniorityLevel === null &&
    intent.yearsRequiredMin === null &&
    intent.yearsRequiredMax === null &&
    intent.roleFamily === null &&
    intent.domainSignals.length === 0
  );
}
