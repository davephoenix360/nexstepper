/**
 * @vitest-environment jsdom
 *
 * The assistant's introduction bubble — real DOM, real timers.
 *
 * ## Why this is an interaction test
 *
 * The whole point of the bubble is a TIMING behaviour: it appears after
 * a delay, and it does not appear if the agent was used recently or if
 * it was dismissed. A `renderToStaticMarkup` assertion could only ever
 * check that the markup exists, which is the same class of blindness
 * the `tests/interaction/` directory exists to fix (see
 * `tests/interaction/harness.tsx`).
 *
 * So: fake timers, real clicks, and the storage state checked on disk
 * rather than inferred from the DOM.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';

import { AgentIntroBubble } from '@/components/chat/agent-intro-bubble';
import {
  AGENT_INTRO_DELAY_MS,
  AGENT_INTRO_STORAGE_KEY,
  AGENT_INTRO_DISMISSED_SUPPRESS_MS,
  markAgentIntroSeen
} from '@/lib/chat/agent-intro';

function writeState(state: unknown) {
  window.localStorage.setItem(AGENT_INTRO_STORAGE_KEY, JSON.stringify(state));
}

function readState(): { seenAt?: number; dismissedAt?: number } | null {
  const raw = window.localStorage.getItem(AGENT_INTRO_STORAGE_KEY);
  return raw ? (JSON.parse(raw) as { seenAt?: number; dismissedAt?: number }) : null;
}

/** Let the intro timer fire. */
async function advancePastTheDelay() {
  await act(async () => {
    vi.advanceTimersByTime(AGENT_INTRO_DELAY_MS + 10);
  });
}

