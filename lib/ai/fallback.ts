import 'server-only';

import { generateObject, type LanguageModel } from 'ai';
import type { ZodType } from 'zod';

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
 *  - Schema validation failures — the model gave us something but
 *    it didn't match the schema. Falling back won't help; the
 *    downstream model will likely make the same mistake.
 *
 * Returns the model name that succeeded in `modelUsed` so callers
 * can log it for cost attribution.
 */
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

    try {
      const result = await generateObject({
        model,
        system,
        prompt,
        schema,
        temperature,
        abortSignal
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
      // Schema-validation failures are the model's problem, not
      // an upstream infra issue. Don't waste a fallback call.
      if (isValidationFailure(err)) {
        console.warn(`[ai] ${modelName} failed schema validation, not falling back: ${message}`);
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
 * Zod validation.
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

// Lazy import of the providers module to avoid a circular dep —
// this file is imported by the parsers, and the parsers already
// import the providers.
async function resolveModel(modelId: string): Promise<LanguageModel> {
  const { getModel } = await import('./providers');
  return getModel(modelId) as LanguageModel;
}
