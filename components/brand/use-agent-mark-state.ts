'use client';

import { useEffect, useState } from 'react';

import {
  AGENT_TRANSIENT_MS,
  deriveAgentState,
  type AgentActivity,
  type AgentMarkState
} from '@/lib/brand/agent-mark';

/**
 * The live state of the agent's mark.
 *
 * The derivation itself is pure and lives in `lib/brand/agent-mark.ts`.
 * This hook adds the one thing that cannot be pure: SETTLING.
 *
 * Three of the seven states are MOMENTS — the agent found something,
 * the change landed, the tool failed. Those have to announce
 * themselves and then get out of the way, or the mark would sit there
 * amber forever after one finding and the user would learn to ignore
 * it.
 *
 * `needs-you` is deliberately not one of them: the agent is genuinely
 * waiting for an answer, and it stays in that state until the user
 * replies.
 *
 * The effect depends on the DERIVED state (a string), not on the
 * activity object, so a parent re-render cannot restart the timer and
 * keep a moment alive forever.
 */
export function useAgentMarkState(activity: AgentActivity): AgentMarkState {
  const derived = deriveAgentState(activity);
  const [state, setState] = useState<AgentMarkState>(derived);

  useEffect(() => {
    setState(derived);

    const hold = AGENT_TRANSIENT_MS[derived];
    if (!hold) return;

    const timer = window.setTimeout(() => {
      // Only settle if the derived state has not moved on in the
      // meantime — a new turn should not be cancelled by the timer
      // belonging to the previous one.
      setState((current) => (current === derived ? 'idle' : current));
    }, hold);

    return () => window.clearTimeout(timer);
  }, [derived]);

  return state;
}
