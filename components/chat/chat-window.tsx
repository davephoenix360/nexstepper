'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowDown, X, Plus, Crown, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { ChatMessage } from './chat-message';
import { ChatInput } from './chat-input';
import { ChatSidebar } from './chat-sidebar';
import { AgentMark } from '@/components/brand/agent-mark';
import { type ChatMessageRow } from './use-chat-stream';
import type { SuggestedPrompt } from '@/lib/chat/suggested-prompts';
import { CHAT_PANEL_BOTTOM_PX, FLOATING_RIGHT_PX } from '@/lib/ui/floating-actions';

interface ChatSessionSummary {
  id: string;
  title: string;
  updatedAt: string | Date;
}

interface ChatWindowProps {
  resumeName: string;
  isPro: boolean;
  sessions: ChatSessionSummary[];
  activeSessionId: string | null;
  messages: ChatMessageRow[];
  isStreaming: boolean;
  rateLimit: { limit: number; used: number } | null;
  /** See `ChatInput` — why the last send was rejected, if it was. */
  notice: string | null;
  /**
   * One-click starting points, shown while the conversation is empty.
   *
   * These are the prompts people type to a resume AI over and over —
   * see `lib/chat/suggested-prompts.ts` for the reasoning and for the
   * JD-aware variant.
   */
  suggestedPrompts?: SuggestedPrompt[];
  onClose: () => void;
  onNewChat: () => void;
  onSend: (content: string) => void;
  onCancel: () => void;
  onSelectSession: (id: string) => void;
}

