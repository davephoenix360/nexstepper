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
  RESUME_PARSER_MODEL,
  getModel
} from '@/lib/ai/providers';

const mockedGateway = vi.mocked(gateway);

describe('model constants', () => {
  it('uses Gemini 2.5 Flash for the JD parser (free-tier on Vercel AI Gateway)', () => {
    // Pinning to the free-tier model so dev works without credits.
    // Swap to Sonnet when AI Gateway credits are added.
    expect(JD_PARSER_MODEL).toBe('google/gemini-2.5-flash');
  });

  it('uses Gemini 2.5 Flash for the resume parser (free-tier on Vercel AI Gateway)', () => {
    expect(RESUME_PARSER_MODEL).toBe('google/gemini-2.5-flash');
  });

  it('uses Gemini 2.5 Flash for the Optimize tool placeholder (free-tier until credits)', () => {
    // Will swap to Haiku 4.5 + Sonnet fallback when Optimize ships.
    expect(OPTIMIZE_MODEL).toBe('google/gemini-2.5-flash');
  });

  it('model strings are prefixed with the provider slug (Gateway convention)', () => {
    for (const id of [JD_PARSER_MODEL, RESUME_PARSER_MODEL, OPTIMIZE_MODEL]) {
      expect(id).toContain('/');
    }
  });

  it('all three model strings currently point at the same free-tier model', () => {
    // During dev, we use the free-tier model for everything. When
    // the user adds credits, the parser constants can diverge from
    // OPTIMIZE_MODEL.
    expect(JD_PARSER_MODEL).toBe(RESUME_PARSER_MODEL);
    expect(RESUME_PARSER_MODEL).toBe(OPTIMIZE_MODEL);
  });

  it('no model string contains whitespace or accidental whitespace', () => {
    for (const id of [JD_PARSER_MODEL, RESUME_PARSER_MODEL, OPTIMIZE_MODEL]) {
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
    getModel('anthropic/claude-sonnet-4.5');
    expect(mockedGateway).toHaveBeenCalledWith('anthropic/claude-sonnet-4.5');
  });

  it('returns whatever the gateway returns (no wrapping or validation)', () => {
    mockedGateway.mockReturnValue('mock-model' as never);
    const result = getModel('anthropic/claude-sonnet-4.5');
    expect(result).toBe('mock-model');
  });

  it('does not add a default fallback at this layer (callers choose models explicitly)', () => {
    // The gateway itself adds cross-provider failover internally;
    // getModel does NOT add an in-code fallback chain. That keeps
    // the call site simple and lets the Vercel AI Gateway handle
    // routing decisions in one place.
    getModel('anthropic/claude-haiku-4.5');
    expect(mockedGateway).toHaveBeenCalledTimes(1);
    expect(mockedGateway).toHaveBeenCalledWith('anthropic/claude-haiku-4.5');
  });
});
