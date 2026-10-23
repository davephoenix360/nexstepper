/**
 * @vitest-environment jsdom
 *
 * Tests for the agent mark's live-state hook.
 *
 * ## What this pins
 *
 *   1. A MOMENT state (the agent found something, the change landed, a
 *      tool failed) announces itself and then settles back to idle. If
 *      it did not, the user would learn to ignore it.
 *   2. A MODE state (reading, working, needs-you) holds until the
 *      agent moves on.
 *   3. A new turn CANCELS the previous turn's pending settle. The
 *      timer belongs to the state that started it, not to the hook.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { useAgentMarkState } from '@/components/brand/use-agent-mark-state';
import {
  AGENT_TRANSIENT_MS,
  type AgentActivity
} from '@/lib/brand/agent-mark';

const idle: AgentActivity = { isStreaming: false, toolInFlight: false };

describe('useAgentMarkState', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the derived state straight away', () => {
    const { result } = renderHook(() =>
      useAgentMarkState({ ...idle, isStreaming: true })
    );
    expect(result.current).toBe('reading');
  });

  it('settles a moment back to idle', () => {
    const { result, rerender } = renderHook(
      (activity: AgentActivity) => useAgentMarkState(activity),
      {
        initialProps: {
          ...idle,
          lastAssistant: {
            role: 'assistant',
            content: 'I moved Dayforce to the top.',
            toolResult: [{ id: 't1', result: { ok: true } }]
          }
        } as AgentActivity
      }
    );

    expect(result.current).toBe('applied');

    act(() => {
      vi.advanceTimersByTime(AGENT_TRANSIENT_MS.applied! + 50);
    });
    expect(result.current).toBe('idle');
  });

  it('holds a mode until the agent moves on', () => {
    const { result } = renderHook(() =>
      useAgentMarkState({
        ...idle,
        lastAssistant: {
          role: 'assistant',
          content: 'What was your start date?'
        }
      })
    );

    expect(result.current).toBe('needs-you');

    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    // Still waiting on the user — the agent did not forget.
    expect(result.current).toBe('needs-you');
  });

  it('cancels the previous settle when a new turn starts', () => {
    const { result, rerender } = renderHook(
      (activity: AgentActivity) => useAgentMarkState(activity),
      {
        initialProps: {
          ...idle,
          lastAssistant: {
            role: 'assistant',
            content: 'Done.',
            toolResult: [{ id: 't1', result: { ok: true } }]
          }
        } as AgentActivity
      }
    );

    expect(result.current).toBe('applied');

    // A new turn starts before the moment has settled.
    rerender({ ...idle, isStreaming: true } as AgentActivity);
    expect(result.current).toBe('reading');

    // The old timer must not fire and knock the new state back.
    act(() => {
      vi.advanceTimersByTime(AGENT_TRANSIENT_MS.applied! + 50);
    });
    expect(result.current).toBe('reading');
  });
});
