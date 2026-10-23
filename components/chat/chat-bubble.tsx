'use client';

import { useRouter } from 'next/navigation';
import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ChatWindow } from './chat-window';
import { AgentMark } from '@/components/brand/agent-mark';
import { useAgentMarkState } from '@/components/brand/use-agent-mark-state';
import { useChatStream } from './use-chat-stream';
import { type ChatMessageRow } from './use-chat-stream';
import {
  FEEDBACK_PILL_WITH_TRIGGER_BOTTOM_PX,
  FLOATING_FEEDBACK_BOTTOM_VAR
} from '@/lib/ui/floating-actions';
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
  hasJobContext = false,
  autoPrompt
}: ChatBubbleProps) {
  const router = useRouter();
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
   */
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty(
      FLOATING_FEEDBACK_BOTTOM_VAR,
      `${FEEDBACK_PILL_WITH_TRIGGER_BOTTOM_PX}px`
    );
    return () => {
      root.style.removeProperty(FLOATING_FEEDBACK_BOTTOM_VAR);
    };
  }, []);

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
  const [sessionsLoaded, setSessionsLoaded] = useState(false);

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
  useEffect(() => {
    if (!isOpen || !activeSessionId) {
      if (!activeSessionId) setMessages([]);
      return;
    }
    // Cancel any in-flight load
    loadAbortRef.current?.abort();
    const ctrl = new AbortController();
    loadAbortRef.current = ctrl;
    const targetId = activeSessionId;
    setMessages([]); // clear while loading so we don't flash the wrong convo
    fetch(`/api/chat?resumeId=${resumeId}&sessionId=${targetId}`, {
      signal: ctrl.signal
    })
      .then((r) => r.json())
      .then((data: { messages?: ChatMessageRow[] }) => {
        if (ctrl.signal.aborted) return;
        // Drop the result if the user has since switched sessions.
        if (targetId !== activeSessionIdRef.current) return;
        setMessages(data.messages ?? []);
      })
      .catch((err) => {
        if (err?.name !== 'AbortError') {
          // Silent — switching sessions mid-load is the common case,
          // and the next session click will retry.
          void err;
        }
      });
  }, [isOpen, activeSessionId, resumeId]);

  // Keep a ref of the latest activeSessionId so the load handler above can
  // detect stale fetches without needing activeSessionId in its deps (which
  // would cause a re-fetch loop).
  const activeSessionIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
  }, [activeSessionId]);

  const { sendMessage, cancel } = useChatStream({
    resumeId,
    resumeName,
    onMessage: setMessages,
    onDone: () => {
      setIsStreaming(false);
      setToolInFlight(false);
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
      // The assistant just wrote a revision to this resume. Revalidate the
      // server components so the editor behind the chat panel updates —
      // without this the user reads "Done, I rewrote your summary" while
      // looking at the old summary, which is what made the tool feel broken.
      router.refresh();
    },
    onError: (err: string, code?: string, limit?: number | null) => {
      setIsStreaming(false);
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
      setIsStreaming(true);
      // A new turn starts from a clean slate: whatever the previous
      // turn was doing is over.
      setToolInFlight(false);
      // Clear the previous rejection notice optimistically — a fresh
      // attempt that succeeds must not leave a stale "you've used
      // today's allowance" banner sitting above the composer.
      setNotice(null);
      // Pass the live transcript so the hook APPENDS to it. Without this the
      // hook seeded its own two-message array and the whole conversation
      // disappeared from the panel the moment you sent anything.
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
    },
    [activeSessionId, sendMessage, resumeId, messages]
  );

  // Fire the auto-run once the session list has loaded and we know
  // there is no existing conversation to append to.
  useEffect(() => {
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
  const floatingUi = (
    <>
      <button
        onClick={() => setIsOpen((v) => !v)}
        aria-label={isOpen ? 'Close AI assistant' : 'Open AI assistant'}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-700 shadow-lg transition-all hover:border-gray-300 hover:shadow-xl hover:scale-105 active:scale-95 no-print"
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
          <AgentMark state={agentState} size={30} className="text-gray-900" />
        )}
      </button>

      {isOpen && (
        <ChatWindow
          agentState={agentState}
          resumeName={resumeName}
          isPro={isPro}
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
    </>
  );

  if (!mounted) return null;
  return createPortal(floatingUi, document.body);
}