describe('the agent introduction bubble', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not appear before the delay has passed', async () => {
    render(<AgentIntroBubble agentOpen={false} onOpen={() => {}} onHeightChange={() => {}} />);
    await act(async () => {
      vi.advanceTimersByTime(AGENT_INTRO_DELAY_MS - 1000);
    });
    expect(screen.queryByTestId('agent-intro-bubble')).toBeNull();
  });

  it('appears after the delay', async () => {
    render(<AgentIntroBubble agentOpen={false} onOpen={() => {}} onHeightChange={() => {}} />);
    await advancePastTheDelay();
    expect(screen.getByTestId('agent-intro-bubble')).toBeTruthy();
  });

  it('names the agent and says what it can do', async () => {
    render(<AgentIntroBubble agentOpen={false} onOpen={() => {}} onHeightChange={() => {}} />);
    await advancePastTheDelay();
    const bubble = screen.getByTestId('agent-intro-bubble');
    expect(bubble.textContent).toContain("I'm Scout.");
    expect(bubble.textContent).toMatch(/ATS score/i);
  });

  it('tells a Free user what their allowance is', async () => {
    render(
      <AgentIntroBubble
        agentOpen={false}
        dailyLimit={20}
        onOpen={() => {}}
        onHeightChange={() => {}}
      />
    );
    await advancePastTheDelay();
    expect(screen.getByTestId('agent-intro-bubble').textContent).toContain(
      '20 messages a day'
    );
  });

  it('says nothing about an allowance on Pro', async () => {
    render(
      <AgentIntroBubble
        agentOpen={false}
        dailyLimit={null}
        onOpen={() => {}}
        onHeightChange={() => {}}
      />
    );
    await advancePastTheDelay();
    expect(screen.getByTestId('agent-intro-bubble').textContent).not.toMatch(
      /messages a day/
    );
  });

  it('does not appear if the agent was used recently', async () => {
    markAgentIntroSeen();
    render(<AgentIntroBubble agentOpen={false} onOpen={() => {}} onHeightChange={() => {}} />);
    await advancePastTheDelay();
    expect(screen.queryByTestId('agent-intro-bubble')).toBeNull();
  });

  it('does not appear after an explicit dismissal', async () => {
    writeState({ v: 1, dismissedAt: Date.now() });
    render(<AgentIntroBubble agentOpen={false} onOpen={() => {}} onHeightChange={() => {}} />);
    await advancePastTheDelay();
    expect(screen.queryByTestId('agent-intro-bubble')).toBeNull();
  });

  it('comes back once the dismissal is older than a week', async () => {
    writeState({ v: 1, dismissedAt: Date.now() - AGENT_INTRO_DISMISSED_SUPPRESS_MS - 1 });
    render(<AgentIntroBubble agentOpen={false} onOpen={() => {}} onHeightChange={() => {}} />);
    await advancePastTheDelay();
    expect(screen.getByTestId('agent-intro-bubble')).toBeTruthy();
  });

  it('dismisses on the × button and remembers the dismissal', async () => {
    // `fireEvent` rather than `userEvent` — see the note in "takes the
    // invitation" below.
    render(<AgentIntroBubble agentOpen={false} onOpen={() => {}} onHeightChange={() => {}} />);
    await advancePastTheDelay();
    await act(async () => {
      fireEvent.click(screen.getByTestId('agent-intro-dismiss'));
    });
    expect(screen.queryByTestId('agent-intro-bubble')).toBeNull();
    expect(readState()?.dismissedAt).toBeGreaterThan(0);
  });

  it('dismisses on Escape', async () => {
    render(<AgentIntroBubble agentOpen={false} onOpen={() => {}} onHeightChange={() => {}} />);
    await advancePastTheDelay();
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(screen.queryByTestId('agent-intro-bubble')).toBeNull();
  });

  it('hides itself when the agent opens', async () => {
    const { rerender } = render(
      <AgentIntroBubble agentOpen={false} onOpen={() => {}} onHeightChange={() => {}} />
    );
    await advancePastTheDelay();
    expect(screen.getByTestId('agent-intro-bubble')).toBeTruthy();
    rerender(<AgentIntroBubble agentOpen onOpen={() => {}} onHeightChange={() => {}} />);
    await act(async () => {});
    expect(screen.queryByTestId('agent-intro-bubble')).toBeNull();
  });

  it('takes the invitation', async () => {
    // `fireEvent` rather than `userEvent`: userEvent awaits an internal
    // delay between events, and with the fake clock driving the
    // bubble's own delay, that wait never resolves. The click itself is
    // what is under test here, not the pointer choreography.
    let opened = false;
    render(
      <AgentIntroBubble
        agentOpen={false}
        onOpen={() => {
          opened = true;
        }}
        onHeightChange={() => {}}
      />
    );
    await advancePastTheDelay();
    await act(async () => {
      fireEvent.click(screen.getByTestId('agent-intro-open'));
    });
    expect(opened).toBe(true);
  });

  it('reports 0 height when it is down, so the feedback pill comes back', async () => {
    const heights: number[] = [];
    render(
      <AgentIntroBubble
        agentOpen={false}
        onOpen={() => {}}
        onHeightChange={(px) => heights.push(px)}
      />
    );
    await advancePastTheDelay();
    // The last thing it reports is 0 — the pill's offset is computed
    // from this, and a stale height would leave the pill stranded
    // above the trigger for good.
    expect(heights[heights.length - 1]).toBe(0);
  });

  it('dismisses when the user clicks elsewhere', async () => {
    render(<AgentIntroBubble agentOpen={false} onOpen={() => {}} onHeightChange={() => {}} />);
    await advancePastTheDelay();
    expect(screen.getByTestId('agent-intro-bubble')).toBeTruthy();
    await act(async () => {
      document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    });
    expect(screen.queryByTestId('agent-intro-bubble')).toBeNull();
  });

  it('is never printed', async () => {
    render(<AgentIntroBubble agentOpen={false} onOpen={() => {}} onHeightChange={() => {}} />);
    await advancePastTheDelay();
    expect(screen.getByTestId('agent-intro-bubble').className).toContain('no-print');
  });
});
