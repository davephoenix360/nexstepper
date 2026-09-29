import 'server-only';

import { randomUUID } from 'node:crypto';
import { generateObject, generateText, type LanguageModel } from 'ai';
import type { ZodType } from 'zod';

import { aiStrict } from '@/lib/ai/ai-strict-schema';
import { observeModel, type AiObservabilityContext } from '@/lib/ai/providers';

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
 * Policy: ALWAYS try the next model on any failure. We never want
 * a single model's quirk to stump the user flow. The trade-off is
 * worst-case latency when every model fails in the same way, but
 * the AI Gateway free tier is fast (3-8s per call) and the user
 * experience of "we keep trying until something works" beats
 * "we give up at the first sign of trouble". The first model's
 * failure is also the loudest signal in the logs (full debug
 * block), and the
 * success path's `recovery` (`recoverWithDefaults`) still rescues
 * common "missing defaults" shape mismatches without needing to
 * burn the next model.
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
  abortSignal,
  observability
}: {
  models: readonly (LanguageModel | string)[];
  system: string;
  prompt: string;
  schema: ZodType<T>;
  temperature?: number;
  abortSignal?: AbortSignal;
  observability?: AiObservabilityContext;
}): Promise<ModelWithFallbackResult<T>> {
  let lastError: unknown = null;
  const traceContext = {
    ...observability,
    traceId: observability?.traceId ?? randomUUID()
  };

  for (const modelEntry of models) {
    // The caller can pass either a resolved LanguageModel OR a
    // model ID string. The string form is a hint that the caller
    // didn't bother resolving; we resolve here.
    const model =
      typeof modelEntry === 'string'
        ? await resolveModel(modelEntry, traceContext)
        : observeModel(modelEntry, traceContext);
    const modelName = typeof modelEntry === 'string' ? modelEntry : '<resolved>';

    // OpenAI needs schema-level strict JSON for its validator; the
    // rest of the providers can handle the form-friendly loose
    // schema (with `.default('')` and `.default([])`) - and they
    // do, which means the form-layer defaults fill in any fields
    // the model skipped on parse.
    const useStrict = needsStrictSchema(modelName);
    const effectiveSchema = useStrict ? aiStrict(schema) : schema;

    try {
      const result = await runWithRetry({
        modelName,
        signal: abortSignal,
        fn: () =>
          generateObject({
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
          })
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
      // Always try the cheap recovery first - if the model returned
      // valid JSON and the only issue is Zod `.default(...)` not
      // firing for missing keys, we can fix it in-process and
      // avoid the latency of trying the next model. If recovery
      // succeeds, we return immediately.
      if (isValidationFailure(err)) {
        const recovered = recoverWithDefaults(err, schema, modelName);
        if (recovered) return recovered;
      }

      // Log the failure so future-us can see what's happening.
      // Validation failures get the full debug block (raw text +
      // response body); infra failures get a one-liner.
      const debug = isValidationFailure(err) ? debugError(err) : '';
      const debugBlock = debug ? `\n${debug}` : '';
      if (isValidationFailure(err)) {
        console.warn(
          `[ai] ${modelName} failed schema validation, trying fallback: ${message}${debugBlock}`
        );
      } else {
        console.warn(`[ai] ${modelName} failed (${message}), trying fallback`);
      }
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
 * Classify an error as "transient — worth retrying" vs "permanent —
 * fall through to the next model / surface immediately".
 *
 * Conservative on purpose: when we can't confidently classify the
 * error we treat it as permanent. A wrong classification costs the
 * user a few hundred ms (a wasted retry); a too-permissive
 * classifier could mask a real bug behind N silent retries.
 *
 * Transient families:
 *   - Network / DNS / TCP errors (Node.js `fetch` failures)
 *   - `AbortError` from a parent `AbortSignal.timeout()` (we know
 *     these come from our own timeouts, not the SDK cancelling)
 *   - HTTP 429 (rate limit) — the provider told us to back off
 *   - HTTP 5xx (server-side, hopefully transient)
 *
 * NOT transient (caller falls through / surfaces immediately):
 *   - `NoObjectGeneratedError` (validation — different recovery path)
 *   - HTTP 4xx other than 429 (auth, bad request, etc. — won't fix)
 *   - Anything we don't recognize
 */
function isTransientError(err: unknown): boolean {
  if (!err) return false;

  // AbortError from OUR AbortSignal.timeout() — the model probably
  // hung mid-response, retrying is worth a shot.
  if (err instanceof Error && err.name === 'AbortError') return true;

  // HTTP status from the AI SDK's `AI_APICallError`.
  // The SDK exposes `statusCode` directly on the error instance.
  const e = err as { statusCode?: unknown; status?: unknown };
  const status =
    typeof e['statusCode'] === 'number'
      ? (e['statusCode'] as number)
      : typeof e['status'] === 'number'
        ? (e['status'] as number)
        : null;
  if (status !== null) {
    if (status === 429) return true;
    if (status >= 500 && status < 600) return true;
    return false; // 4xx other than 429 — permanent
  }

  // Node.js fetch errors (no status code). The error message is
  // our only signal — match on the well-known substrings.
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (
      msg.includes('fetch failed') ||
      msg.includes('econnreset') ||
      msg.includes('etimedout') ||
      msg.includes('enotfound') ||
      msg.includes('eai_again') ||
      msg.includes('network request failed') ||
      msg.includes('socket hang up')
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Sleep for `ms` milliseconds, throwing early if `signal` aborts.
 * Used by `runWithRetry` so the per-model retries don't extend
 * past a caller's outer timeout (e.g. `parseResumeText`'s 180s
 * global cap).
 */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
      return;
    }
    const id = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(id);
      reject(signal?.reason ?? new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Run `fn` up to `MAX_ATTEMPTS` times, retrying only on TRANSIENT
 * errors (network blips, 429, 5xx, parent-signal abort). Non-
 * transient errors throw immediately so the cross-model fallback
 * chain can take over (or the caller can surface the error).
 *
 * Phase 1f (plan: docs/plans/ai-retry-hardening.md). Without this,
 * a single transient 429 on the primary model (Mistral Nemo)
 * immediately escalates to the next (more expensive / slower)
 * model in the chain — paying the user-visible latency cost of
 * the slower fallback for what's usually a 500ms blip.
 *
 * Backoff schedule: 500ms after attempt 1, 1000ms after attempt 2.
 * Worst-case added latency per model: ~1.5s of sleep, on top of
 * the per-attempt call time. The caller's outer timeout (e.g.
 * `AbortSignal.timeout(180_000)` in `parseResumeText`) still
 * bounds the total; `sleep()` honors the same signal.
 */
const MAX_ATTEMPTS = 3;
const BACKOFF_MS: readonly number[] = [500, 1000] as const;

async function runWithRetry<T>({
  modelName,
  signal,
  fn
}: {
  modelName: string;
  signal?: AbortSignal;
  fn: () => Promise<T>;
}): Promise<T> {
  let lastErr: unknown = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;

      const isLast = attempt === MAX_ATTEMPTS;
      const isTransient = isTransientError(err);

      if (!isTransient || isLast) {
        // Either a permanent error (validation / auth / unknown —
        // let the caller handle), or we've burned our retries.
        // In both cases, give up on this model.
        if (isTransient && isLast) {
          console.warn(
            `[ai] ${modelName} attempt ${attempt}/${MAX_ATTEMPTS} failed (transient: ${describeErr(err)}), giving up`
          );
        }
        throw err;
      }

      const delay = BACKOFF_MS[attempt - 1] ?? 1000;
      console.warn(
        `[ai] ${modelName} attempt ${attempt}/${MAX_ATTEMPTS} failed (transient: ${describeErr(err)}), retrying in ${delay}ms`
      );
      await sleep(delay, signal);
    }
  }

  // Unreachable — the loop always throws or returns — but TS doesn't
  // know that. Surface the last error rather than `undefined`.
  throw lastErr ?? new Error('runWithRetry exited without result');
}

function describeErr(err: unknown): string {
  if (err instanceof Error) {
    const status = (err as { statusCode?: unknown }).statusCode;
    return typeof status === 'number' ? `HTTP ${status}: ${err.message}` : err.message;
  }
  return String(err);
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
    const e = err as {
      text?: unknown;
      cause?: { text?: unknown; value?: unknown };
      response?: { body?: unknown };
    };

    // Try every plausible location for the raw model text.
    let rawText: string | null = null;
    if (typeof e.text === 'string' && e.text.length > 0) {
      rawText = e.text;
    } else if (e.cause && typeof e.cause.text === 'string' && e.cause.text.length > 0) {
      rawText = e.cause.text;
    } else if (e.cause && typeof e.cause.value === 'string') {
      // Some failure modes store the parsed string in cause.value.
      rawText = e.cause.value;
    }

    if (!rawText) {
      console.warn(
        `[ai] ${modelName} recovery: no raw text found on error ` +
          `(keys=${Object.keys(err as object).join(',')})`
      );
      return null;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText);
    } catch (jerr) {
      console.warn(
        `[ai] ${modelName} recovery: JSON.parse failed on first 200 chars: ${rawText.slice(0, 200)}`
      );
      return null;
    }

    // PRE-PROCESS: Some models (notably Mistral) emit `"field": null`
    // where we'd rather have a default-filled missing key. Zod's
    // `.default(value)` does NOT fire for explicit `null` - only for
    // missing keys. Walk the parsed object once converting every
    // `null` to `undefined` so the schema's defaults kick in.
    //
    // Safe because:
    //   - JSON.parse never produces `undefined` on its own; converting
    //     `null` -> `undefined` is a one-way data-loss for the
    //     `null` sentinel only (which we don't use in our schema).
    //   - If a caller explicitly wants `null` for a field they should
    //     use `.nullable()`, but our resume + JD schemas use
    //     `.default(...)` for fields the model might leave blank.
    const normalized = nullsToUndefined(parsed);
    const result = schema.safeParse(normalized);
    if (!result.success) {
      console.warn(
        `[ai] ${modelName} recovery: Zod safeParse also rejected (${result.error.issues.length} issues). First: ${result.error.issues[0]?.message ?? '?'} at ${result.error.issues[0]?.path?.join('.') ?? '?'}`
      );
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
  } catch (recoverErr) {
    console.warn(
      `[ai] ${modelName} recovery: unexpected exception: ${recoverErr instanceof Error ? recoverErr.message : String(recoverErr)}`
    );
    return null;
  }
}

/**
 * Recursively convert every `null` value to `undefined` in a JSON-like
 * value. Returns a NEW object/array; never mutates the input.
 *
 * Why: Mistral emits `"description": null` for empty fields; OpenAI
 * (in strict json_schema mode) emits the field as missing. Zod's
 * `.default('...')` fires only for missing keys, not for explicit
 * `null`. Normalizing lets the form-friendly defaults win either way.
 */
function nullsToUndefined(value: unknown): unknown {
  if (value === null) return undefined;
  if (Array.isArray(value)) {
    return value.map(nullsToUndefined);
  }
  if (typeof value === 'object' && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const converted = nullsToUndefined(v);
      // Drop undefined-keyed entries from objects so Zod sees them
      // as missing rather than as `field: undefined`. (Optional but
      // makes the parse unambiguously exercise default-filling.)
      if (converted !== undefined) {
        out[k] = converted;
      } else {
        // Intentionally skip the key entirely so it's truly missing.
        // Don't add it.
      }
    }
    return out;
  }
  return value;
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
async function resolveModel(
  modelId: string,
  observability: AiObservabilityContext
): Promise<LanguageModel> {
  const { getModel } = await import('./providers');
  return getModel(modelId, observability) as LanguageModel;
}

/**
 * Try a list of models in order for a plain-text generation, returning
 * the first successful response. Parallel to `generateObjectWithFallbacks`
 * but for cases where the output is a string (e.g. Markdown
 * formatting — see `lib/jd-parser/format-jd-as-markdown.ts`).
 *
 * Same policy as the object variant: ALWAYS try the next model on any
 * failure (rate limit, network, validation, anything else). No silent
 * fallback to a default string — we'd rather throw and let the caller
 * decide to surface a degraded UX than hand the user back a hardcoded
 * "no AI available" message that pretends to be AI output.
 */
export type TextWithFallbackResult = {
  text: string;
  modelUsed: string;
  usage: { inputTokens: number; outputTokens: number };
};

export async function generateTextWithFallbacks({
  models,
  system,
  prompt,
  temperature = 0,
  abortSignal,
  maxOutputTokens,
  observability
}: {
  models: readonly (LanguageModel | string)[];
  system: string;
  prompt: string;
  temperature?: number;
  abortSignal?: AbortSignal;
  /** Per-call output cap. Defaults to 4K — text-formatting jobs are small. */
  maxOutputTokens?: number;
  observability?: AiObservabilityContext;
}): Promise<TextWithFallbackResult> {
  let lastError: unknown = null;
  const traceContext = {
    ...observability,
    traceId: observability?.traceId ?? randomUUID()
  };

  for (const modelEntry of models) {
    const model =
      typeof modelEntry === 'string'
        ? await resolveModel(modelEntry, traceContext)
        : observeModel(modelEntry, traceContext);
    const modelName =
      typeof modelEntry === 'string' ? modelEntry : '<resolved>';

    try {
      const result = await runWithRetry({
        modelName,
        signal: abortSignal,
        fn: () =>
          generateText({
            model,
            system,
            prompt,
            temperature,
            abortSignal,
            maxOutputTokens: maxOutputTokens ?? 4_000
          })
      });
      console.info(`[ai] served by ${modelName}`);
      return {
        text: result.text,
        modelUsed: modelName,
        usage: {
          inputTokens: result.usage?.inputTokens ?? 0,
          outputTokens: result.usage?.outputTokens ?? 0
        }
      };
    } catch (err) {
      lastError = err;
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[ai] ${modelName} failed (${message}), trying fallback`);
      // Continue to the next model in the chain.
    }
  }

  // Exhausted the chain. Surface the last error.
  throw lastError ?? new Error('All models failed without a specific error');
}
