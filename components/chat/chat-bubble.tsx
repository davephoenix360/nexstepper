'use client';

import { useRouter } from 'next/navigation';
import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ChatWindow } from './chat-window';
import { AgentMark } from '@/components/brand/agent-mark';
import { useAgentMarkState } from '@/components/brand/use-agent-mark-state';
import { AGENT_DISPLAY_NAME } from '@/lib/brand/agent-mark';
import { useChatStream } from './use-chat-stream';
import { type ChatMessageRow } from './use-chat-stream';
import {
  FEEDBACK_PILL_WITH_TRIGGER_BOTTOM_PX,
  FLOATING_FEEDBACK_BOTTOM_VAR,
  feedbackPillBottomWithBubble
} from '@/lib/ui/floating-actions';
import { AgentIntroBubble } from './agent-intro-bubble';
import { useChatHandoff } from './chat-handoff-provider';
import { markAgentIntroSeen } from '@/lib/chat/agent-intro';
import { suggestedPrompts } from '@/lib/chat/suggested-prompts';

interface ChatSessionSummary {
  id: string;
  title: string;
  updatedAt: string | Date;
}

interface ChatBubbleProps {
  resumeId: string;
  resumeName: string;
  isPro: boolean;
  /**
   * The plan's daily turn allowance, or `null` on an unlimited plan.
   *
   * This comes from `PLANS` on the server, not from a string in the
   * chat UI. The badge used to hard-code "20/day", so the number on
   * screen could drift from the number the server enforces — and the
   * server's number is the one that decides when a turn is rejected.
   */
  dailyLimit?: number | null;
  /**
   * The user-facing name of the model that will answer this chat, e.g.
   * "Claude Haiku 5.5". Resolved on the server from the same constants
   * the chain is built from.
   */
  modelLabel?: string | null;
  /**
   * Whether the resume has a job description attached. Decides whether
   * the suggestion chips are JD-specific or general craft prompts.
   */
  hasJobContext?: boolean;
  /**
   * A prompt to run automatically, once, when the chat opens — used
   * right after a variant is created from a JD so the tailoring pass
   * happens without the user having to ask for it.
   */
  autoPrompt?: string;
}

