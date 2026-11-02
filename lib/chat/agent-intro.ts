/**
 * The assistant's introduction bubble.
 *
 * ## Why it exists
 *
 * A real user built a master resume, made a variant for a pasted job
 * description, got an ATS score of ~49 — and never noticed the AI
 * assistant existed. The trigger is a 56px mark in the bottom-right
 * corner of the editor, and nothing on the page says what it is.
 *
 * So the agent introduces itself: a speech bubble above the trigger,
 * once the user has been on the resume long enough to have looked at
 * it and not opened the assistant.
 *
 * ## Why the rules are in a module and not in the component
 *
 * "Should the bubble show?" is a decision with three inputs (has the
 * user seen the agent, have they dismissed this bubble, how long has
 * it been) and it is the part that is easy to get wrong. A bubble that
 * nags is worse than no bubble, so the suppression windows live here,
 * as a pure predicate, with the windows named.
 *
 * ## The windows
 *
 * - **Never shown** → show it. Someone who has never seen the agent is
 *   exactly who it is for.
 * - **Opened in the last 24h** → don't. They used it; they know.
 * - **Dismissed in the last 7 days** → don't. They said no.
 * - Otherwise → show it again. A week of not using the assistant is
 *   a reason to mention it once more.
 */

import { AGENT_DISPLAY_NAME } from '@/lib/brand/agent-mark';

/**
 * How long the user has to settle before the bubble appears.
 *
 * Long enough that it never interrupts someone who has only just
 * arrived and is still orienting; short enough that it lands before
 * they finish reading the resume they came to read.
 */
export const AGENT_INTRO_DELAY_MS = 45_000;

/** After the agent has been opened, stay quiet for a day. */
export const AGENT_INTRO_SEEN_SUPPRESS_MS = 24 * 60 * 60 * 1000;

/** After an explicit dismissal, stay quiet for a week. */
export const AGENT_INTRO_DISMISSED_SUPPRESS_MS = 7 * 24 * 60 * 60 * 1000;

/** Where the bubble's state is kept between visits. */
export const AGENT_INTRO_STORAGE_KEY = 'nexstepper:agent-intro';

export type AgentIntroState = {
  /** Schema version — a bump discards an unreadable older shape. */
  v: 1;
  /** When the user last opened the agent. */
  seenAt?: number;
  /** When the user last dismissed the bubble. */
  dismissedAt?: number;
};

/**
 * Should the bubble be showing right now?
 *
 * `null` state means we have never recorded anything about this
 * browser — first visit, or storage was unavailable. Show it.
 */
export function shouldShowAgentIntro(
  state: AgentIntroState | null,
  now: number = Date.now()
): boolean {
  if (!state) return true;
  if (
    typeof state.dismissedAt === 'number' &&
    now - state.dismissedAt < AGENT_INTRO_DISMISSED_SUPPRESS_MS
  ) {
    return false;
  }
  if (
    typeof state.seenAt === 'number' &&
    now - state.seenAt < AGENT_INTRO_SEEN_SUPPRESS_MS
  ) {
    return false;
  }
  return true;
}

/**
 * Read the stored state.
 *
 * A corrupt or foreign-shaped entry is treated as "never seen" rather
 * than as an error — showing the bubble again is the harmless
 * direction, and a throw here would take the editor down.
 */
export function readAgentIntroState(): AgentIntroState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(AGENT_INTRO_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AgentIntroState;
    if (!parsed || parsed.v !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeAgentIntroState(next: AgentIntroState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(AGENT_INTRO_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable (private browsing, sandboxed iframe). The
    // bubble will show again next visit, which is the safe direction.
  }
}

/** Record that the user opened the agent. */
export function markAgentIntroSeen(now: number = Date.now()): void {
  const current = readAgentIntroState();
  writeAgentIntroState({ ...(current ?? { v: 1 }), v: 1, seenAt: now });
}

/** Record that the user dismissed the bubble on purpose. */
export function markAgentIntroDismissed(now: number = Date.now()): void {
  const current = readAgentIntroState();
  writeAgentIntroState({ ...(current ?? { v: 1 }), v: 1, dismissedAt: now });
}

/* ------------------------------------------------------------------ */
/* Copy                                                                */
/* ------------------------------------------------------------------ */

/**
 * The bubble's headline.
 *
 * It uses `AGENT_DISPLAY_NAME` rather than a literal, because the
 * agent's name is one string in one place — a rename must not leave a
 * second copy of it in a speech bubble.
 */
export const AGENT_INTRO_HEADLINE = `I'm ${AGENT_DISPLAY_NAME}.`;

/**
 * The bubble's body.
 *
 * It leads with the thing the user came here for (the score), says what
 * the agent will do about it, and stops there. It does NOT promise to
 * edit: the agent's job here is the diagnosis, and the free chain
 * edits in 3 of 5 attempts — so promising an edit would be promising
 * something it does not always do.
 */
export const AGENT_INTRO_BODY =
  'Want to improve your ATS score? I can tell you exactly which requirements this resume is missing — and help you fix them.';

/**
 * The extra line a Free user sees, naming their allowance.
 *
 * The number comes from the caller (`PLANS.free.chatMessagesPerDay`),
 * not from a literal here — the badge and the server's gate have to
 * agree, and this is the third place that could disagree.
 */
export function agentIntroAllowanceLine(dailyLimit: number): string {
  return `Your free plan includes ${dailyLimit} messages a day.`;
}
