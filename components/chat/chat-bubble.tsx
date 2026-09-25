'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { MessageSquare } from 'lucide-react';
import { ChatWindow } from './chat-window';
import { useChatStream } from './use-chat-stream';
import { type ChatMessageRow } from './use-chat-stream';

interface ChatSessionSummary {
  id: string;
  title: string;
  updatedAt: string | Date;
}

interface ChatBubbleProps {
  resumeId: string;
  resumeName: string;
  isPro: boolean;
}

export function ChatBubble({ resumeId, resumeName, isPro }: ChatBubbleProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessageRow[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [rateLimit, setRateLimit] = useState<{ limit: number; used: number } | null>(
    isPro ? null : { limit: 20, used: 0 }
  );

  // Portal target only exists on the client. Wait for mount so SSR
  // doesn't crash on `document.body`.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

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
      })
      .catch(() => {});
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
    onDone: () => setIsStreaming(false),
    onError: (err: string, code?: string) => {
      setIsStreaming(false);
      if (code === 'RATE_LIMITED') {
        setRateLimit({ limit: 20, used: 20 });
      }
    }
  });

  const handleNewChat = useCallback(() => {
    setActiveSessionId(null);
    setMessages([]);
  }, []);

  const handleSend = useCallback(
    async (content: string) => {
      setIsStreaming(true);
      const sessionId = await sendMessage(activeSessionId, content);
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
    [activeSessionId, sendMessage, resumeId]
  );

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
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg transition-all hover:bg-indigo-700 hover:scale-105 active:scale-95 no-print"
        style={{ bottom: '1.5rem', right: '1.5rem' }}
      >
        {isOpen ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          <MessageSquare size={22} />
        )}
      </button>

      {isOpen && (
        <ChatWindow
          resumeName={resumeName}
          isPro={isPro}
          sessions={sessions}
          activeSessionId={activeSessionId}
          messages={messages}
          isStreaming={isStreaming}
          rateLimit={rateLimit}
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
