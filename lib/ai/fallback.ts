import 'server-only';

import { generateObject, type LanguageModel } from 'ai';
import type { ZodType } from 'zod';

import { aiStrict } from '@/lib/ai/ai-strict-schema';

/**
 * Try a list of models in order, returning the first successful
 * response. Logs which model actually served the request so we
 * can see in the dev terminal which provider the response came
 * from (useful for diagnosing fallback behavior).
 *
 * Why we wrote this ourselves instead of using a native gateway
 * feature:
 *  - `@ai-sdk/gateway@3` (the AI-SDK-6-compatible bridge version)
 *    doesn't expose the declarative `models` chain from AI SDK 7.
 *    Upgrading to AI SDK 7 is on the roadmap but is its own
 *    multi-commit migration.
 *  - Manual fallback is 10 lines of code that's trivially
 *    debuggable. The native version would be a config option we
 *    have to remember exists.
 *
 * What we consider a "fallback-worthy failure":
 *  - Timeout (AbortError)
 *  - 5xx from upstream
 *  - Network errors
 *
 * What we DO NOT fall back from (let it bubble as `validation_failed`):
 *  - Schema validation failures - the model gave us something but
 *    it didn't match the schema. Falling back won't help; the
 *    downstream model will likely make the same mistake.
 *
 * Returns the model name that succeeded in `modelUsed` so callers
 * can log it for cost attribution.
 */

/**
 * Per-call output token budget. The AI SDK 6 default is the model's
 * full context-window-cap (16K for gpt-4o-mini), but OpenAI's strict
 * `response_format: json_schema` mode caps structured-output at
 * 4K tokens by default — which truncates a full resume parse
 * mid-string and produces "could not parse the response" errors.
 *
 * 12K covers the largest legitimate resume parse (a senior engineer
 * with 8+ roles + projects + publications stays well under that).
 */
const MAX_TOKENS = 12_000;

/**
 * Only OpenAI's strict `response_format: json_schema` requires us to
 * peel every `.default(...)` wrapper off the schema (its validator
 * rejects optional fields). Mistral, Meta, and Amazon all accept
 * loose schemas with default values, AND they faithfully emit
 * "missing" fields that the model skipped - the form layer then
 * fills them in via Zod's `.default()` semantics at parse time.
 *
 * Keeping strict for non-OpenAI models caused mistral to fail
 * schema validation on `projects[*].roles` and `skills[*].level`
 * (the model emitted them as `undefined` for empty cases instead
 * of as `[]` / `""`), which silently broke the resume import flow
 * until we noticed in the dev console.
 *
 * Provider detection uses the Vercel AI Gateway model-id format
 * (`<provider>/<model>`), e.g. `openai/gpt-4o-mini`,
 * `mistral/mistral-nemo`. Substrings match (case-insensitive) so
 * new Anthropic / Cohere / etc. providers get sensible defaults.
 */
function needsStrictSchema(modelIdOrName: string): boolean {
  const id = modelIdOrName.toLowerCase();
  return id.startsWith('openai/') || id.startsWith('azure/');
}

export type ModelWithFallbackResult<T> = {
  data: T;
  modelUsed: string;
  usage: { inputTokens: number; outputTokens: number };
};

export async function generateObjectWithFallbacks<T>({
  models,
  system,
  prompt,
  schema,
  temperature = 0,
  abortSignal
}: {
  models: readonly (LanguageModel | string)[];
  system: string;
  prompt: string;
  schema: ZodType<T>;
  temperature?: number;
  abortSignal?: AbortSignal;
}): Promise<ModelWithFallbackResult<T>> {
  let lastError: unknown = null;

  for (const modelEntry of models) {
    // The caller can pass either a resolved LanguageModel OR a
    // model ID string. The string form is a hint that the caller
    // didn't bother resolving; we resolve here.
    const model = typeof modelEntry === 'string' ? await resolveModel(modelEntry) : modelEntry;
    const modelName = typeof modelEntry === 'string' ? modelEntry : '<resolved>';

    // OpenAI needs schema-level strict JSON for its validator; the
    // rest of the providers can handle the form-friendly loose
    // schema (with `.default('')` and `.default([])`) - and they
    // do, which means the form-layer defaults fill in any fields
    // the model skipped on parse.
    const useStrict = needsStrictSchema(modelName);
    const effectiveSchema = useStrict ? aiStrict(schema) : schema;

    try {
      const result = await generateObject({
        model,
        system,
        prompt,
        schema: effectiveSchema,
        temperature,
        abortSignal,
        // See MAX_TOKENS comment above. The provider may also
        // impose its own cap (OpenAI strict schema = 4K unless
        // overridden here).
        maxOutputTokens: MAX_TOKENS
      });
      console.info(`[ai] served by ${modelName}`);
      return {
        data: result.object,
        modelUsed: modelName,
        usage: {
          inputTokens: result.usage?.inputTokens ?? 0,
          outputTokens: result.usage?.outputTokens ?? 0
        }
      };
    } catch (err) {
      lastError = err;
      const message = err instanceof Error ? err.message : String(err);
      // Schema-validation failures are usually recoverable: the
      // model returned valid JSON, but the AI SDK's internal
      // validator (which goes through Standard Schema) doesn't
      // apply Zod `.default(...)` for missing keys the same way
      // `schema.safeParse()` does. Re-parse the raw text with Zod
      // directly, which DOES fill in defaults, and use that.
      if (isValidationFailure(err)) {
        const recovered = recoverWithDefaults(err, schema, modelName);
        if (recovered) return recovered;
        // Couldn't recover (e.g. JSON parse failure, not a
        // shape-mismatch). Don't waste a fallback call - the
        // next model would just hit the same trap.
        const debug = debugError(err);
        console.warn(
          `[ai] ${modelName} failed schema validation, not falling back: ${message}\n${debug}`
        );
        throw err;
      }
      console.warn(`[ai] ${modelName} failed (${message}), trying fallback`);
      // Continue to the next model in the chain.
    }
  }

  // Exhausted the chain. Surface the last error.
  throw lastError ?? new Error('All models failed without a specific error');
}

