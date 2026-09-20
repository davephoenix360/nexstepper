import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock the gateway BEFORE the providers module imports it, so the
// mocked `gateway()` is what `getModel()` calls. The mock is
// per-test (vi.mock is hoisted).
vi.mock('@ai-sdk/gateway', () => ({
  gateway: vi.fn(() => 'mock-model')
}));

import { gateway } from '@ai-sdk/gateway';
import {
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
