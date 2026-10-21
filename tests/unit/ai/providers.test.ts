import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock the gateway BEFORE the providers module imports it, so the
// mocked `gateway()` is what `getModel()` calls. The mock is
// per-test (vi.mock is hoisted).
vi.mock('@ai-sdk/gateway', () => ({
  gateway: vi.fn(() => 'mock-model')
}));

import { gateway } from '@ai-sdk/gateway';
import {
  CHAT_FALLBACKS,
  CHAT_GATEWAY_PROVIDER_OPTIONS,
  CHAT_MODEL,
  JD_PARSER_MODEL,
  PARSE_FALLBACKS,
  PARSER_MODEL,
  RESUME_PARSER_MODEL,
  getModel
} from '@/lib/ai/providers';

const mockedGateway = vi.mocked(gateway);

describe('model constants', () => {
  it('uses mistral/mistral-nemo as primary (handles large structured JSON without the gateway output cap that hit openai/gpt-4o-mini on 2026-09-18)', () => {
    // Switched from openai/gpt-4o-mini on 2026-09-18 after the
    // parser hit an unmovable `max_output_tokens` cap during
    // strict `response_format: json_schema` calls. Mistral's
    // structured-output path doesn't have that trap. ~$0.02/$0.03
    // per M tokens - cheaper than OpenAI.
    expect(PARSER_MODEL).toBe('mistral/mistral-nemo');
  });

  it('declares both parsers as using PARSER_MODEL (single source of truth)', () => {
    expect(JD_PARSER_MODEL).toBe(PARSER_MODEL);
    expect(RESUME_PARSER_MODEL).toBe(PARSER_MODEL);
  });

  it('declares a fallback chain with at least 3 entries', () => {
    expect(PARSE_FALLBACKS.length).toBeGreaterThanOrEqual(3);
  });

  it('all 4 entries (primary + 3 fallbacks) are from DIFFERENT providers', () => {
    // The whole point of the fallback chain is cross-infrastructure
    // resilience. If we ever regress to two entries from the same
    // provider, this catches it.
    const providers = new Set([
      PARSER_MODEL.split('/')[0],
      ...PARSE_FALLBACKS.map((m) => m.split('/')[0])
    ]);
    expect(providers.size).toBe(PARSE_FALLBACKS.length + 1);
  });

  it('every fallback is from a different provider than the primary', () => {
    const primaryProvider = PARSER_MODEL.split('/')[0];
    for (const m of PARSE_FALLBACKS) {
      expect(m.split('/')[0]).not.toBe(primaryProvider);
    }
  });

  it('model strings are prefixed with the provider slug (Gateway convention)', () => {
    for (const id of [PARSER_MODEL, ...PARSE_FALLBACKS]) {
      expect(id).toContain('/');
    }
  });

  it('no model string contains whitespace or accidental whitespace', () => {
    for (const id of [PARSER_MODEL, ...PARSE_FALLBACKS]) {
      expect(id.trim()).toBe(id);
      expect(id).not.toMatch(/\s/);
    }
  });
});

/**
 * Regressions pinned by live calls on 2026-10-21.
 *
 * These are not "the model we like" assertions — each one encodes a
 * specific failure we actually reproduced against the Gateway, so that
 * a future model swap (or a future pricing change that tempts one)
 * cannot silently reintroduce it. See the standing rule in the
 * `lib/ai/providers.ts` header: catalog metadata is not evidence, and
 * every model id below was verified by a real request.
 */
