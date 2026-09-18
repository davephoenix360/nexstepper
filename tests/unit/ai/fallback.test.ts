import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock BOTH ai and the providers module BEFORE importing fallback.
// The mock for ai provides generateObject; the mock for the providers
// module provides getModel (used when models are passed as strings).
vi.mock('ai', () => ({
  generateObject: vi.fn()
}));
vi.mock('@/lib/ai/providers', () => ({
  getModel: vi.fn(() => 'mock-resolved-model')
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

  it('does NOT fall back on schema validation failure (model problem, not infra)', async () => {
    // generateObject's schema-validation retry throws NoObjectGeneratedError
    // when the model output fails Zod parsing. Falling back wastes time —
    // the next model will likely make the same mistake.
    const validationError = new Error('No object generated: ...');
    validationError.name = 'AI_NoObjectGeneratedError';
    mockedGenerateObject.mockRejectedValueOnce(validationError);

    await expect(
      generateObjectWithFallbacks({
        models: ['primary', 'fallback'],
        system: 'sys',
        prompt: 'prompt',
        schema: {} as never
      })
    ).rejects.toThrow('No object generated');

    // Only one call — we didn't try the fallback
    expect(mockedGenerateObject).toHaveBeenCalledTimes(1);
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
});
