import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock the `ai` package BEFORE importing parse-resume, so the mocked
// generateObject is what the module pulls in. The mock is per-test
// (vi.mock is hoisted) so we control return values via the spies.
vi.mock('ai', () => ({
  generateObject: vi.fn()
}));
vi.mock('@ai-sdk/gateway', () => ({
  gateway: vi.fn(() => 'mock-model')
}));

import { generateObject } from 'ai';
import { parseResumeText } from '@/lib/resume-parser/parse-resume';

const mockedGenerateObject = vi.mocked(generateObject);

const validResumeSections = {
  basics: {
    name: 'Jane Doe',
    label: 'Senior Software Engineer',
    email: 'jane@example.com',
    phone: '+1 555-0100',
    url: 'https://janedoe.dev',
    summary: 'Engineer with 10 years of experience.',
    location: {
      address: '',
      postalCode: '',
      city: 'San Francisco',
      countryCode: 'US',
      region: 'CA'
    },
    profiles: [
      { network: 'GitHub', username: 'janedoe', url: 'https://github.com/janedoe' }
    ]
  },
  work: [
    {
      company: 'Acme',
      location: 'San Francisco, CA',
      url: '',
      summary: '',
      positions: [
        {
          title: 'Senior Engineer',
          startDate: '2020-01',
          endDate: '',
          highlights: ['Shipped 5 features.']
        }
      ]
    }
  ],
  education: [],
  projects: [],
  skills: [
    { name: 'Languages', keywords: ['TypeScript', 'Python'] }
  ],
  volunteer: [],
  awards: [],
  certificates: [],
  publications: [],
  languages: [],
  interests: [],
  references: []
};

describe('parseResumeText', () => {
  beforeEach(() => {
    delete process.env.AI_GATEWAY_API_KEY;
    mockedGenerateObject.mockReset();
  });

  it('returns resume_too_short when the text is below the minimum length', async () => {
    const result = await parseResumeText('too short');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('resume_too_short');
    }
    expect(mockedGenerateObject).not.toHaveBeenCalled();
  });

  it('returns resume_too_short when the text is only whitespace', async () => {
    const result = await parseResumeText('   \n\t  ');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('resume_too_short');
    }
  });

  it('returns no_api_key when AI_GATEWAY_API_KEY is not set', async () => {
    const result = await parseResumeText('A'.repeat(200));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('no_api_key');
    }
    expect(mockedGenerateObject).not.toHaveBeenCalled();
  });

  it('parses valid resume text into the ResumeSections shape when the API succeeds', async () => {
    process.env.AI_GATEWAY_API_KEY = 'sk-test-fake';
    mockedGenerateObject.mockResolvedValue({
      object: validResumeSections,
      usage: { inputTokens: 4321, outputTokens: 1234 }
    } as never);

    const resume = 'A'.repeat(200);
    const result = await parseResumeText(resume);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual(validResumeSections);
      expect(result.usage.inputTokens).toBe(4321);
      expect(result.usage.outputTokens).toBe(1234);
    }
  });

  it('returns ai_failure when the SDK throws', async () => {
    process.env.AI_GATEWAY_API_KEY = 'sk-test-fake';
    // Reject on every call so the fallback chain (3 models) can't
    // accidentally succeed via an un-mocked call.
    mockedGenerateObject.mockRejectedValue(new Error('rate limited'));

    const result = await parseResumeText('A'.repeat(200));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('ai_failure');
      expect(result.error).toContain('rate limited');
    }
    expect(mockedGenerateObject.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it('passes the structured output schema to generateObject with temperature 0', async () => {
    process.env.AI_GATEWAY_API_KEY = 'sk-test-fake';
    mockedGenerateObject.mockResolvedValue({
      object: validResumeSections,
      usage: { inputTokens: 0, outputTokens: 0 }
    } as never);

    await parseResumeText('A'.repeat(200));

    expect(mockedGenerateObject).toHaveBeenCalledTimes(1);
    const call = mockedGenerateObject.mock.calls[0][0] as unknown as {
      schema?: unknown;
      temperature?: number;
      model?: unknown;
    };
    // The schema binding is the core guarantee — the model can't
    // return a non-conforming object.
    expect(call.schema).toBeDefined();
    expect(call.temperature).toBe(0);
    expect(call.model).toBeDefined();
  });
});
