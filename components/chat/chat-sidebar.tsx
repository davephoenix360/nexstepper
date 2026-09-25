'use client';

import { MessageSquare, Plus, Clock, ChevronRight } from 'lucide-react';

interface ChatSessionSummary {
  id: string;
  title: string;
  updatedAt: string | Date;
}

interface ChatSidebarProps {
  sessions: ChatSessionSummary[];
  activeSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onNewChat: () => void;
}

function formatRelativeTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function ChatSidebar({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewChat
}: ChatSidebarProps) {
  return (
    <div className="flex h-full w-52 shrink-0 flex-col border-r border-gray-100 bg-gray-50/40">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-3 py-3">
        <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-gray-700">
          <MessageSquare className="h-4 w-4 shrink-0 text-gray-500" />
          <span className="truncate">History</span>
        </div>
        <button
          onClick={onNewChat}
          className="flex shrink-0 items-center gap-1 text-xs text-indigo-600 hover:underline"
          title="Start a new conversation"
        >
          <Plus className="h-3.5 w-3.5" />
          New
        </button>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto py-1">
        <ul className="space-y-0.5 px-2">
          {sessions.map((session) => (
            <li key={session.id}>
              <button
                onClick={() => onSelectSession(session.id)}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
                  session.id === activeSessionId
                    ? 'bg-indigo-50 text-indigo-700 font-medium'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                <Clock className="h-3.5 w-3.5 shrink-0 opacity-60" />
                <span className="flex-1 truncate">{session.title}</span>
                {session.id === activeSessionId && (
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-60" />
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