export function ChatWindow({
  resumeName,
  isPro,
  sessions,
  activeSessionId,
  messages,
  isStreaming,
  rateLimit,
  notice,
  suggestedPrompts = [],
  onClose,
  onNewChat,
  onSend,
  onCancel,
  onSelectSession
}: ChatWindowProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // History sidebar can be collapsed to give the message area more room.
  // Default expanded; persists for the lifetime of the chat window mount.
  const [isHistoryCollapsed, setIsHistoryCollapsed] = useState(false);

  // ── Scroll behaviour ─────────────────────────────────────────────────────
  //
  // "Stick to the bottom" is the right default, but only while the user
  // hasn't asked to be somewhere else. Forcing `scrollIntoView` on every
  // token dragged the viewport away from anyone reading back through the
  // conversation mid-stream.
  //
  // `isPinnedToBottom` is the single source of truth:
  //   - true  → follow the stream (and show a jump-to-latest button if the
  //             user scrolls away).
  //   - false → the user scrolled up. We stop yanking them back, and start
  //             following again the moment they return to the bottom.
  const [isPinnedToBottom, setIsPinnedToBottom] = useState(true);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    // 48px of slack: "close enough to the bottom" so a 1px rounding
    // difference doesn't unpin the view while the user is clearly at the end.
    const distanceFromBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight;
    setIsPinnedToBottom(distanceFromBottom < 48);
  }, []);

  const scrollToLatest = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    setIsPinnedToBottom(true);
  }, []);

  // Follow the stream — but only while pinned. `useLayoutEffect` so the
  // jump happens in the same paint as the new content, otherwise the user
  // sees a frame of the old scroll position on every token.
  useLayoutEffect(() => {
    if (!isPinnedToBottom) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, isPinnedToBottom]);

  // When the transcript is swapped wholesale (opening a different session,
  // or "New conversation"), land at the newest message rather than whatever
  // scroll offset the previous session happened to leave behind.
  const firstRenderRef = useRef(true);
  useEffect(() => {
    if (firstRenderRef.current) {
      firstRenderRef.current = false;
      return;
    }
    setIsPinnedToBottom(true);
  }, [activeSessionId]);

  const hasSessions = sessions.length > 0;
  const showSidebar = hasSessions && !isHistoryCollapsed;

  return (
    <div
      className="fixed right-6 z-50 flex h-[42rem] max-h-[calc(100vh-10rem)] w-[34rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl no-print"
      // The inline style wins over the Tailwind classes.
      //
      // `bottom` clears the floating Feedback pill, which steps up
      // when this panel's trigger is on the page. Opening the
      // assistant must never cover the feedback affordance.
      //
      // `max-h-[calc(100vh-10rem)]` is the safety net: the panel is
      // tall by default, and a short viewport would otherwise push
      // its header off the top of the screen.
      style={{ bottom: `${CHAT_PANEL_BOTTOM_PX}px`, right: `${FLOATING_RIGHT_PX}px` }}
    >
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          {/* The agent's mark. A white circle rather than a filled
              indigo one, so the mark reads as the mark — navy
              brackets with the indigo dot — rather than a white
              silhouette. The dot is the only colour in the header. */}
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white">
            <AgentMark
              state={isStreaming ? 'working' : 'idle'}
              size={20}
              className="text-gray-900"
            />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-gray-900">AI Assistant</p>
            <p className="truncate text-xs text-gray-500">{resumeName}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {!isPro && (
            <span className="mr-2 flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
              <Crown size={10} />
              Free · 20/day
            </span>
          )}
          {/* Toggle history sidebar — only meaningful when there are sessions to show. */}
          {hasSessions && (
            <button
              onClick={() => setIsHistoryCollapsed((v) => !v)}
              title={isHistoryCollapsed ? 'Show history' : 'Hide history'}
              aria-label={isHistoryCollapsed ? 'Show history' : 'Hide history'}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            >
              {isHistoryCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
            </button>
          )}
          <button
            onClick={onNewChat}
            title="New conversation"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          >
            <Plus size={16} />
          </button>
          <button
            onClick={onClose}
            title="Close"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Body: optional sidebar + message area */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Session list — hidden until at least one conversation exists OR
            while the user has it collapsed to give the message area more room. */}
        {showSidebar && (
          <ChatSidebar
            sessions={sessions}
            activeSessionId={activeSessionId}
            onSelectSession={onSelectSession}
            onNewChat={onNewChat}
          />
        )}

        {/* Messages + input */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {messages.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
              {/* The one place the mark is large enough to be a
                  character rather than an icon. */}
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50">
                <AgentMark state="idle" size={44} className="text-gray-900" />
              </div>
              <p className="mb-1 text-sm font-medium text-gray-900">Ask about your resume</p>
              <p className="max-w-[16rem] text-xs leading-relaxed text-gray-500">
                I can edit bullets, answer questions, or switch templates.
              </p>

              {suggestedPrompts.length > 0 && (
                <div className="mt-5 flex max-w-[22rem] flex-col gap-1.5">
                  {suggestedPrompts.map((s) => (
                    <button
                      key={s.label}
                      type="button"
                      onClick={() => onSend(s.prompt)}
                      disabled={isStreaming}
                      data-testid={`chat-suggestion-${s.label
                        .toLowerCase()
                        .replace(/[^a-z0-9]+/g, '-')
                        .replace(/^-|-$/g, '')}`}
                      className="rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-left text-xs text-gray-700 transition hover:border-indigo-300 hover:bg-indigo-50/40 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="relative flex-1 min-h-0">
              <div
                ref={scrollRef}
                onScroll={handleScroll}
                className="h-full overflow-y-auto px-4 py-3"
              >
                {messages.map((msg, i) => {
                  // The very last assistant message shows a spinner if
                  // we're still streaming and nothing has been written yet.
                  const isLastAssistantEmpty =
                    msg.role === 'assistant' &&
                    isStreaming &&
                    i === messages.length - 1 &&
                    !msg.content;
                  return (
                    <ChatMessage key={msg.id} message={msg} isLoading={isLastAssistantEmpty} />
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Jump-to-latest: shown only once the user has scrolled away
                  from the bottom, so it never sits there nagging during a
                  normal read-through-at-the-bottom flow. */}
              {!isPinnedToBottom && (
                <button
                  type="button"
                  onClick={scrollToLatest}
                  aria-label="Jump to latest message"
                  title="Jump to latest"
                  data-testid="chat-jump-to-latest"
                  className="absolute bottom-3 left-1/2 flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 shadow-md transition-all hover:bg-gray-50 hover:text-gray-900"
                >
                  <ArrowDown size={16} />
                </button>
              )}
            </div>
          )}

          {/* Input */}
          <div className="shrink-0 border-t border-gray-100 p-3">
            <ChatInput
              onSend={onSend}
              isStreaming={isStreaming}
              rateLimit={rateLimit}
              notice={notice}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
