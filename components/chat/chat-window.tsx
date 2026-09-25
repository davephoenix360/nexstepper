'use client';

import { useEffect, useRef, useState } from 'react';
import { X, Plus, Crown, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { ChatMessage } from './chat-message';
import { ChatInput } from './chat-input';
import { ChatSidebar } from './chat-sidebar';
import { type ChatMessageRow } from './use-chat-stream';

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
  onClose,
  onNewChat,
  onSend,
  onCancel,
  onSelectSession
}: ChatWindowProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // History sidebar can be collapsed to give the message area more room.
  // Default expanded; persists for the lifetime of the chat window mount.
  const [isHistoryCollapsed, setIsHistoryCollapsed] = useState(false);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const hasSessions = sessions.length > 0;
  const showSidebar = hasSessions && !isHistoryCollapsed;

  return (
    <div
      className="fixed bottom-20 right-6 z-50 flex h-[44rem] w-[34rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl no-print"
      style={{ bottom: '5.5rem', right: '1.5rem' }}
    >
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-600">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a10 10 0 1 0 10 10" />
              <path d="M12 6v6l4 2" />
            </svg>
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
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-50">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <p className="mb-1 text-sm font-medium text-gray-900">Ask about your resume</p>
              <p className="max-w-[16rem] text-xs leading-relaxed text-gray-500">
                I can edit bullets, answer questions, or switch templates.
              </p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto px-4 py-3">
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
          )}

          {/* Input */}
          <div className="shrink-0 border-t border-gray-100 p-3">
            <ChatInput
              onSend={onSend}
              isStreaming={isStreaming}
              rateLimit={rateLimit}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
