import { describe, expect, it } from 'vitest';

import {
  AUTO_TAILOR_PROMPT,
  suggestedPrompts,
  type SuggestedPrompt
} from '@/lib/chat/suggested-prompts';

/**
 * The suggestion chips and the automatic post-creation run share one
 * source of prompts. That is deliberate: the chip the user would have
 * clicked and the prompt the product runs for them must be the same
 * request, or the product is quietly doing something the user did not
 * ask for.
 */
describe('suggested prompts', () => {
  it('returns different suggestions when a job description is attached', () => {
    const generic = suggestedPrompts(false);
    const withJob = suggestedPrompts(true);

    expect(generic.length).toBeGreaterThan(0);
    expect(withJob.length).toBeGreaterThan(0);
    expect(withJob.map((p) => p.label)).not.toEqual(generic.map((p) => p.label));
  });

  it('gives every suggestion a short label and a real prompt', () => {
    for (const list of [suggestedPrompts(false), suggestedPrompts(true)]) {
      for (const s of list as SuggestedPrompt[]) {
        expect(s.label.length).toBeGreaterThan(0);
        // A label long enough to be a sentence is not a label.
        expect(s.label.length).toBeLessThan(45);
        expect(s.prompt.length).toBeGreaterThan(40);
      }
    }
  });

  it('labels are unique within a list', () => {
    for (const list of [suggestedPrompts(false), suggestedPrompts(true)]) {
      const labels = list.map((p) => p.label);
      expect(new Set(labels).size).toBe(labels.length);
    }
  });

  it('the job-aware suggestions talk about the job, not just craft', () => {
    // With a JD attached, the useful suggestions are the ones that use
    // the JD. "Improve my resume" alone ignores the whole point of the
    // variant.
    const prompts = suggestedPrompts(true).map((p) => p.prompt.toLowerCase());
    expect(prompts.some((p) => p.includes('job description'))).toBe(true);
  });

  it('every prompt tells the agent not to invent facts', () => {
    // The single most damaging failure mode for a resume tool is a
    // confident invented metric. Every suggestion that touches the
    // resume's content says so explicitly.
    for (const s of suggestedPrompts(true)) {
      const p = s.prompt.toLowerCase();
      if (p.includes('rewrite') || p.includes('improve') || p.includes('tailor')) {
        expect(
          p.includes('never invent') ||
            p.includes('do not invent') ||
            p.includes('keep every fact')
        ).toBe(true);
      }
    }
  });

  it('the auto-run prompt asks for one or two pages AND the ATS score', () => {
    // This is the prompt the user would have typed first. Those two
    // asks are the workflow.
    const p = AUTO_TAILOR_PROMPT.toLowerCase();
    expect(p).toContain('one or two pages');
    expect(p).toContain('ats score');
    expect(p).toContain('never invent');
  });
});
