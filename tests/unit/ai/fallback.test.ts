import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock BOTH ai and the providers module BEFORE importing fallback.
// The mock for ai provides generateObject; the mock for the providers
// module provides getModel (used when models are passed as strings).
vi.mock('ai', () => ({
  generateObject: vi.fn()
}));
vi.mock('@/lib/ai/providers', () => ({
  getModel: vi.fn(() => 'mock-resolved-model'),
  // observeModel is the PostHog-AI tracing wrapper. In tests we pass
  // models through unchanged — the tracing side-effect is exercised
  // in integration tests, not unit tests, and we don't want a unit
  // test to silently fail when @posthog/ai is missing in CI.
  observeModel: vi.fn((model) => model)
}));

import { generateObject } from 'ai';
import { generateObjectWithFallbacks } from '@/lib/ai/fallback';

const mockedGenerateObject = vi.mocked(generateObject);

describe('generateObjectWithFallbacks', () => {
  beforeEach(() => {
    mockedGenerateObject.mockReset();
  });

  it('returns the first model success and stops', async () => {
    mockedGenerateObject
      .mockResolvedValueOnce({
        object: { ok: 1 },
        usage: { inputTokens: 100, outputTokens: 50 }
      } as never)
      .mockResolvedValueOnce({ object: { ok: 2 } } as never);

    const result = await generateObjectWithFallbacks({
      models: ['primary', 'fallback'],
      system: 'sys',
      prompt: 'prompt',
      schema: {} as never, // schema is opaque to us
      temperature: 0
    });

    expect(result.data).toEqual({ ok: 1 });
    expect(result.modelUsed).toBe('primary');
    expect(result.usage).toEqual({ inputTokens: 100, outputTokens: 50 });
    expect(mockedGenerateObject).toHaveBeenCalledTimes(1);
  });

  it('falls back to the next model on upstream failure', async () => {
    mockedGenerateObject
      .mockRejectedValueOnce(new Error('upstream timeout'))
      .mockResolvedValueOnce({ object: { ok: 'second' } } as never);

    const result = await generateObjectWithFallbacks({
      models: ['primary', 'fallback'],
      system: 'sys',
      prompt: 'prompt',
      schema: {} as never
    });

    expect(result.data).toEqual({ ok: 'second' });
    expect(result.modelUsed).toBe('fallback');
    expect(mockedGenerateObject).toHaveBeenCalledTimes(2);
  });

  it('walks the full chain when all models fail', async () => {
    mockedGenerateObject
      .mockRejectedValueOnce(new Error('first failed'))
      .mockRejectedValueOnce(new Error('second failed'))
      .mockResolvedValueOnce({
        object: { ok: 'third' },
        usage: { inputTokens: 200, outputTokens: 75 }
      } as never);

    const result = await generateObjectWithFallbacks({
      models: ['m1', 'm2', 'm3'],
      system: 'sys',
      prompt: 'prompt',
      schema: {} as never
    });

    expect(result.modelUsed).toBe('m3');
    expect(result.usage).toEqual({ inputTokens: 200, outputTokens: 75 });
    expect(mockedGenerateObject).toHaveBeenCalledTimes(3);
  });

  it('throws the last error when the entire chain fails', async () => {
    mockedGenerateObject
      .mockRejectedValueOnce(new Error('first'))
      .mockRejectedValueOnce(new Error('SECOND_FAILED'));

    await expect(
      generateObjectWithFallbacks({
        models: ['m1', 'm2'],
        system: 'sys',
        prompt: 'prompt',
        schema: {} as never
      })
    ).rejects.toThrow('SECOND_FAILED');
  });

  it('falls back to the next model when validation fails (no stumping)', async () => {
    // Policy: validation failures also walk the chain. We never want
    // a single model's output quirk to stump the user flow. The
    // `recoverWithDefaults` short-circuit runs first (and would
    // rescue the common "missing optional field" case for free),
    // but if recovery fails - and especially if it's a real JSON
    // parse error - we still try the next model.
    const validationError = new Error('No object generated: ...');
    validationError.name = 'AI_NoObjectGeneratedError';
    mockedGenerateObject
      .mockRejectedValueOnce(validationError) // primary validation failure
      .mockResolvedValueOnce({
        // fallback succeeds
        object: { ok: true },
        usage: { inputTokens: 10, outputTokens: 5 }
      } as never);

    const result = await generateObjectWithFallbacks({
      models: ['primary', 'fallback'],
      system: 'sys',
      prompt: 'prompt',
      schema: {} as never
    });

    expect(result.modelUsed).toBe('fallback');
    expect(mockedGenerateObject).toHaveBeenCalledTimes(2);
  });

  it('accepts pre-resolved LanguageModel instances (not just strings)', async () => {
    const resolvedModel = { resolved: true };
    mockedGenerateObject.mockResolvedValueOnce({
      object: { ok: true },
      usage: { inputTokens: 10, outputTokens: 5 }
    } as never);

    const result = await generateObjectWithFallbacks({
      models: [resolvedModel as never], // cast: the real type is LanguageModel
      system: 'sys',
      prompt: 'prompt',
      schema: {} as never
    });

    expect(result.data).toEqual({ ok: true });
    // generateObject is called with a single args object containing
    // the model — no second positional argument.
    expect(mockedGenerateObject).toHaveBeenCalledWith(
      expect.objectContaining({ model: resolvedModel })
    );
  });

  it('passes through temperature, abortSignal, system, prompt to each attempt', async () => {
    mockedGenerateObject
      .mockRejectedValueOnce(new Error('first'))
      .mockResolvedValueOnce({ object: { ok: true } } as never);

    const abortController = new AbortController();

    await generateObjectWithFallbacks({
      models: ['m1', 'm2'],
      system: 'the-system',
      prompt: 'the-prompt',
      schema: {} as never,
      temperature: 0.42,
      abortSignal: abortController.signal
    });

    expect(mockedGenerateObject).toHaveBeenCalledTimes(2);

    // Both attempts should have the same parameters
    for (const call of mockedGenerateObject.mock.calls) {
      const params = call[0] as {
        model: unknown;
        system: string;
        prompt: string;
        temperature: number;
        abortSignal: AbortSignal;
      };
      expect(params.system).toBe('the-system');
      expect(params.prompt).toBe('the-prompt');
      expect(params.temperature).toBe(0.42);
      expect(params.abortSignal).toBe(abortController.signal);
    }
  });

  /*
   * Phase 1f — per-model exponential backoff.
   *
   * The cross-model fallback chain (`generateObjectWithFallbacks`)
   * was already solid for permanent failures ("this model is
   * broken"). What's missing — and what the retry layer adds — is
   * the cheap recovery for TRANSIENT failures ("this model was
   * momentarily unavailable"). A single 429 or `fetch failed` on
   * the primary shouldn't escalate to the slower / more expensive
   * fallback model — that's a UX regression for what's usually a
   * 500ms blip.
   *
   * Plan: docs/plans/ai-retry-hardening.md
   */
  describe('per-model exponential backoff (Phase 1f)', () => {
    /**
     * Build an AI-SDK-shaped error with a `statusCode` so the
     * classifier picks it up. The real SDK attaches `statusCode`
     * directly to AI_APICallError instances.
     */
    function sdkError(message: string, statusCode: number): Error {
      const e = new Error(message);
      (e as { statusCode?: number }).statusCode = statusCode;
      return e;
    }

    it('retries the SAME model on a transient 429 and returns the success', async () => {
      mockedGenerateObject
        .mockRejectedValueOnce(sdkError('rate limited', 429))
        .mockResolvedValueOnce({ object: { ok: 'retried' } } as never);

      const result = await generateObjectWithFallbacks({
        models: ['primary', 'fallback'],
        system: 's',
        prompt: 'p',
        schema: {} as never
      });

      expect(result.data).toEqual({ ok: 'retried' });
      expect(result.modelUsed).toBe('primary');
      // Same model attempted twice, never fell through.
      expect(mockedGenerateObject).toHaveBeenCalledTimes(2);
    });

    it('retries on `fetch failed` (network error) then falls through to the next model', async () => {
      mockedGenerateObject
        .mockRejectedValueOnce(new Error('fetch failed')) // primary attempt 1
        .mockRejectedValueOnce(sdkError('still failing', 503)) // primary attempt 2
        .mockRejectedValueOnce(sdkError('one more 429', 429)) // primary attempt 3
        .mockResolvedValueOnce({ object: { ok: 'second-model' } } as never);

      const result = await generateObjectWithFallbacks({
        models: ['primary', 'fallback'],
        system: 's',
        prompt: 'p',
        schema: {} as never
      });

      // Primary exhausted all 3 attempts (transient each time),
      // then immediately fell through to the fallback.
      expect(result.modelUsed).toBe('fallback');
      expect(mockedGenerateObject).toHaveBeenCalledTimes(4);
    });

    it('does NOT retry on a permanent error (4xx other than 429)', async () => {
      mockedGenerateObject
        .mockRejectedValueOnce(sdkError('bad request', 400))
        .mockResolvedValueOnce({ object: { ok: 'fallback' } } as never);

      const result = await generateObjectWithFallbacks({
        models: ['primary', 'fallback'],
        system: 's',
        prompt: 'p',
        schema: {} as never
      });

      // Primary tried once (no retry on 400), fallback once.
      expect(result.modelUsed).toBe('fallback');
      expect(mockedGenerateObject).toHaveBeenCalledTimes(2);
    });

    it('does NOT retry on a validation failure — the existing recovery path handles it', async () => {
      const validationError = new Error('No object generated');
      validationError.name = 'AI_NoObjectGeneratedError';
      mockedGenerateObject
        .mockRejectedValueOnce(validationError)
        .mockResolvedValueOnce({ object: { ok: 'fallback' } } as never);

      const result = await generateObjectWithFallbacks({
        models: ['primary', 'fallback'],
        system: 's',
        prompt: 'p',
        schema: {} as never
      });

      expect(result.modelUsed).toBe('fallback');
      // One primary call (no retry) + one fallback call.
      expect(mockedGenerateObject).toHaveBeenCalledTimes(2);
    });

    it('honors an outer abortSignal during the backoff sleep', async () => {
      // Mock the primary to fail with a transient error so the
      // retry path is taken. The retry sleeps for 500ms; we abort
      // during that sleep and expect the action to surface the
      // abort error immediately rather than burning the full
      // 500ms.
      const controller = new AbortController();
      mockedGenerateObject.mockImplementation(
        () =>
          new Promise((_resolve, reject) => {
            controller.signal.addEventListener('abort', () =>
              reject(controller.signal.reason)
            );
            // Don't resolve on its own — the abort is the only path
            // out. This is fine because the retry layer's sleep()
            // is what we're testing.
          })
      );

      const promise = generateObjectWithFallbacks({
        models: ['primary'],
        system: 's',
        prompt: 'p',
        schema: {} as never,
        abortSignal: controller.signal
      });

      // Give the first attempt a tick to register, then abort
      // during the backoff sleep.
      await new Promise((r) => setTimeout(r, 10));
      controller.abort(new Error('outer timeout'));

      await expect(promise).rejects.toThrow(/outer timeout|aborted/i);
    });
  });
});
