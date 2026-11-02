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
  FREE_CHAT_FALLBACKS,
  FREE_CHAT_GATEWAY_PROVIDER_OPTIONS,
  FREE_CHAT_MODEL,
  JD_PARSER_MODEL,
  PARSE_FALLBACKS,
  PARSER_MODEL,
  RESUME_PARSER_MODEL,
  getModel,
  resolveChatModelPlan
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
    // A chain of aliases on one backend is one outage. The 2026-11-01
    // reorder kept every entry on its own provider.
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

/**
 * Regressions pinned by the 2026-11-01 real-agent-loop probe.
 *
 * The 2026-10-21 verification used a FORCED `tool_choice` against a simple
 * tool. That proves a model can emit a tool call; it does not prove the
 * model CHOOSES to call one, which is the job for the chat agent — it is
 * never forced, it faces the large nested `editResume` schema, and it runs
 * in a multi-step loop.
 *
 * `tests/unit/ai/chat-tool-call-probe.test.ts` re-measured this properly
 * (unforced call, real schema, real system prompt, 5 attempts per model).
 * These pins lock in what it found.
 */
describe('live-verified chat tool-call behaviour (2026-11-01)', () => {
  it('the chat chain is ordered by measured reliability, not by price', () => {
    // Measured edit rate on the real agent loop (unforced call, real
    // inputSchema, real system prompt, 5 attempts each, 2026-11-01):
    //   nova-micro 5/5 @ 2.7s  ·  glm-5.3-flash 5/5 @ 23.0s
    //   beam-free 3/5 @ 8.2s   ·  nemotron 3/5 @ 6.4s
    // A fallback chain is ordered by what happens when it engages, which
    // is the worst moment to discover the model cannot do the job. The
    // previous order led with the $0 model (3/5) over the fastest 5/5.
    expect([...CHAT_FALLBACKS]).toEqual([
      'amazon/nova-micro',
      'zai/glm-5.3-flash',
      'reflection/beam-free',
      'nvidia/nemotron-3.5-lightning-free'
    ]);
  });

  it('does not lead the chain with a model that edits less often', () => {
    // `reflection/beam-free` was FIRST on the strength of a "clean tool
    // calls" claim that was verified with a forced tool_choice against a
    // simple tool. Under the real agent loop it edits 3 of 5.
    expect(CHAT_FALLBACKS[0]).not.toBe('reflection/beam-free');
    expect(CHAT_FALLBACKS).toContain('reflection/beam-free');
  });

  it('no chat model is a known narrator, payload leaker, or non-LM', () => {
    // A narrator replies "Done, I changed it" without calling the tool —
    // a lie the user acts on. A leaker puts its reasoning where the
    // resume text goes — the merge writes it onto the resume.
    //
    // The 2026-11-01 probe found ZERO of either across every chat
    // candidate, which is the property worth protecting. These models
    // fail differently (slow, unreachable, or a video model), and each
    // one has bitten this chain before.
    for (const bad of [
      'mistral/mistral-nemo', // narrates the call as prose
      'inclusionai/ling-3.1-flash', // leaks reasoning into tool args
      'inclusionai/ling-3.1-flash-1019', // same family — 52-65s per turn
      'meta/llama-3.1-8b', // empty {} for a schema, 400 on tool calls
      'minimax/minimax-m3.1-flash', // empty string, ignores tool_choice
      'minimax/minimax-h3', // NOT a language model — a VIDEO model
      'stealth/glyph-cluster', // 403s without purchased credits
      'reflection/beam' // same model as beam-free, not pinned to $0
    ]) {
      expect(CHAT_FALLBACKS).not.toContain(bad);
      expect(CHAT_MODEL).not.toBe(bad);
    }
  });

  it('the chain still contains a $0 model so credit exhaustion degrades instead of failing', () => {
    // When Gateway credits ran out on 2026-10-21, every paid model 403'd.
    // A $0 entry in the chain is what keeps the chat usable through that.
    const zeroCost = ['reflection/beam-free', 'nvidia/nemotron-3.5-lightning-free'];
    expect(CHAT_FALLBACKS.some((m) => zeroCost.includes(m))).toBe(true);
  });
});

describe('the free-tier chat chain (2026-11-01)', () => {
  it('resolves the full chain for Pro and the $0 chain for Free', () => {
    const pro = resolveChatModelPlan('pro');
    expect(pro.model).toBe(CHAT_MODEL);
    expect([...pro.fallbacks]).toEqual([...CHAT_FALLBACKS]);
    expect(pro.providerOptions.gateway.order).toEqual([CHAT_MODEL, ...CHAT_FALLBACKS]);

    const free = resolveChatModelPlan('free');
    expect(free.model).toBe(FREE_CHAT_MODEL);
    expect([...free.fallbacks]).toEqual([...FREE_CHAT_FALLBACKS]);
    expect(free.providerOptions.gateway.order).toEqual([
      FREE_CHAT_MODEL,
      ...FREE_CHAT_FALLBACKS
    ]);
  });

  it('every model on the free chain is a $0 model', () => {
    // "Free" has to mean $0 on EVERY endpoint the gateway can route to.
    // `reflection/beam` is the same model but NOT pinned to the free
    // endpoint — three of its four backends are priced at $0.25–$0.40 in
    // / $1.00–$1.20 out per 1M, which at the free plan's ceiling is
    // roughly $1.70–$4 per active free user per month.
    expect([FREE_CHAT_MODEL, ...FREE_CHAT_FALLBACKS].sort()).toEqual([
      'nvidia/nemotron-3.5-lightning-free',
      'reflection/beam-free'
    ]);
  });

  it('no priced model is reachable from the free chain', () => {
    // These three edit in 5 of 5 attempts on the real agent loop. They
    // are exactly what the free tier is NOT allowed to reach.
    for (const priced of [
      'anthropic/claude-haiku-5.5',
      'amazon/nova-micro',
      'zai/glm-5.3-flash'
    ]) {
      expect(FREE_CHAT_MODEL).not.toBe(priced);
      expect(FREE_CHAT_FALLBACKS).not.toContain(priced);
      expect(FREE_CHAT_GATEWAY_PROVIDER_OPTIONS.gateway.order).not.toContain(priced);
    }
  });

  it('the free chain spans two providers so one outage cannot take it down', () => {
    const providers = new Set(
      [FREE_CHAT_MODEL, ...FREE_CHAT_FALLBACKS].map((m) => m.split('/')[0])
    );
    expect(providers.size).toBe(2);
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
