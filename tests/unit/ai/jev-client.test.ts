/**
 * Tests for the Jev client and the requirement evaluation.
 *
 * The client is tested with a mocked `fetch` — no network, no key, no
 * cost. The live behaviour was verified separately against the gateway
 * (see `scripts/measure-jev-corpus.cjs`).
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import {
  assertZeroDataRetention,
  jevDecide,
  JevError,
  readNoul,
  readScore
} from '@/lib/ai/jev';

const KEY = 'test-key';

function okResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init
  });
}

describe('jevDecide', () => {
  beforeEach(() => {
    process.env.AI_GATEWAY_API_KEY = KEY;
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.AI_GATEWAY_API_KEY;
  });

  it('posts the state and questions to the gateway', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      okResponse({
        answers: { q1: { type: 'noul', noul: 0.9 } },
        usage: { input_tokens: 100, output_tokens: 20 },
        provider_metadata: {
          gateway: {
            cost: '0.0000042',
            routing: { resolvedProvider: 'typesafe-ai' }
          }
        }
      })
    );

    const result = await jevDecide({
      state: 'the shared state',
      questions: { q1: { type: 'noul', instructions: 'is it true?' } }
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://ai-gateway.vercel.sh/typesafe/v1/systemone');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${KEY}`);
    // Pinned to the zero-data-retention provider.
    expect(headers['x-vercel-ai-gateway-order']).toContain('typesafe-ai');

    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.state).toBe('the shared state');
    expect(body.questions.q1.type).toBe('noul');
    // A versioned model id, never the moving alias.
    expect(body.model).toMatch(/^jev-\d+\.\d+\.\d+$/);

    expect(result.answers.q1).toEqual({ type: 'noul', noul: 0.9 });
    expect(result.resolvedProvider).toBe('typesafe-ai');
    expect(result.cost).toBe('0.0000042');
  });

  it('throws a typed error on a non-2xx response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response('nope', { status: 429 })
    );
    await expect(
      jevDecide({
        state: 's',
        questions: { q: { type: 'noul', instructions: 'i' } }
      })
    ).rejects.toThrow(JevError);
  });

  it('throws when the body is not JSON', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response('<html>not json</html>', { status: 200 })
    );
    await expect(
      jevDecide({
        state: 's',
        questions: { q: { type: 'noul', instructions: 'i' } }
      })
    ).rejects.toThrow(/non-JSON/);
  });

  it('throws when the response has no answers', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(okResponse({ model: 'jev' }));
    await expect(
      jevDecide({
        state: 's',
        questions: { q: { type: 'noul', instructions: 'i' } }
      })
    ).rejects.toThrow(/no answers/);
  });

  it('explains itself when the key is missing', async () => {
    delete process.env.AI_GATEWAY_API_KEY;
    await expect(
      jevDecide({
        state: 's',
        questions: { q: { type: 'noul', instructions: 'i' } }
      })
    ).rejects.toThrow(/AI_GATEWAY_API_KEY/);
  });
});

describe('assertZeroDataRetention', () => {
  it('accepts the zero-data-retention provider', () => {
    expect(() =>
      assertZeroDataRetention({ answers: {}, resolvedProvider: 'typesafe-ai' })
    ).not.toThrow();
  });

  it('refuses a response from anywhere else', () => {
    expect(() =>
      assertZeroDataRetention({ answers: {}, resolvedProvider: 'digitalocean' })
    ).toThrow(/zero-data-retention/);
  });
});

describe('reading answers defensively', () => {
  it('reads a noul probability', () => {
    const result = {
      answers: { q: { type: 'noul' as const, noul: 0.77 } }
    };
    expect(readNoul(result, 'q')).toBe(0.77);
  });

  it('reads a score', () => {
    const result = {
      answers: { q: { type: 'score' as const, score: 2.4, confidence: 0.9 } }
    };
    expect(readScore(result, 'q')).toBe(2.4);
  });

  it('returns null for a missing or wrong-typed answer', () => {
    const result = { answers: { q: { type: 'noul' as const, noul: 0.5 } } };
    expect(readNoul(result, 'missing')).toBeNull();
    expect(readScore(result, 'q')).toBeNull();
    expect(readNoul({ answers: {} }, 'q')).toBeNull();
  });
});
