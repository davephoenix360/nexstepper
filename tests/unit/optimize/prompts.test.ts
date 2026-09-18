import { describe, expect, it } from 'vitest';

import {
  OPTIMIZER_SYSTEM_PROMPT,
  buildSummaryUserPrompt,
  buildWorkHighlightsUserPrompt
} from '@/lib/optimize/prompts';

describe('OPTIMIZER_SYSTEM_PROMPT', () => {
  it('is a non-empty string', () => {
    expect(typeof OPTIMIZER_SYSTEM_PROMPT).toBe('string');
    expect(OPTIMIZER_SYSTEM_PROMPT.length).toBeGreaterThan(200);
  });

  it('states the hard "do not invent" rule', () => {
    // The core anti-hallucination discipline — without this the
    // tool is dangerous. Lock the language in.
    expect(OPTIMIZER_SYSTEM_PROMPT).toMatch(/NEVER invent/i);
  });

  it('forbids changing identifying facts (dates, employers)', () => {
    expect(OPTIMIZER_SYSTEM_PROMPT).toMatch(/NEVER change dates/i);
  });

  it('asks for output-only (no preamble / no commentary)', () => {
    expect(OPTIMIZER_SYSTEM_PROMPT).toMatch(/Output ONLY the rewritten section text/i);
  });

  it('explicitly forbids generic filler phrases', () => {
    // The "passionate professional" anti-pattern. The model needs
    // a direct rule against it; otherwise it defaults to fluff.
    expect(OPTIMIZER_SYSTEM_PROMPT).toMatch(/passionate professional/i);
  });
});

describe('buildSummaryUserPrompt', () => {
  const jd =
    'Senior TypeScript engineer with PostgreSQL and Kubernetes experience. 5+ years. Hybrid SF. Compensation $180-250k.';

  it('embeds the JD inside a labeled block', () => {
    const prompt = buildSummaryUserPrompt({ currentSummary: 'old summary', jdText: jd });
    expect(prompt).toContain('<job_description>');
    expect(prompt).toContain(jd);
    expect(prompt).toContain('</job_description>');
  });

  it('embeds the current summary inside a labeled block', () => {
    const prompt = buildSummaryUserPrompt({ currentSummary: 'old summary', jdText: jd });
    expect(prompt).toContain('<current_summary>');
    expect(prompt).toContain('old summary');
    expect(prompt).toContain('</current_summary>');
  });

  it('states the ~5 sentence / ~600-900 char target', () => {
    const prompt = buildSummaryUserPrompt({ currentSummary: 'x', jdText: jd });
    expect(prompt).toMatch(/5 sentences/);
    expect(prompt).toMatch(/600-900 chars/);
  });

  it('forbids adding experience / employers / metrics not in the resume', () => {
    const prompt = buildSummaryUserPrompt({ currentSummary: 'x', jdText: jd });
    expect(prompt).toMatch(/NOT add experience/i);
    expect(prompt).toMatch(/NOT add/i);
  });

  it('surfaces the "(not yet written)" fallback when currentSummary is empty', () => {
    const prompt = buildSummaryUserPrompt({ currentSummary: '', jdText: jd });
    // The parenthetical hint should be present so the model knows
    // it's writing fresh vs. rewriting.
    expect(prompt).toContain('(the candidate has not written a summary yet');
  });

  it('uses the actual current summary when present (does NOT inject the fallback hint)', () => {
    const prompt = buildSummaryUserPrompt({
      currentSummary: 'I build TypeScript apps.',
      jdText: jd
    });
    expect(prompt).toContain('I build TypeScript apps.');
    // Make sure we don't ALSO inject the fallback parenthetical
    // when the summary is real — that would confuse the model.
    expect(prompt).not.toContain('(the candidate has not written a summary yet');
  });

  it('handles a whitespace-only current summary as empty', () => {
    const prompt = buildSummaryUserPrompt({ currentSummary: '   \n  ', jdText: jd });
    expect(prompt).toContain('(the candidate has not written a summary yet');
  });

  it('does not perform any HTML escape on the inputs (the model is the consumer)', () => {
    // We're handing these strings to an LLM, not to a browser. Sanity
    // check: passing weird chars doesn't get escaped/munged.
    const weird = '<script>alert("xss")</script> & "quotes" \'apos\'';
    const prompt = buildSummaryUserPrompt({ currentSummary: weird, jdText: weird });
    expect(prompt).toContain(weird);
  });
});

describe('buildWorkHighlightsUserPrompt', () => {
  const jd = 'Senior engineer with PostgreSQL experience.';

  it('embeds the JD, position title, company, and highlights', () => {
    const prompt = buildWorkHighlightsUserPrompt({
      positionTitle: 'Senior Engineer',
      company: 'Acme',
      currentHighlights: ['Shipped features.', 'Owned the API.'],
      jdText: jd
    });
    expect(prompt).toContain('<job_description>');
    expect(prompt).toContain(jd);
    expect(prompt).toContain('role="Senior Engineer"');
    expect(prompt).toContain('company="Acme"');
    expect(prompt).toContain('1. Shipped features.');
    expect(prompt).toContain('2. Owned the API.');
  });

  it('numbers highlights starting from 1', () => {
    const prompt = buildWorkHighlightsUserPrompt({
      positionTitle: 'Eng',
      company: 'Co',
      currentHighlights: ['A', 'B', 'C', 'D'],
      jdText: jd
    });
    expect(prompt).toContain('1. A');
    expect(prompt).toContain('2. B');
    expect(prompt).toContain('3. C');
    expect(prompt).toContain('4. D');
  });

  it('forbids adding metrics not already present', () => {
    const prompt = buildWorkHighlightsUserPrompt({
      positionTitle: 'Eng',
      company: 'Co',
      currentHighlights: ['Did X.'],
      jdText: jd
    });
    expect(prompt).toMatch(/Do NOT add metrics/i);
  });

  it('preserves "one bullet per highlight" (no merging)', () => {
    const prompt = buildWorkHighlightsUserPrompt({
      positionTitle: 'Eng',
      company: 'Co',
      currentHighlights: ['Did X.'],
      jdText: jd
    });
    expect(prompt).toMatch(/one bullet per highlight/i);
  });
});
