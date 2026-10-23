/**
 * The agent's name.
 *
 * ## What this pins
 *
 * The name is ONE string, read from one place, by every surface that
 * shows it — AND the agent's own system prompt. A name that is only
 * a UI label is a name the agent does not know, and a product and an
 * agent that disagree about who the agent is are two different
 * products wearing one logo.
 *
 * The "not Stepper" assertion is a documented brand rule, not a
 * preference: `docs/brand/logo-brief.md` says a stepper is the
 * person who takes the next step — the customer, not the tool. So
 * the agent cannot be called Stepper.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { buildSystemPrompt } from '@/lib/chat/system-prompt';
import { blankResumeData } from '@/lib/resume-schema';
import { AGENT_DISPLAY_NAME } from '@/lib/brand/agent-mark';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');

describe("the agent's name", () => {
  it('is one non-empty string', () => {
    expect(AGENT_DISPLAY_NAME.trim().length).toBeGreaterThan(0);
  });

  it('is the name the agent gives itself in the system prompt', () => {
    const prompt = buildSystemPrompt(blankResumeData(), undefined, null);
    expect(prompt).toContain(
      `You are ${AGENT_DISPLAY_NAME}, the Nexstepper assistant`
    );
    expect(prompt).toContain(`You are **${AGENT_DISPLAY_NAME}**`);
  });

  it('gives the agent a personality, not just a name', () => {
    const prompt = buildSystemPrompt(blankResumeData(), undefined, null);
    // The three traits that make the agent's behaviour predictable.
    expect(prompt).toContain('You arrive informed');
    expect(prompt).toContain('You have a point of view');
    expect(prompt).toContain('You are honest above being agreeable');

    // And the four sharpest voice rules.
    expect(prompt).toContain('Lead with the finding, not with a preamble');
    expect(prompt).toContain('Have an opinion');
    expect(prompt).toContain('Show the number');
    expect(prompt).toContain('Warm, not cute');
  });

  it('is the name the chat header shows', () => {
    const win = read('components/chat/chat-window.tsx');
    expect(win).toContain('AGENT_DISPLAY_NAME');
    // No hard-coded label left behind.
    expect(win).not.toMatch(/>\s*AI Assistant\s*</);
  });

  it('is the name the trigger announces to a screen reader', () => {
    const bubble = read('components/chat/chat-bubble.tsx');
    expect(bubble).toContain('AGENT_DISPLAY_NAME');
    expect(bubble).not.toContain("'Open AI assistant'");
    expect(bubble).not.toContain("'Close AI assistant'");
  });

  it('is neither the product name nor "Stepper"', () => {
    expect(AGENT_DISPLAY_NAME).not.toBe('Nexstepper');
    expect(AGENT_DISPLAY_NAME).not.toBe('Stepper');
  });
});
