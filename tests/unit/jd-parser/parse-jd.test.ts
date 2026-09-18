import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock the `ai` package BEFORE importing parse-jd, so the mocked
// generateObject is what the module pulls in. The mock is per-test
// (vi.mock is hoisted) so we control return values via the spies.
vi.mock('ai', () => ({
  generateObject: vi.fn()
}));
vi.mock('@ai-sdk/gateway', () => ({
  gateway: vi.fn(() => 'mock-model')
}));

import { generateObject } from 'ai';
import { parseJd } from '@/lib/jd-parser/parse-jd';

const mockedGenerateObject = vi.mocked(generateObject);

const validParsedJd = {
  jobTitle: 'Senior Software Engineer',
  company: 'Anthropic',
  seniority: 'senior',
  location: 'San Francisco, CA',
  remote: 'hybrid',
  salaryMin: 180_000,
  salaryMax: 250_000,
  salaryCurrency: 'USD',
  requiredSkills: ['TypeScript', 'PostgreSQL'],
  niceToHaveSkills: ['Rust'],
  keywords: ['TypeScript', 'PostgreSQL', 'Rust'],
  responsibilities: ['Build features'],
  qualifications: ['5+ years experience'],
  yearsExperienceMin: 5,
  employmentType: 'full_time',
  summary: 'Senior IC role.'
};

describe('parseJd', () => {
  beforeEach(() => {
    // Important: clear any env var set by other tests so each test is
    // independent. The `no_api_key` test relies on the env NOT being set.
    delete process.env.AI_GATEWAY_API_KEY;
    mockedGenerateObject.mockReset();
  });

  it('returns jd_too_short when the JD is below the minimum length', async () => {
    const result = await parseJd('too short');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('jd_too_short');
    }
    expect(mockedGenerateObject).not.toHaveBeenCalled();
  });

  it('returns jd_too_short when the JD is only whitespace', async () => {
    const result = await parseJd('   \n\t  ');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('jd_too_short');
    }
  });

  it('returns no_api_key when AI_GATEWAY_API_KEY is not set', async () => {
    const result = await parseJd('A'.repeat(100));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('no_api_key');
    }
    expect(mockedGenerateObject).not.toHaveBeenCalled();
  });

  it('parses a valid JD into the ParsedJd shape when the API succeeds', async () => {
    process.env.AI_GATEWAY_API_KEY = 'sk-test-fake';
    mockedGenerateObject.mockResolvedValue({
      object: validParsedJd,
      usage: { inputTokens: 1234, outputTokens: 567 }
    } as never);

    const jd = 'Senior Software Engineer at Anthropic. TypeScript + PostgreSQL. 5+ years. Hybrid SF.';
    const result = await parseJd(jd);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual(validParsedJd);
      expect(result.usage.inputTokens).toBe(1234);
      expect(result.usage.outputTokens).toBe(567);
    }
  });

  it('returns ai_failure when the SDK throws', async () => {
    process.env.AI_GATEWAY_API_KEY = 'sk-test-fake';
    mockedGenerateObject.mockRejectedValue(new Error('rate limited'));

    const result = await parseJd('A'.repeat(100));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('ai_failure');
      expect(result.error).toContain('rate limited');
    }
  });

  it('passes the structured output schema to generateObject', async () => {
    process.env.AI_GATEWAY_API_KEY = 'sk-test-fake';
    mockedGenerateObject.mockResolvedValue({
      object: validParsedJd,
      usage: { inputTokens: 0, outputTokens: 0 }
    } as never);

    await parseJd('A'.repeat(100));

    expect(mockedGenerateObject).toHaveBeenCalledTimes(1);
    // Cast through unknown — generateObject's overloads make the
    // argument a complex union; we only care that schema + temperature
    // are forwarded, which we assert via runtime checks.
    const call = mockedGenerateObject.mock.calls[0][0] as unknown as {
      schema?: unknown;
      temperature?: number;
    };
    // The schema binding is the core guarantee — the model can't
    // return a non-conforming object.
    expect(call.schema).toBeDefined();
    expect(call.temperature).toBe(0);
  });
});