/**
 * Did the error come from generateObject's schema-validation retry?
 * The SDK throws a NoObjectGeneratedError when the output fails
 * Zod validation (or, in OpenAI's strict JSON-schema mode, when
 * the response is unparseable / truncated).
 */
function isValidationFailure(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const name = (err as Error & { name?: string }).name;
  return (
    name === 'AI_NoObjectGeneratedError' ||
    name === 'NoObjectGeneratedError' ||
    err.message.includes('No object generated')
  );
}

/**
 * Recover from a shape-mismatch validation failure.
 *
 * Root cause: AI SDK 6's `safeValidateTypes()` walks Standard Schema
 * for the validator. Zod's Standard Schema `validate()` path does
 * NOT apply `.default(...)` for missing keys the same way Zod's
 * `schema.safeParse()` does - so a model that emits JSON without a
 * leaf that has `.default('')` or `.default([])` fails validation
 * even though the form-layer parser would happily fill it in.
 *
 * Fix: pull the raw text off the SDK error, `JSON.parse` it, and
 * run our own `schema.safeParse()` which DOES fire Zod defaults.
 * Returns the recovered result, or `null` if we can't recover
 * (caller will re-throw the original error).
 *
 * Won't help on:
 *  - JSON-parse failures (raw text wasn't valid JSON)
 *  - Real schema-shape mismatches (e.g. wrong types)
 *  - OpenAI strict-mode cap (`max_output_tokens` truncation);
 *    there's nothing to recover from an empty response.
 */
function recoverWithDefaults<T>(
  err: unknown,
  schema: ZodType<T>,
  modelName: string
): ModelWithFallbackResult<T> | null {
  try {
    // The AI SDK 6 attaches the raw text in multiple spots
    // depending on failure mode. Probe each.
    const e = err as { text?: unknown; cause?: { text?: unknown } };
    const rawText =
      (typeof e.text === 'string' && e.text) ||
      (typeof e.cause?.text === 'string' && e.cause.text) ||
      null;
    if (!rawText) return null;

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      // Not valid JSON - nothing to recover from.
      return null;
    }

    const result = schema.safeParse(parsed);
    if (!result.success) {
      // Real schema mismatch (e.g. wrong types), not a missing-
      // default issue. Let the original error bubble up.
      return null;
    }

    console.info(
      `[ai] ${modelName} schema mismatch auto-recovered via Zod defaults`
    );
    return {
      data: result.data,
      modelUsed: modelName,
      usage: { inputTokens: 0, outputTokens: 0 }
    };
  } catch {
    return null;
  }
}

/**
 * Pull the offending raw response text off the SDK error so we
 * can log it without rebuilding the call. The AI SDK 6 attaches
 * the raw text in different places across failure modes; we
 * probe every spot we know about, then dump the full error as
 * JSON if nothing text-shaped surfaces.
 */
function debugError(err: unknown): string {
  const lines: string[] = [];

  function tryRead(value: unknown): string | undefined {
    if (typeof value === 'string' && value.length > 0) return value;
    return undefined;
  }

  // Pull from likely places on the error object.
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>;
    const text = tryRead(e.text);
    if (text) {
      lines.push(`[ai] --- raw response (first 500 chars) ---`);
      lines.push(text.slice(0, 500));
      lines.push(`[ai] --- end raw response ---`);
    }
    const cause = e.cause as Record<string, unknown> | undefined;
    if (cause && typeof cause === 'object') {
      const causeText = tryRead(cause.text);
      if (causeText && causeText !== text) {
        lines.push(`[ai] --- cause.text (first 500 chars) ---`);
        lines.push(causeText.slice(0, 500));
        lines.push(`[ai] --- end cause.text ---`);
      }
      if (cause.message && typeof cause.message === 'string') {
        lines.push(`[ai] cause.message: ${cause.message}`);
      }
      if (cause.name && typeof cause.name === 'string') {
        lines.push(`[ai] cause.name: ${cause.name}`);
      }
    }
    if (e.response && typeof e.response === 'object') {
      const r = e.response as { body?: unknown };
      if (r.body !== undefined) {
        lines.push(`[ai] response.body: ${JSON.stringify(r.body).slice(0, 800)}`);
      }
    }
    if (e.finishReason) {
      lines.push(`[ai] finishReason: ${JSON.stringify(e.finishReason)}`);
    }
    if (e.usage) {
      lines.push(`[ai] usage: ${JSON.stringify(e.usage)}`);
    }
    lines.push(`[ai] full error JSON: ${JSON.stringify(err, Object.getOwnPropertyNames(err as object)).slice(0, 1500)}`);
  }

  return lines.join('\n');
}

// Lazy import of the providers module to avoid a circular dep -
// this file is imported by the parsers, and the parsers already
// import the providers.
async function resolveModel(modelId: string): Promise<LanguageModel> {
  const { getModel } = await import('./providers');
  return getModel(modelId) as LanguageModel;
}
