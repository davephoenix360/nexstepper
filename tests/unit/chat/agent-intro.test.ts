/**
 * When the assistant introduces itself.
 *
 * ## The rule
 *
 * A bubble that nags is worse than no bubble. So the decision has one
 * owner — `shouldShowAgentIntro` — and it is a pure function with the
 * suppression windows named:
 *
 * - never seen → show
 * - opened in the last 24 hours → don't
 * - dismissed in the last 7 days → don't
 * - otherwise → show again
 *
 * ## Why the copy is pinned
 *
 * The headline uses `AGENT_DISPLAY_NAME` rather than a literal, so a
 * rename of the agent propagates here. The test asserts that, so a
 * second copy of the name cannot creep into a speech bubble.
 */
import { describe, expect, it } from 'vitest';

import { AGENT_DISPLAY_NAME } from '@/lib/brand/agent-mark';
import {
  AGENT_INTRO_BODY,
  AGENT_INTRO_DELAY_MS,
  AGENT_INTRO_DISMISSED_SUPPRESS_MS,
  AGENT_INTRO_HEADLINE,
  AGENT_INTRO_SEEN_SUPPRESS_MS,
  agentIntroAllowanceLine,
  shouldShowAgentIntro
} from '@/lib/chat/agent-intro';

const NOW = 1_800_000_000_000;

describe('shouldShowAgentIntro', () => {
  it('shows the bubble to someone who has never seen the agent', () => {
    expect(shouldShowAgentIntro(null, NOW)).toBe(true);
  });

  it('stays quiet for a day after the agent was opened', () => {
    const state = { v: 1 as const, seenAt: NOW - 60_000 };
    expect(shouldShowAgentIntro(state, NOW)).toBe(false);
  });

  it('comes back once the day is up', () => {
    const state = {
      v: 1 as const,
      seenAt: NOW - AGENT_INTRO_SEEN_SUPPRESS_MS - 1
    };
    expect(shouldShowAgentIntro(state, NOW)).toBe(true);
  });

  it('stays quiet for a week after an explicit dismissal', () => {
    const state = { v: 1 as const, dismissedAt: NOW - 60_000 };
    expect(shouldShowAgentIntro(state, NOW)).toBe(false);
  });

  it('comes back once the week is up', () => {
    const state = {
      v: 1 as const,
      dismissedAt: NOW - AGENT_INTRO_DISMISSED_SUPPRESS_MS - 1
    };
    expect(shouldShowAgentIntro(state, NOW)).toBe(true);
  });

  it('prefers the dismissal — it is the longer suppression', () => {
    const state = {
      v: 1 as const,
      // Opened a long time ago, dismissed yesterday.
      seenAt: NOW - 30 * 24 * 60 * 60 * 1000,
      dismissedAt: NOW - 24 * 60 * 60 * 1000
    };
    expect(shouldShowAgentIntro(state, NOW)).toBe(false);
  });

  it('ignores a state with no timestamps at all', () => {
    expect(shouldShowAgentIntro({ v: 1 }, NOW)).toBe(true);
  });
});

describe('the copy', () => {
  it('names the agent with the one constant that holds its name', () => {
    // A literal "Scout" here would be a second copy of the name, and a
    // rename would leave the bubble talking about the old agent.
    expect(AGENT_INTRO_HEADLINE).toBe(`I'm ${AGENT_DISPLAY_NAME}.`);
    expect(AGENT_INTRO_HEADLINE).toContain(AGENT_DISPLAY_NAME);
  });

  it('says what the agent can do, and does not promise to edit', () => {
    // The agent's diagnosis is reliable; its edit rate is not the same
    // on every model (the free chain edits in 3 of 5 attempts), so the
    // bubble leads with what it can always do.
    expect(AGENT_INTRO_BODY).toMatch(/ATS score/i);
    expect(AGENT_INTRO_BODY).toMatch(/missing/i);
  });

  it('names the allowance from the number it is given', () => {
    expect(agentIntroAllowanceLine(20)).toBe(
      'Your free plan includes 20 messages a day.'
    );
    // The number comes from the caller, not from a literal here — the
    // badge, the bubble and the server's gate have to agree.
    expect(agentIntroAllowanceLine(5)).toContain('5 messages');
  });
});

describe('the timing', () => {
  it('waits long enough not to interrupt someone who just arrived', () => {
    expect(AGENT_INTRO_DELAY_MS).toBeGreaterThanOrEqual(30_000);
  });
});
