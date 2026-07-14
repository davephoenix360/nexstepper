import { describe, expect, it } from 'vitest';

import {
  PARSER_SYSTEM_PROMPT,
  buildParseUserPrompt
} from '@/lib/jd-parser/prompts';

/**
 * The prompts are the parser's IP. These tests don't pin the wording
 * (that would make every copy edit a test failure) — they just pin
 * the structural contract:
 *  - System prompt is non-empty and references the output schema name.
 *  - User prompt wraps the JD in a way that the model can distinguish
 *    it from instructions.
 */

describe('PARSER_SYSTEM_PROMPT', () => {
  it('is non-empty', () => {
    expect(PARSER_SYSTEM_PROMPT.length).toBeGreaterThan(100);
  });

  it('mentions the ParsedJd schema by name', () => {
    expect(PARSER_SYSTEM_PROMPT).toContain('ParsedJd');
  });

  it('contains the anti-hallucination rule', () => {
    // The whole point of the prompt is to bias the model toward null
    // over guessing. If this rule disappears, the parse quality goes
    // with it.
    expect(PARSER_SYSTEM_PROMPT).toMatch(/null|unknown/i);
  });
});

describe('buildParseUserPrompt', () => {
  it('wraps the JD in <job_description> tags', () => {
    const prompt = buildParseUserPrompt('Some JD text');
    expect(prompt).toContain('<job_description>');
    expect(prompt).toContain('</job_description>');
    expect(prompt).toContain('Some JD text');
  });

  it('preserves whitespace and special characters in the JD', () => {
    const jd = 'Line 1\nLine 2\tIndented\n\nDouble newlines';
    const prompt = buildParseUserPrompt(jd);
    expect(prompt).toContain(jd);
  });
});
