/**
 * Deriving the agent's state from what it is actually doing.
 *
 * This is the logic that makes the mark informative rather than
 * decorative, so it is worth pinning precisely: a mark that shows
 * `applied` when the edit failed is worse than no mark at all.
 */

import { describe, expect, it } from 'vitest';

import {
  AGENT_TRANSIENT_MS,
  agentStateForMessage,
  agentStateLabel,
  deriveAgentState,
  isTransientAgentState,
  toolResultsOf,
  type AgentMessageLike
} from '@/lib/brand/agent-mark';

const assistant = (over: Partial<AgentMessageLike> = {}): AgentMessageLike => ({
  role: 'assistant',
  content: '',
  ...over
});

/** A tool result in the shape the stream sends: `{ id, result }`. */
const toolOk = { id: 't1', result: { ok: true, result: 'Saved' } };
const toolFail = { id: 't1', result: { ok: false, error: 'No changes were applied.' } };

describe('toolResultsOf', () => {
  it('reads the ok flag out of the wrapped result', () => {
    expect(toolResultsOf(assistant({ toolResult: [toolOk] }))).toEqual([
      { ok: true }
    ]);
    expect(toolResultsOf(assistant({ toolResult: [toolFail] }))).toEqual([
      { ok: false }
    ]);
  });

  it('treats a missing ok as a failure, not a success', () => {
    // "Changes applied" is only claimed when a result says `ok:
    // true`. Anything else is not a success.
    expect(
      toolResultsOf(assistant({ toolResult: [{ id: 't1', result: {} }] }))
    ).toEqual([{ ok: false }]);
  });

  it('returns nothing when there is no result', () => {
    expect(toolResultsOf(assistant())).toEqual([]);
    expect(toolResultsOf(null)).toEqual([]);
    expect(toolResultsOf(assistant({ toolResult: 'nope' }))).toEqual([]);
  });
});

describe('deriveAgentState', () => {
  it('shows working while a tool is in flight', () => {
    expect(
      deriveAgentState({
        isStreaming: true,
        toolInFlight: true,
        lastAssistant: null
      })
    ).toBe('working');
  });

  it('shows reading while a reply is streaming', () => {
    expect(
      deriveAgentState({
        isStreaming: true,
        toolInFlight: false,
        lastAssistant: null
      })
    ).toBe('reading');
  });

  it('shows applied when the last tool succeeded', () => {
    expect(
      deriveAgentState({
        isStreaming: false,
        toolInFlight: false,
        lastAssistant: assistant({ toolResult: [toolOk] })
      })
    ).toBe('applied');
  });

  it('shows blocked when the last tool failed', () => {
    expect(
      deriveAgentState({
        isStreaming: false,
        toolInFlight: false,
        lastAssistant: assistant({ toolResult: [toolFail] })
      })
    ).toBe('blocked');
  });

  it('shows blocked when a tool was called but never answered', () => {
    expect(
      deriveAgentState({
        isStreaming: false,
        toolInFlight: false,
        lastAssistant: assistant({
          toolCalls: [{ name: 'editResume', args: {} }]
        })
      })
    ).toBe('blocked');
  });

  it('shows needs-you when the agent ended on a question', () => {
    expect(
      deriveAgentState({
        isStreaming: false,
        toolInFlight: false,
        lastAssistant: assistant({
          content: 'Your Dayforce role has no start date. What was it?'
        })
      })
    ).toBe('needs-you');
  });

  it('shows verdict when the agent ended on a statement', () => {
    expect(
      deriveAgentState({
        isStreaming: false,
        toolInFlight: false,
        lastAssistant: assistant({
          content: 'I moved Dayforce to the top. It is the only role the JD asks for.'
        })
      })
    ).toBe('verdict');
  });

  it('is idle when there is nothing to report', () => {
    expect(
      deriveAgentState({
        isStreaming: false,
        toolInFlight: false,
        lastAssistant: null
      })
    ).toBe('idle');

    expect(
      deriveAgentState({
        isStreaming: false,
        toolInFlight: false,
        lastAssistant: assistant({ content: '   ' })
      })
    ).toBe('idle');
  });
});

describe('agentStateForMessage', () => {
  it('is idle for a user message', () => {
    expect(
      agentStateForMessage({ role: 'user', content: 'shorten my summary' })
    ).toBe('idle');
  });

  it('carries what happened in that turn', () => {
    expect(
      agentStateForMessage(assistant({ toolResult: [toolOk] }))
    ).toBe('applied');
    expect(
      agentStateForMessage(assistant({ toolResult: [toolFail] }))
    ).toBe('blocked');
    expect(
      agentStateForMessage(
        assistant({ toolCalls: [{ name: 'editResume', args: {} }] })
      )
    ).toBe('blocked');
    expect(agentStateForMessage(assistant({ content: 'Done.' }))).toBe('idle');
  });
});

describe('the transient states', () => {
  it('settles the moments but not the modes', () => {
    // A moment announces itself and then gets out of the way, or the
    // user learns to ignore it. `needs-you` is not a moment: the
    // agent is genuinely waiting.
    expect(isTransientAgentState('applied')).toBe(true);
    expect(isTransientAgentState('blocked')).toBe(true);
    expect(isTransientAgentState('verdict')).toBe(true);

    expect(isTransientAgentState('needs-you')).toBe(false);
    expect(isTransientAgentState('idle')).toBe(false);
    expect(isTransientAgentState('reading')).toBe(false);
    expect(isTransientAgentState('working')).toBe(false);
  });

  it('holds a moment long enough to be seen', () => {
    // The check draws over 560ms, so a shorter hold would cut it off
    // mid-draw.
    expect(AGENT_TRANSIENT_MS.applied).toBeGreaterThanOrEqual(900);
    expect(AGENT_TRANSIENT_MS.blocked).toBeGreaterThan(
      AGENT_TRANSIENT_MS.applied ?? 0
    );
  });
});

describe('agentStateLabel', () => {
  it('says nothing when the agent is idle', () => {
    expect(agentStateLabel('idle')).toBeNull();
  });

  it('says something for every other state', () => {
    for (const state of [
      'reading',
      'working',
      'verdict',
      'applied',
      'needs-you',
      'blocked'
    ] as const) {
      const label = agentStateLabel(state);
      expect(label, `no label for ${state}`).toBeTruthy();
      expect(label!.length).toBeGreaterThan(0);
    }
  });
});