describe('live-verified model properties (2026-10-21)', () => {
  it('CHAT_MODEL is not inclusionai/ling-3.1-flash', () => {
    // It cost $0.30/$0.90 per 1M (not $0/$0 as its own comments
    // claimed) AND leaked reasoning into tool arguments:
    //   {"bulletId":"b1","text":"The user is asking me to reply with "}
    // executeTool would have written that narration onto a resume.
    expect(CHAT_MODEL).not.toBe('inclusionai/ling-3.1-flash');
  });

  it('CHAT_MODEL and every chat fallback emit tool calls, not prose', () => {
    // mistral/mistral-nemo advertised `tool-use` but returned an EMPTY
    // tool_calls array and narrated the call as text on 2 of 3 live
    // calls. In the chat loop that reads as "nothing to say" rather
    // than "the tool call failed", which is silent data loss.
    const chatChain = [CHAT_MODEL, ...CHAT_FALLBACKS];
    expect(chatChain).not.toContain('mistral/mistral-nemo');
  });

  it('no model is used in both chains for the same job twice', () => {
    // Cheap models are legitimately shared across chains (that is the
    // point of a fallback), but the PARSER must never be a chat model —
    // parsers need strict schemas, chat needs tool calls.
    expect(PARSER_MODEL).not.toBe(CHAT_MODEL);
  });

  it('every PARSE_FALLBACKS entry is not known-broken at structured output', () => {
    // meta/llama-3.1-8b returned `{}` for a `{score,label}` schema and
    // `400 Bad Request` on tool calls. A parser fallback that cannot
    // emit valid JSON converts a clean 403 into a confusing Zod error.
    // minimax/minimax-m3.1-flash returned an empty string for the same
    // schema and ignored a forced tool_choice.
    for (const broken of [
      'meta/llama-3.1-8b',
      'minimax/minimax-m3.1-flash',
      'inclusionai/ling-3.0-flash-fin'
    ]) {
      expect(PARSE_FALLBACKS).not.toContain(broken);
      expect(CHAT_FALLBACKS).not.toContain(broken);
    }
  });

  it('chat chain entries are all from different providers', () => {
    const providers = new Set([...CHAT_FALLBACKS].map((m) => m.split('/')[0]));
    expect(providers.size).toBe(CHAT_FALLBACKS.length);
  });

  it('every chat fallback is a different provider than the chat primary', () => {
    const primaryProvider = CHAT_MODEL.split('/')[0];
    for (const m of CHAT_FALLBACKS) {
      expect(m.split('/')[0]).not.toBe(primaryProvider);
    }
  });

  it('chat chain contains at least one $0 model so a credit exhaustion degrades instead of failing', () => {
    // When Gateway credits ran out on 2026-10-21, everything paid 403'd
    // with "Free tier users do not have access to this model". A $0
    // entry in the chain is what keeps Pro usable through that.
    const zeroCost = ['reflection/beam-free', 'nvidia/nemotron-3.5-lightning-free'];
    expect(CHAT_FALLBACKS.some((m) => zeroCost.includes(m))).toBe(true);
  });

  it('gateway order is [primary, ...fallbacks] with nothing dropped or duplicated', () => {
    const order = CHAT_GATEWAY_PROVIDER_OPTIONS.gateway.order;
    expect(order[0]).toBe(CHAT_MODEL);
    expect(order.slice(1)).toEqual([...CHAT_FALLBACKS]);
    expect(new Set(order).size).toBe(order.length);
  });
});

describe('getModel', () => {
  beforeEach(() => {
    mockedGateway.mockClear();
  });

  it('passes the model id straight through to the gateway', () => {
    getModel('openai/gpt-4o-mini');
    expect(mockedGateway).toHaveBeenCalledWith('openai/gpt-4o-mini');
  });

  it('returns whatever the gateway returns (no wrapping or validation)', () => {
    mockedGateway.mockReturnValue('mock-model' as never);
    const result = getModel('openai/gpt-4o-mini');
    expect(result).toBe('mock-model');
  });

  it('does not add a default fallback at this layer (fallback lives in lib/ai/fallback.ts)', () => {
    getModel('openai/gpt-4o-mini');
    expect(mockedGateway).toHaveBeenCalledTimes(1);
    expect(mockedGateway).toHaveBeenCalledWith('openai/gpt-4o-mini');
  });
});