export function ChatBubble({
  resumeId,
  resumeName,
  isPro,
  dailyLimit = null,
  modelLabel = null,
  hasJobContext = false,
  autoPrompt
}: ChatBubbleProps) {
  const router = useRouter();
  // Bullet attention icons publish repeatable requests here. Unlike the
  // one-shot `autoPrompt`, every click is a fresh turn — including clicks
  // while the panel is already open and after earlier turns.
  const { currentRequest, consumeHandoff } = useChatHandoff();
  const [isOpen, setIsOpen] = useState(false);
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessageRow[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  /**
   * Whether a tool has been announced and its result has not arrived
   * yet.
   *
   * This is the one thing the message list cannot tell us: a tool
   * call and its result are separate stream events, so there is a
   * window — the agent is actually doing the thing — where the
   * message list shows a tool call with no result yet. That window
   * is exactly the `working` state.
   */
  const [toolInFlight, setToolInFlight] = useState(false);
  // Quota readout state. Seeded to `null` (unknown) rather than a
  // fabricated `{ limit: 20, used: 0 }` — the server is the only
  // authority on the real count, and it reports it via the
  // `X-Chat-Usage` / `X-Chat-Limit` response headers after every turn.
  // Before this, the readout always showed the full allowance because
  // the local `used` counter was never incremented (plan:
  // docs/plans/chat-hardening-and-cta.md §Q4).
  const [rateLimit, setRateLimit] = useState<{ limit: number; used: number } | null>(
    isPro ? null : null
  );
  // Server-supplied rejection reason for the last send (e.g. the daily
  // token cap). Separate from `rateLimit` because the readout is a TURN
  // counter and is `null` on an unlimited-turn Pro plan — so without
  // this the cap would reject a send with nothing on screen.
  const [notice, setNotice] = useState<string | null>(null);

  /**
   * The introduction bubble's measured height, or 0 when it is down.
   *
   * The bubble sits directly above the trigger, which is where the
   * floating Feedback pill wants to be — so while the bubble is up, the
   * pill's published offset is computed from this height and the pill
   * steps above it. Measured rather than assumed, because the copy
   * wraps differently at different widths.
   */
  const [introBubbleHeightPx, setIntroBubbleHeightPx] = useState(0);

  const handleIntroHeightChange = useCallback((px: number) => {
    setIntroBubbleHeightPx((current) => (current === px ? current : px));
  }, []);

  /**
   * One refresh for every server mutation in a turn.
   *
   * A surgical bullet edit emits BOTH `resume_updated` (a revision was
   * written) and `score_updated` (the snapshot was recomputed). Calling
   * `router.refresh()` from both callbacks produced two RSC round trips
   * and a visible flicker. The server now AWAITS the recompute between
   * those events, so the refresh is held until the score settles — a
   * macrotask alone would flush on `resume_updated` and read a stale
   * snapshot. One macrotask then collapses the settled pair.
   */
  const refreshScheduledRef = useRef(false);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mutationRefreshPendingRef = useRef(false);
  const scheduleRefresh = useCallback(() => {
    if (refreshScheduledRef.current) return;
    refreshScheduledRef.current = true;
    refreshTimerRef.current = setTimeout(() => {
      refreshTimerRef.current = null;
      refreshScheduledRef.current = false;
      router.refresh();
    }, 0);
  }, [router]);
  const flushPendingMutationRefresh = useCallback(() => {
    if (!mutationRefreshPendingRef.current) return;
    mutationRefreshPendingRef.current = false;
    scheduleRefresh();
  }, [scheduleRefresh]);

  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, []);

  // Portal target only exists on the client. Wait for mount so SSR
  // doesn't crash on `document.body`.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  /**
   * Tell the floating Feedback pill to step up out of our way.
   *
   * Both are fixed elements in the bottom-right corner: this trigger
   * is a 56px circle at `bottom-6 right-6`, and the feedback pill
   * wanted `bottom-4 right-4`. They overlapped, and this trigger
   * (z-50) sat on top of the pill (z-30) — hiding most of the
   * "Feedback" label.
   *
   * The two are mounted by different components (the pill by the
   * dashboard layout, this trigger by the editor page), so the pill
   * cannot know about us. A custom property on the root element
   * bridges them without coupling them in React: the pill reads it,
   * and the browser repaints when it changes. Removing it on unmount
   * puts the pill back at its own low position.
   *
   * The offset itself lives in `lib/ui/floating-actions.ts` so the
   * trigger, the pill and the panel all agree.
   *
   * It also has to clear the agent's INTRODUCTION BUBBLE when that is
   * up — the bubble sits directly above the trigger, which is exactly
   * where the pill wanted to be. The bubble's measured height is what
   * the pill's offset is computed from.
   */
  useEffect(() => {
    const root = document.documentElement;
    const offset =
      introBubbleHeightPx > 0
        ? feedbackPillBottomWithBubble(introBubbleHeightPx)
        : FEEDBACK_PILL_WITH_TRIGGER_BOTTOM_PX;
    root.style.setProperty(FLOATING_FEEDBACK_BOTTOM_VAR, `${offset}px`);
    return () => {
      root.style.removeProperty(FLOATING_FEEDBACK_BOTTOM_VAR);
    };
  }, [introBubbleHeightPx]);

  /**
   * Auto-run the tailoring prompt.
   *
   * When a variant is created from a job description we already know
   * what the user wants next — it is the prompt they would have typed
   * first ("fine tune this for this JD, one to two pages, keep only the
   * relevant stuff, improve the ATS score"). Running it for them is the
   * whole point of the product: the alternative is that they copy the
   * resume and the JD into a generic chatbot and get prose back.
   *
   * Two guards:
   *   - the chat OPENS itself, because the session list is only
   *     fetched when the panel is open and the auto-run needs to know
   *     whether there is already a conversation;
   *   - it only fires when this resume has NO chat history yet, so a
   *     reload of the variant page does not re-run the tailoring and
   *     create a second session.
   */
  const autoSendFiredRef = useRef(false);
  /**
   * Handoff requests are repeatable, so the queue provider removes a
   * request as soon as we start it. This set is the second line of defence:
   * React re-renders during a streaming turn (messages, usage, tool state),
   * and a re-run of the effect below must never send the same turn twice.
   */
  const handoffHandledIdsRef = useRef<Set<string>>(new Set());
  /** Once a handoff has been consumed, the one-shot auto-prompt stands down. */
  const handoffConsumedRef = useRef(false);
  const [sessionsLoaded, setSessionsLoaded] = useState(false);
  /**
   * The session whose message history has finished loading. `sessionsLoaded`
   * only means the session LIST arrived — auto-selecting a session starts a
   * second request, and sending before that one lands both uses an empty
   * transcript and lets its late response replace the new turn.
   */
  const [historyReadySessionId, setHistoryReadySessionId] = useState<
    string | null | undefined
  >(undefined);
  /**
   * `onDone` fires before `sendMessage` returns and assigns a new session
   * id. A queued handoff must wait for the whole `handleSend` call, or it
   * can be sent against the previous id in the render between those two.
   */
  const [sendSettled, setSendSettled] = useState(true);

  useEffect(() => {
    if (!autoPrompt) return;
    setIsOpen(true);
  }, [autoPrompt]);

  // Hydrate: load sessions on open
  useEffect(() => {
    if (!isOpen) return;
    fetch(`/api/chat?resumeId=${resumeId}`)
      .then((r) => r.json())
      .then((data: { sessions?: ChatSessionSummary[] }) => {
        const list = data.sessions ?? [];
        setSessions(list);
        // Auto-select the most recent session on first open.
        setActiveSessionId((prev) => prev ?? list[0]?.id ?? null);
        setSessionsLoaded(true);
      })
      .catch(() => setSessionsLoaded(true));
  }, [isOpen, resumeId]);

  // Load messages when activeSessionId changes (session selected from sidebar
  // OR auto-selected on open). Uses an AbortController + a session-id ref so
  // rapid clicks don't let a stale fetch from an old session overwrite the
  // current session's messages.
  const loadAbortRef = useRef<AbortController | null>(null);
  /**
   * A send invalidates any history load in flight. The request itself can
   * finish, but its response must not overwrite the turn just seeded into
   * the transcript — checking the session id alone is not enough when the
   * send stays in that same session.
   */
  const historyLoadIdRef = useRef(0);
  useEffect(() => {
    if (!isOpen || !activeSessionId) {
      if (!activeSessionId) setMessages([]);
      historyLoadIdRef.current += 1;
      setHistoryReadySessionId(null);
      return;
    }
    // Cancel any in-flight load
    loadAbortRef.current?.abort();
    const ctrl = new AbortController();
    loadAbortRef.current = ctrl;
    const loadId = ++historyLoadIdRef.current;
    const targetId = activeSessionId;
    setMessages([]); // clear while loading so we don't flash the wrong convo
    setHistoryReadySessionId(undefined);
    const historyIsCurrent = () =>
      !ctrl.signal.aborted &&
      loadId === historyLoadIdRef.current &&
      targetId === activeSessionIdRef.current;
    fetch(`/api/chat?resumeId=${resumeId}&sessionId=${targetId}`, {
      signal: ctrl.signal
    })
      .then((r) => r.json())
      .then((data: { messages?: ChatMessageRow[] }) => {
        if (!historyIsCurrent()) return;
        setMessages(data.messages ?? []);
        setHistoryReadySessionId(targetId);
      })
      .catch((err) => {
        if (err?.name !== 'AbortError') {
          // Silent — switching sessions mid-load is the common case,
          // and the next session click will retry.
          void err;
        }
        if (historyIsCurrent()) setHistoryReadySessionId(targetId);
      });
  }, [isOpen, activeSessionId, resumeId]);

  // Keep a ref of the latest activeSessionId so the load handler above can
  // detect stale fetches without needing activeSessionId in its deps (which
  // would cause a re-fetch loop).
  const activeSessionIdRef = useRef<string | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability -- "latest value" ref; the React Compiler is not enabled (next.config.ts)
    activeSessionIdRef.current = activeSessionId;
  }, [activeSessionId]);

  const { sendMessage, cancel } = useChatStream({
    resumeId,
    resumeName,
    onMessage: setMessages,
    onDone: () => {
      setIsStreaming(false);
      setToolInFlight(false);
      // Non-scoring edits emit `resume_updated` with no score event. Don't
      // leave their refresh held forever.
      flushPendingMutationRefresh();
    },
    onToolCall: () => setToolInFlight(true),
    onToolResult: () => setToolInFlight(false),
    onUsage: (usage) => {
      // Hide the readout entirely for unlimited plans; otherwise track
      // the server's authoritative count.
      setRateLimit(
        Number.isFinite(usage.limit) ? { limit: usage.limit, used: usage.used } : null
      );
    },
    onResumeUpdated: () => {
      // The assistant just wrote a revision to this resume. Hold the
      // refresh until the score side of a bullet edit settles (success or
      // failure), then flush one RSC round trip for the whole turn.
      mutationRefreshPendingRef.current = true;
    },
    onScoreUpdated: () => {
      // A successful single-bullet edit recomputed the persisted snapshot.
      // The attention icons and the scorecard are rendered from server
      // data, so without a refresh the old marker would outlive its fix.
      mutationRefreshPendingRef.current = false;
      scheduleRefresh();
    },
    onScoreRefreshFailed: () => {
      // The revision is saved; only the snapshot is stale. Refresh the
      // edit now and point the user at the scorecard's Recompute control.
      mutationRefreshPendingRef.current = false;
      scheduleRefresh();
      setNotice(
        'Your edit was saved, but the ATS score could not be refreshed. Use Recompute in the scorecard to try again.'
      );
    },
    onError: (err: string, code?: string, limit?: number | null) => {
      setIsStreaming(false);
      flushPendingMutationRefresh();
      if (code === 'RATE_LIMITED') {
        // The server sends the post-consume `limit` (or null for
        // unlimited plans) in the 429 JSON. Fall back to the previous
        // on-usage value if the server response didn't include one,
        // so we don't blank out the readout on a transient race.
        if (limit === null) {
          setRateLimit(null);
        } else if (typeof limit === 'number' && Number.isFinite(limit)) {
          setRateLimit({ limit, used: limit });
        } else if (rateLimit) {
          setRateLimit({ ...rateLimit, used: rateLimit.limit });
        }
      }
      // The daily token cap. Turn limits already explain themselves via
      // the readout above; this one has no readout on a Pro plan, so the
      // server's message is the only thing telling the user why their
      // send did nothing.
      setNotice(code === 'TOKEN_LIMIT_REACHED' ? err : null);
    }
  });

  const handleNewChat = useCallback(() => {
    setActiveSessionId(null);
    setMessages([]);
  }, []);

  const handleSend = useCallback(
    async (content: string) => {
      setSendSettled(false);
      setIsStreaming(true);
      // A new turn starts from a clean slate: whatever the previous
      // turn was doing is over.
      setToolInFlight(false);
      // Clear the previous rejection notice optimistically — a fresh
      // attempt that succeeds must not leave a stale "you've used
      // today's allowance" banner sitting above the composer.
      setNotice(null);
      // A late history response would replace the pair `sendMessage` is
      // about to seed. Invalidate that load without aborting it.
      historyLoadIdRef.current += 1;
      // Pass the live transcript so the hook APPENDS to it. Without this the
      // hook seeded its own two-message array and the whole conversation
      // disappeared from the panel the moment you sent anything.
      try {
        const sessionId = await sendMessage(activeSessionId, content, messages);
        if (sessionId) {
          setActiveSessionId(sessionId);
          // Refresh sessions so the new one appears in the sidebar
          fetch(`/api/chat?resumeId=${resumeId}`)
            .then((r) => r.json())
            .then((data: { sessions?: ChatSessionSummary[] }) => {
              if (data.sessions) setSessions(data.sessions);
            })
            .catch(() => {});
        } else {
          setIsStreaming(false);
        }
      } finally {
        // `onDone` clears `isStreaming` before the await above returns. A
        // queued handoff must not run in that gap with the OLD session id.
        setSendSettled(true);
      }
    },
    [activeSessionId, sendMessage, resumeId, messages]
  );

  /**
   * Consume bullet-attention handoffs through the SAME send path a typed
   * message uses: same auth, quota, model chain, SSE persistence and error
   * handling. No second API route and no plan gate.
   *
   * Order matters here. This effect is declared BEFORE the auto-prompt
   * effect, so a handoff sets `handoffConsumedRef` first and the one-shot
   * tailoring prompt cannot also fire on that mount.
   */
  useEffect(() => {
    if (!currentRequest) return;

    // Opening the panel also retires the intro bubble — it would sit on
    // top of a conversation the user just asked for.
    markAgentIntroSeen();
    setIsOpen(true);

    // The session list is fetched on open. Sending before it resolves
    // would use a null session id even when this resume has history.
    if (!sessionsLoaded) return;
    // Selecting an existing session starts a SECOND request for its
    // messages. Wait for that one too — otherwise the handoff sends with
    // an empty transcript and the late history response erases the turn.
    if (activeSessionId && historyReadySessionId !== activeSessionId) return;
    // `sendMessage` aborts any in-flight request. Wait for the current
    // turn to finish instead of killing it; the provider keeps this
    // request queued until then. `sendSettled` also covers the gap after
    // `onDone` where the new session id has not been assigned yet.
    if (isStreaming || !sendSettled) return;

    if (handoffHandledIdsRef.current.has(currentRequest.id)) {
      consumeHandoff(currentRequest.id);
      return;
    }

    // Mark handled BEFORE awaiting: the re-render at the start of the
    // send would otherwise run this effect again with the same request.
    handoffHandledIdsRef.current.add(currentRequest.id);
    handoffConsumedRef.current = true;
    consumeHandoff(currentRequest.id);
    void handleSend(currentRequest.prompt);
  }, [
    currentRequest,
    sessionsLoaded,
    activeSessionId,
    historyReadySessionId,
    isStreaming,
    sendSettled,
    handleSend,
    consumeHandoff
  ]);

  // Fire the auto-run once the session list has loaded and we know
  // there is no existing conversation to append to.
  useEffect(() => {
    if (handoffConsumedRef.current) return;
    if (!autoPrompt || !isOpen || !sessionsLoaded) return;
    if (autoSendFiredRef.current) return;
    if (sessions.length > 0) return; // already has history — do not re-run
    autoSendFiredRef.current = true;
    void handleSend(autoPrompt);
  }, [autoPrompt, isOpen, sessionsLoaded, sessions.length, handleSend]);


  /**
   * The agent's live state, for the mark.
   *
   * The last assistant message is the anchor: it is what the agent
   * last DID, and it survives a page reload — so the mark can greet
   * you with "waiting for you" if the agent's last word was a
   * question you never answered.
   */
  const lastAssistant = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') return messages[i];
    }
    return null;
  }, [messages]);

  const agentState = useAgentMarkState({
    isStreaming,
    toolInFlight,
    lastAssistant
  });
  const handleSelectSession = useCallback((id: string) => {
    // The messages-load useEffect will pick up the id change and fetch.
    setActiveSessionId(id);
  }, []);

  // Floating UI (trigger + optional window). We portal it to `document.body`
  // so that any sticky / transformed ancestor (e.g. the dashboard right rail
  // with `lg:sticky lg:top-4`) can't trap the `position: fixed` descendants
  // inside its bounding box.
  /**
   * Open the agent.
   *
   * Opening it counts as having seen it, so the introduction bubble
   * stops coming back for a day. The bubble's own invitation calls
   * this too.
   */
  const openAgent = useCallback(() => {
    markAgentIntroSeen();
    setIsOpen(true);
  }, []);

  const toggleOpen = useCallback(() => {
    if (isOpen) {
      setIsOpen(false);
    } else {
      openAgent();
    }
  }, [isOpen, openAgent]);

  const floatingUi = (
    <>
      <button
        onClick={toggleOpen}
        aria-label={
          isOpen
            ? `Close ${AGENT_DISPLAY_NAME}, the AI assistant`
            : `Open ${AGENT_DISPLAY_NAME}, the AI assistant`
        }
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-lg transition-all hover:border-border hover:shadow-xl hover:scale-105 active:scale-95 no-print"
        style={{ bottom: '1.5rem', right: '1.5rem' }}
      >
        {isOpen ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          // The brand mark, not a chat bubble. The bubble said
          // "chat"; the mark says "an agent that has already read
          // your resume".
          //
          // In its NATIVE colouring — navy brackets, indigo dot — on
          // a white button. It used to be a solid indigo circle, but
          // that forced the mark to be all white, and an all-white
          // 30px mark on indigo reads as a blob. The mark is more
          // legible in its own colours than the button is.
          <AgentMark state={agentState} size={30} className="text-foreground" />
        )}
      </button>

      {isOpen && (
        <ChatWindow
          agentState={agentState}
          resumeName={resumeName}
          isPro={isPro}
          dailyLimit={dailyLimit}
          modelLabel={modelLabel}
          sessions={sessions}
          activeSessionId={activeSessionId}
          messages={messages}
          isStreaming={isStreaming}
          rateLimit={rateLimit}
          notice={notice}
          suggestedPrompts={suggestedPrompts(hasJobContext)}
          onClose={() => setIsOpen(false)}
          onNewChat={handleNewChat}
          onSend={handleSend}
          onCancel={cancel}
          onSelectSession={handleSelectSession}
        />
      )}

      {/* The agent's introduction — a speech bubble above the trigger,
          for a user who has been on the resume a while and never
          noticed the assistant was there. It hides itself the moment
          the agent opens, and it reports its height so the floating
          Feedback pill can step above it. */}
      <AgentIntroBubble
        dailyLimit={dailyLimit}
        agentOpen={isOpen}
        onOpen={openAgent}
        onHeightChange={handleIntroHeightChange}
      />
    </>
  );

  if (!mounted) return null;
  return createPortal(floatingUi, document.body);
}
