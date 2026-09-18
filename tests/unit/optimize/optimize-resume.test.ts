import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock the `ai` package BEFORE importing optimize-resume, so the
// mocked generateObject is what the module pulls in. The mock is
// per-test so we control return values via the spy.
vi.mock('ai', () => ({
  generateObject: vi.fn()
}));
vi.mock('@ai-sdk/gateway', () => ({
  gateway: vi.fn(() => 'mock-model')
}));

import { generateObject } from 'ai';
import {
  optimizeSummarySection,
  extractSummaryFromResumeData,
  applyOptimizedSummary
} from '@/lib/optimize/optimize-resume';

const mockedGenerateObject = vi.mocked(generateObject);

const longJd =
  'Senior TypeScript engineer with PostgreSQL and Kubernetes experience. ' +
  '5+ years building production systems. Hybrid SF. Compensation $180-250k. ' +
  'Strong opinions on testing, observability, and shipping iteratively. ' +
  'Experience mentoring junior engineers and leading projects end to end. ' +
  'Comfortable with on-call rotations and incident response.';

describe('optimizeSummarySection', () => {
  beforeEach(() => {
    delete process.env.AI_GATEWAY_API_KEY;
    mockedGenerateObject.mockReset();
  });

  it('returns jd_too_short when the JD is below 200 chars', async () => {
    const result = await optimizeSummarySection({
      currentSummary: 'Old summary.',
      jdText: 'too short'
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('jd_too_short');
    }
    expect(mockedGenerateObject).not.toHaveBeenCalled();
  });

  it('returns jd_too_short when the JD is only whitespace', async () => {
    const result = await optimizeSummarySection({
      currentSummary: 'Old summary.',
      jdText: '   \n\t  '
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('jd_too_short');
    }
  });

  it('returns jd_too_short with the actual length in the error message', async () => {
    const result = await optimizeSummarySection({
      currentSummary: 'Old summary.',
      jdText: 'A'.repeat(50)
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('50 chars');
      expect(result.error).toContain('200');
    }
  });

  it('returns no_api_key when AI_GATEWAY_API_KEY is not set', async () => {
    const result = await optimizeSummarySection({
      currentSummary: 'Old summary.',
      jdText: longJd
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('no_api_key');
      expect(result.error).toContain('AI_GATEWAY_API_KEY');
    }
    expect(mockedGenerateObject).not.toHaveBeenCalled();
  });

  it('returns a trimmed optimized summary when the API succeeds', async () => {
    process.env.AI_GATEWAY_API_KEY = 'sk-test-fake';
    mockedGenerateObject.mockResolvedValue({
      object: { summary: '  TypeScript engineer focused on Postgres and shipping.  ' },
      usage: { inputTokens: 800, outputTokens: 120 }
    } as never);

    const result = await optimizeSummarySection({
      currentSummary: 'Old summary that should be replaced.',
      jdText: longJd
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Leading/trailing whitespace is trimmed so it drops cleanly
      // into the resume editor.
      expect(result.optimized).toBe('TypeScript engineer focused on Postgres and shipping.');
      expect(result.modelUsed).toBeTruthy();
    }
  });

  it('returns validation_failed when the model returns an empty summary', async () => {
    process.env.AI_GATEWAY_API_KEY = 'sk-test-fake';
    mockedGenerateObject.mockResolvedValue({
      object: { summary: '   ' },
      usage: { inputTokens: 100, outputTokens: 0 }
    } as never);

    const result = await optimizeSummarySection({
      currentSummary: 'Old summary.',
      jdText: longJd
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('validation_failed');
      expect(result.error).toMatch(/empty/i);
    }
  });

  it('returns ai_failure when the SDK throws on every model in the chain', async () => {
    process.env.AI_GATEWAY_API_KEY = 'sk-test-fake';
    // Reject on every call so the full chain (4 models: primary +
    // 3 fallbacks) fails. Mirrors "all providers down".
    mockedGenerateObject.mockRejectedValue(new Error('upstream rate limited'));

    const result = await optimizeSummarySection({
      currentSummary: 'Old summary.',
      jdText: longJd
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('ai_failure');
      expect(result.error).toContain('upstream rate limited');
    }
    // Should have walked every model in the chain.
    expect(mockedGenerateObject.mock.calls.length).toBeGreaterThanOrEqual(4);
  });

  it('accepts an empty currentSummary (writes fresh instead of rewriting)', async () => {
    // The prompt explicitly handles the "no summary yet" case, so
    // an empty currentSummary should NOT reject — it should pass
    // through to the model.
    process.env.AI_GATEWAY_API_KEY = 'sk-test-fake';
    mockedGenerateObject.mockResolvedValue({
      object: { summary: 'Freshly written summary.' },
      usage: { inputTokens: 800, outputTokens: 120 }
    } as never);

    const result = await optimizeSummarySection({
      currentSummary: '',
      jdText: longJd
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.optimized).toBe('Freshly written summary.');
    }
  });

  it('truncates an oversized JD to MAX_JD_CHARS before sending to the model', async () => {
    process.env.AI_GATEWAY_API_KEY = 'sk-test-fake';
    mockedGenerateObject.mockResolvedValue({
      object: { summary: 'Optimized.' },
      usage: { inputTokens: 0, outputTokens: 0 }
    } as never);

    const oversizedJd = 'A'.repeat(20_000); // > MAX_JD_CHARS (8K)
    await optimizeSummarySection({
      currentSummary: 'Old summary.',
      jdText: oversizedJd
    });

    expect(mockedGenerateObject).toHaveBeenCalledTimes(1);
    const call = mockedGenerateObject.mock.calls[0][0] as { prompt?: string };
    // The prompt should NOT contain all 20K chars — the JD was
    // truncated. We check that the prompt is well under the input
    // length as a proxy for truncation having happened.
    expect(call.prompt).toBeDefined();
    expect(call.prompt!.length).toBeLessThan(oversizedJd.length);
  });

  it('passes a structured output schema + non-zero temperature + 90s abort signal', async () => {
    process.env.AI_GATEWAY_API_KEY = 'sk-test-fake';
    mockedGenerateObject.mockResolvedValue({
      object: { summary: 'Optimized.' },
      usage: { inputTokens: 0, outputTokens: 0 }
    } as never);

    await optimizeSummarySection({
      currentSummary: 'Old summary.',
      jdText: longJd
    });

    expect(mockedGenerateObject).toHaveBeenCalledTimes(1);
    const call = mockedGenerateObject.mock.calls[0][0] as {
      schema?: unknown;
      temperature?: number;
      abortSignal?: AbortSignal;
    };
    // The schema binding is the core guarantee — the model can't
    // return a non-conforming object.
    expect(call.schema).toBeDefined();
    // Slightly creative but grounded (summary rewriting benefits
    // from a non-zero temperature).
    expect(call.temperature).toBeGreaterThan(0);
    expect(call.abortSignal).toBeDefined();
  });
});

describe('extractSummaryFromResumeData', () => {
  it('returns an empty string + length 0 for empty sections', () => {
    const out = extractSummaryFromResumeData({ sections: {} });
    expect(out).toEqual({ value: '', length: 0 });
  });

  it('returns an empty string when basics is missing', () => {
    const out = extractSummaryFromResumeData({ sections: { basics: undefined } });
    expect(out).toEqual({ value: '', length: 0 });
  });

  it('returns an empty string when basics has no summary', () => {
    const out = extractSummaryFromResumeData({ sections: { basics: {} } });
    expect(out).toEqual({ value: '', length: 0 });
  });

  it('returns the actual summary + its length', () => {
    const summary = 'I am an engineer.';
    const out = extractSummaryFromResumeData({
      sections: { basics: { summary } }
    });
    expect(out.value).toBe(summary);
    expect(out.length).toBe(summary.length);
  });

  it('preserves other top-level sections (no mutation)', () => {
    const resumeData = {
      sections: {
        basics: { name: 'Jane', summary: 'old' },
        work: [{ company: 'Acme' }],
        skills: [{ name: 'Languages', keywords: ['TS'] }]
      }
    };
    const out = extractSummaryFromResumeData(resumeData);
    expect(out.value).toBe('old');
    // Confirm the helper didn't mutate the input — callers may
    // pass the object back through `applyOptimizedSummary`.
    expect(resumeData.sections.basics.name).toBe('Jane');
    expect(resumeData.sections.work).toEqual([{ company: 'Acme' }]);
  });
});

describe('applyOptimizedSummary', () => {
  it('writes the new summary into sections.basics.summary', () => {
    const before = { sections: { basics: { name: 'Jane', summary: 'old' } } };
    const after = applyOptimizedSummary(before, 'freshly optimized');
    expect(after.sections.basics.summary).toBe('freshly optimized');
  });

  it('preserves every other section (work, skills, education, etc.)', () => {
    const before = {
      sections: {
        basics: { name: 'Jane', summary: 'old' },
        work: [{ company: 'Acme' }],
        skills: [{ name: 'Languages', keywords: ['TS'] }],
        education: [{ institution: 'MIT' }]
      }
    };
    const after = applyOptimizedSummary(before, 'fresh');
    expect(after.sections.work).toEqual([{ company: 'Acme' }]);
    expect(after.sections.skills).toEqual([{ name: 'Languages', keywords: ['TS'] }]);
    expect(after.sections.education).toEqual([{ institution: 'MIT' }]);
  });

  it('preserves other basics fields (name, email, etc.)', () => {
    const before = {
      sections: {
        basics: {
          name: 'Jane Doe',
          email: 'jane@example.com',
          url: 'https://janedoe.dev',
          summary: 'old summary'
        }
      }
    };
    const after = applyOptimizedSummary(before, 'fresh');
    expect(after.sections.basics).toEqual({
      name: 'Jane Doe',
      email: 'jane@example.com',
      url: 'https://janedoe.dev',
      summary: 'fresh'
    });
  });

  it('creates a basics object if one did not exist', () => {
    // Widen the type explicitly so `basics` is known to be optional
    // (the literal `{ sections: {} }` would infer `basics` as missing).
    const before: { sections: { basics?: { summary?: string } } } = {
      sections: {}
    };
    const after = applyOptimizedSummary(before, 'fresh');
    expect(after.sections.basics).toEqual({ summary: 'fresh' });
  });

  it('does NOT mutate the input object (immutability)', () => {
    const before = { sections: { basics: { name: 'Jane', summary: 'old' } } };
    const snapshot = JSON.parse(JSON.stringify(before));
    applyOptimizedSummary(before, 'fresh');
    // The input must be unchanged — Redux-style purity is what
    // callers (server actions, React renders) rely on.
    expect(before).toEqual(snapshot);
  });

  it('returns a new object reference at every level of the path (structural sharing elsewhere)', () => {
    const work = [{ company: 'Acme' }];
    const before = {
      sections: {
        basics: { name: 'Jane', summary: 'old' },
        work
      }
    };
    const after = applyOptimizedSummary(before, 'fresh');
    expect(after).not.toBe(before);
    expect(after.sections).not.toBe(before.sections);
    expect(after.sections.basics).not.toBe(before.sections.basics);
    // Unrelated branches (work) ARE shared by reference — this is
    // the standard structural-sharing pattern, not a deep clone.
    expect(after.sections.work).toBe(work);
  });
});
