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
  it('uses Anthropic Sonnet for the JD parser (quality-critical structured extraction)', () => {
    expect(JD_PARSER_MODEL).toMatch(/^anthropic\/claude-sonnet-/);
  });

  it('uses Anthropic Sonnet for the resume parser (quality-critical structured extraction)', () => {
    expect(RESUME_PARSER_MODEL).toMatch(/^anthropic\/claude-sonnet-/);
  });

  it('uses Haiku 4.5 for the Optimize tool (3-5x cheaper, same quality for rewrites)', () => {
    // This constant is a placeholder; it ships with the constant
    // pinned to Haiku 4.5 so the Optimize action can `import
    // { OPTIMIZE_MODEL }` from day one without a code change.
    expect(OPTIMIZE_MODEL).toMatch(/^anthropic\/claude-haiku-/);
  });

  it('model strings are prefixed with the provider slug (Gateway convention)', () => {
    for (const id of [JD_PARSER_MODEL, RESUME_PARSER_MODEL, OPTIMIZE_MODEL]) {
      expect(id).toContain('/');
      // Provider slugs we currently use.
      expect(id.startsWith('anthropic/')).toBe(true);
    }
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
