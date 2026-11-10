'use client';

/**
 * The assistant's introduction bubble.
 *
 * ## Why this exists
 *
 * A user built a master resume, made a variant for a pasted job
 * description, scored 49 on the ATS check — and never noticed the AI
 * assistant existed. The trigger is a 56px mark in the bottom-right
 * corner and nothing on the page says what it is.
 *
 * So the agent introduces itself. After a short wait (so it never
 * interrupts someone who has only just arrived), a speech bubble
 * appears directly above the trigger with a tail pointing at it, and
 * says what it can do.
 *
 * ## What this component does NOT decide
 *
 * *Whether* to show is `shouldShowAgentIntro` in `lib/chat/agent-intro.ts`
 * — a pure predicate with the suppression windows named. This file is
 * the view and the timing.
 *
 * ## Where it sits
 *
 * Directly above the trigger, at `AGENT_INTRO_BUBBLE_BOTTOM_PX`. The
 * space there belongs to the floating Feedback pill, so while this
 * bubble is up the trigger publishes a LARGER offset for the pill and
 * the pill steps above it. The mechanism is the one that already
 * exists (see `lib/ui/floating-actions.ts`); this bubble does not
 * invent a second one.
 *
 * The bubble's height is MEASURED, not assumed — the copy wraps
 * differently at different widths, and a stale constant would drop the
 * pill back on top of it.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

import { AgentMark } from '@/components/brand/agent-mark';
import {
  AGENT_INTRO_BODY,
  AGENT_INTRO_DELAY_MS,
  AGENT_INTRO_HEADLINE,
  agentIntroAllowanceLine,
  markAgentIntroDismissed,
  readAgentIntroState,
  shouldShowAgentIntro
} from '@/lib/chat/agent-intro';
import {
  AGENT_INTRO_BUBBLE_BOTTOM_PX,
  FLOATING_RIGHT_PX
} from '@/lib/ui/floating-actions';

export interface AgentIntroBubbleProps {
  /**
   * The plan's daily turn allowance, or `null` on an unlimited plan.
   * A Free user is told their allowance here — the badge in the chat
   * panel only appears once the panel is OPEN, which is exactly the
   * person who never knew the assistant was there.
   */
  dailyLimit?: number | null;
  /** Whether the agent panel is open. The bubble never shows while it is. */
  agentOpen: boolean;
  /** Called when the user takes the bubble's invitation. */
  onOpen: () => void;
  /** Called with the bubble's measured height, so the pill can step aside. */
  onHeightChange: (px: number) => void;
}

export function AgentIntroBubble({
  dailyLimit = null,
  agentOpen,
  onOpen,
  onHeightChange
}: AgentIntroBubbleProps) {
  const [visible, setVisible] = useState(false);
  const [entered, setEntered] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const dismiss = useCallback(() => {
    setVisible(false);
    markAgentIntroDismissed();
  }, []);

  // Wait, then decide. The timer restarts if the panel opens and closes
  // again, which is fine: the agent has been seen by then.
  useEffect(() => {
    if (agentOpen) return;
    const timer = window.setTimeout(() => {
      if (shouldShowAgentIntro(readAgentIntroState())) setVisible(true);
    }, AGENT_INTRO_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [agentOpen]);

  // The agent opened: the bubble has done its job.
  useEffect(() => {
    if (agentOpen) setVisible(false);
  }, [agentOpen]);

  // Measure. A ResizeObserver rather than a constant, because the copy
  // wraps at different widths and the pill's offset depends on it.
  // Reporting 0 when the bubble is down puts the pill back.
  useEffect(() => {
    if (!visible) {
      onHeightChange(0);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const report = () => onHeightChange(el.getBoundingClientRect().height);
    report();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(report);
    observer.observe(el);
    return () => observer.disconnect();
  }, [visible, onHeightChange]);

  // Escape dismisses, and so does a click anywhere outside the bubble.
  // A coach mark that only goes away when you find its × is a coach
  // mark people learn to ignore.
  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss();
    };
    const onPointerDown = (e: PointerEvent | MouseEvent) => {
      const el = ref.current;
      if (!el) return;
      const target = e.target as Node | null;
      if (target && el.contains(target)) return;
      dismiss();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [visible, dismiss]);

  // Fade + lift in on the frame after mount, so the transition runs.
  useEffect(() => {
    if (!visible) {
      setEntered(false);
      return;
    }
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      ref={ref}
      role="status"
      aria-live="polite"
      data-testid="agent-intro-bubble"
      className={`no-print fixed z-50 w-72 rounded-2xl border border-border bg-card p-4 text-left shadow-xl transition-all duration-200 motion-reduce:transition-none ${
        entered ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
      }`}
      style={{
        right: `${FLOATING_RIGHT_PX}px`,
        bottom: `${AGENT_INTRO_BUBBLE_BOTTOM_PX}px`
      }}
    >
      {/* The tail — a small rotated square pointing down at the
          trigger. It sits in the 16px gap between the bubble and the
          trigger, so it never reaches the Feedback pill. */}
      <span
        aria-hidden="true"
        className="absolute -bottom-[5px] right-6 h-3 w-3 rotate-45 rounded-[2px] border-b border-r border-border bg-card"
      />

      <div className="flex items-start gap-2.5">
        {/* The agent's own mark, so the bubble is visibly the same
            thing as the button below it. */}
        <AgentMark state="idle" size={28} className="mt-0.5 shrink-0 text-foreground" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">{AGENT_INTRO_HEADLINE}</p>
          <p className="mt-1 text-sm leading-snug text-muted-foreground">{AGENT_INTRO_BODY}</p>
          {dailyLimit !== null && (
            <p className="mt-1.5 text-xs text-muted-foreground">
              {agentIntroAllowanceLine(dailyLimit)}
            </p>
          )}
          <button
            type="button"
            onClick={onOpen}
            data-testid="agent-intro-open"
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-300/60"
          >
            Show me
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        data-testid="agent-intro-dismiss"
        className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
