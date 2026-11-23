'use client';

/**
 * Repeatable "ask Scout" channel.
 *
 * The existing `autoPrompt` path is intentionally one-shot: it only fires
 * when a chat session has never been opened. Bullet attention icons need
 * the opposite — every click is a new request, including while the panel
 * is open and after earlier turns. Requests are queued here and consumed
 * by `ChatBubble`, which owns the actual send and streaming state.
 */

import * as React from 'react';

export type ChatHandoffRequest = {
  /** Stable id; consumers use it to avoid re-sending on re-render. */
  id: string;
  prompt: string;
  /** Short label for the chat composer / accessibility. */
  label?: string;
  /** Dotted editor path the request is about, when there is one. */
  targetPath?: string;
};

export type ChatHandoffInput = Omit<ChatHandoffRequest, 'id'>;

type ChatHandoffContextValue = {
  requests: readonly ChatHandoffRequest[];
  currentRequest: ChatHandoffRequest | null;
  askScout: (input: ChatHandoffInput) => string;
  consumeHandoff: (id: string) => void;
  clearHandoff: () => void;
};

const noop = () => {};

const ChatHandoffContext = React.createContext<ChatHandoffContextValue>({
  requests: [],
  currentRequest: null,
  askScout: () => {
    throw new Error('askScout requires a ChatHandoffProvider');
  },
  consumeHandoff: noop,
  clearHandoff: noop
});

function nextRequestId(): string {
  const random =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `bullet-handoff-${random}`;
}

export function ChatHandoffProvider({
  children
}: {
  children: React.ReactNode;
}) {
  const [requests, setRequests] = React.useState<ChatHandoffRequest[]>([]);

  const askScout = React.useCallback((input: ChatHandoffInput) => {
    const id = nextRequestId();
    setRequests((current) => [...current, { ...input, id }]);
    return id;
  }, []);

  const consumeHandoff = React.useCallback((id: string) => {
    setRequests((current) => current.filter((request) => request.id !== id));
  }, []);

  const clearHandoff = React.useCallback(() => setRequests([]), []);

  const value = React.useMemo<ChatHandoffContextValue>(
    () => ({
      requests,
      currentRequest: requests[0] ?? null,
      askScout,
      consumeHandoff,
      clearHandoff
    }),
    [requests, askScout, consumeHandoff, clearHandoff]
  );

  return (
    <ChatHandoffContext.Provider value={value}>
      {children}
    </ChatHandoffContext.Provider>
  );
}

export function useChatHandoff(): ChatHandoffContextValue {
  return React.useContext(ChatHandoffContext);
}
