import { describe, expect, it } from 'vitest';

import { gallerySampleResumeData } from '@/lib/resume-schema/sample';
import {
  firstSessionAnalysisSchema,
  hashJobDescription,
  resumeToPlainText
} from '@/lib/chat/first-session-analysis';
import { buildSystemPrompt } from '@/lib/chat/system-prompt';

/**
 * Tests for the first-session analysis.
 *
 * Three things worth pinning here:
 *
 * 1. The JD hash IS the cache key, so it has to change when the JD
 *    changes and stay stable when it does not. If it drifts, a stale
 *    critique silently survives a JD edit.
 * 2. The resume is rendered as prose, not JSON — the model reasons about
 *    prose better and it halves the token count.
 * 3. The analysis reaches the SYSTEM PROMPT, including the
 *    `alreadyCovered` list, which is the anti-repetition mechanism: the
 *    assistant must not ask for skills the resume already lists.
 */

describe('hashJobDescription', () => {
  it('is deterministic', () => {
    const a = hashJobDescription('Some job description text');
    const b = hashJobDescription('Some job description text');
    expect(a).toBe(b);
  });

  it('ignores surrounding whitespace — pasting the same JD twice is the same JD', () => {
    expect(hashJobDescription('  hello  ')).toBe(hashJobDescription('hello'));
  });

  it('changes when the JD changes — this is what invalidates the cache', () => {
    expect(hashJobDescription('Role A')).not.toBe(hashJobDescription('Role B'));
  });

  it('is short enough to index', () => {
    expect(hashJobDescription('anything').length).toBeLessThanOrEqual(64);
  });
});

describe('resumeToPlainText', () => {
  const text = resumeToPlainText(gallerySampleResumeData);

  it('includes the company and the bullet text', () => {
    expect(text).toContain('Loom Systems');
    expect(text).toContain('Led the migration');
  });

  it('includes the skills', () => {
    expect(text).toContain('SKILLS');
  });

  it('is prose, not JSON — the model reasons about it better and it is cheaper', () => {
    expect(text).not.toContain('"sections"');
    expect(text).not.toContain('"highlights"');
  });

  it('omits sections that are empty rather than printing empty headings', () => {
    // The gallery sample has empty publications/references arrays.
    expect(text).not.toContain('PUBLICATIONS');
    expect(text).not.toContain('REFERENCES');
  });
});

describe('firstSessionAnalysisSchema', () => {
  it('accepts a well-formed analysis', () => {
    const parsed = firstSessionAnalysisSchema.safeParse({
      headline: 'Solid match, missing TypeScript evidence.',
      verdict: 'workable',
      strengths: [{ point: 'Real metrics', evidence: 'cut p95 from 2.4s to 0.9s' }],
      gaps: [{ point: 'No TypeScript', why: 'JD asks for it', severity: 'high' }],
      keywordGaps: ['TypeScript'],
      alreadyCovered: ['Python', 'AWS'],
      lengthNote: 'about one page',
      nextActions: ['Add a TypeScript project']
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects an unknown verdict', () => {
    const parsed = firstSessionAnalysisSchema.safeParse({
      headline: 'x',
      verdict: 'excellent',
      strengths: [],
      gaps: [],
      keywordGaps: [],
      alreadyCovered: [],
      lengthNote: null,
      nextActions: []
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects an unknown severity', () => {
    const parsed = firstSessionAnalysisSchema.safeParse({
      headline: 'x',
      verdict: 'weak',
      strengths: [],
      gaps: [{ point: 'a', why: 'b', severity: 'catastrophic' }],
      keywordGaps: [],
      alreadyCovered: [],
      lengthNote: null,
      nextActions: []
    });
    expect(parsed.success).toBe(false);
  });
});

describe('the analysis reaches the system prompt', () => {
  const analysis = {
    headline: 'Strong on evidence, thin on TypeScript.',
    verdict: 'workable' as const,
    strengths: [
      { point: 'Quantified outcomes', evidence: 'cut p95 from 2.4s to 0.9s' }
    ],
    gaps: [
      { point: 'No TypeScript evidence', why: 'The JD asks for it', severity: 'high' as const }
    ],
    keywordGaps: ['TypeScript', 'Kubernetes'],
    alreadyCovered: ['Python', 'AWS'],
    lengthNote: 'about one page',
    nextActions: ['Add a TypeScript project']
  };

  const prompt = buildSystemPrompt(
    gallerySampleResumeData,
    undefined,
    null,
    { isMaster: false, variantCount: 1 },
    null,
    analysis
  );

  it('includes the verdict and headline', () => {
    expect(prompt).toContain('Strong on evidence, thin on TypeScript.');
    expect(prompt).toMatch(/Verdict: workable/);
  });

  it('includes the gaps and the missing skills', () => {
    expect(prompt).toContain('No TypeScript evidence');
    expect(prompt).toContain('TypeScript, Kubernetes');
  });

  it('includes the anti-repetition list AND the instruction not to ask for it', () => {
    // This is the whole point of `alreadyCovered`. Without the explicit
    // instruction, the model sees "Python, AWS" in its context and may
    // still ask the user for Python — which is the exact failure that
    // makes an assistant feel like it is not reading the document.
    expect(prompt).toContain('Python, AWS');
    expect(prompt).toMatch(/Do NOT ask the user for these/i);
  });

  it('tells the assistant not to recite the review verbatim', () => {
    expect(prompt).toMatch(/not have seen it|not.*recite|repeat it back/i);
  });

  it('omits the section entirely when there is no analysis', () => {
    const bare = buildSystemPrompt(gallerySampleResumeData);
    expect(bare).not.toContain('REVIEW OF THIS RESUME FOR THIS JOB');
  });
});
