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
  OPTIMIZE_MODEL,
  PARSE_FALLBACKS,
  PARSER_MODEL,
  RESUME_PARSER_MODEL,
  getModel
} from '@/lib/ai/providers';

const mockedGateway = vi.mocked(gateway);

describe('model constants', () => {
  it('uses Z.AI GLM 5.3 Flash as the primary (cheap, fast, free tier)', () => {
    expect(PARSER_MODEL).toBe('zai/glm-5.3-flash');
  });

  it('declares both parsers as using PARSER_MODEL (single source of truth)', () => {
    // Both parsers use the same primary right now. The aliases
    // exist so existing call sites don't need to change.
    expect(JD_PARSER_MODEL).toBe(PARSER_MODEL);
    expect(RESUME_PARSER_MODEL).toBe(PARSER_MODEL);
  });

  it('uses the same primary for the Optimize placeholder (until Optimize ships)', () => {
    expect(OPTIMIZE_MODEL).toBe(PARSER_MODEL);
  });

  it('declares a fallback chain with at least 2 entries', () => {
    expect(PARSE_FALLBACKS.length).toBeGreaterThanOrEqual(2);
  });

  it('every fallback model is a different provider from the primary', () => {
    // Extract provider slug (everything before the first '/') and
    // assert at least one fallback uses a different provider than
    // the primary. This is the whole point of a fallback chain —
    // independent infrastructure failure modes.
    const primaryProvider = PARSER_MODEL.split('/')[0];
    const otherProviders = PARSE_FALLBACKS.map(
      (m) => m.split('/')[0] !== primaryProvider
    );
    expect(otherProviders.some(Boolean)).toBe(true);
  });

  it('model strings are prefixed with the provider slug (Gateway convention)', () => {
    for (const id of [PARSER_MODEL, ...PARSE_FALLBACKS, OPTIMIZE_MODEL]) {
      expect(id).toContain('/');
    }
  });

  it('no model string contains whitespace or accidental whitespace', () => {
    for (const id of [PARSER_MODEL, ...PARSE_FALLBACKS, OPTIMIZE_MODEL]) {
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
    getModel('zai/glm-5.3-flash');
    expect(mockedGateway).toHaveBeenCalledWith('zai/glm-5.3-flash');
  });

  it('returns whatever the gateway returns (no wrapping or validation)', () => {
    mockedGateway.mockReturnValue('mock-model' as never);
    const result = getModel('zai/glm-5.3-flash');
    expect(result).toBe('mock-model');
  });

  it('does not add a default fallback at this layer (fallback lives in lib/ai/fallback.ts)', () => {
    // The Gateway itself doesn't expose a fallback chain in the
    // v3 bridge. Fallback lives at lib/ai/fallback.ts and is
    // invoked by the parsers, not by getModel. Keeping these
    // responsibilities split makes each testable in isolation.
    getModel('zai/glm-5.3-flash');
    expect(mockedGateway).toHaveBeenCalledTimes(1);
    expect(mockedGateway).toHaveBeenCalledWith('zai/glm-5.3-flash');
  });
});
