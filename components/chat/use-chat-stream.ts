'use client';

/**
 * Custom streaming hook for the AI chat assistant.
 *
 * Uses raw `fetch` + `ReadableStream` — no `@ai-sdk/react` dependency.
 * Parses SSE events emitted by `app/api/chat/route.ts` and exposes
 * incremental state via callbacks, matching the shape of `useChat` from
 * `@ai-sdk/react` so the component tree is mostly agnostic to which
 * hook drives it.
 *
 * The hook manages:
 * - Per-turn state: text deltas, tool calls, done signal
 * - Accumulated messages: user + assistant pairs (assistant text grows in place)
 * - Error / rate-limit handling
 *
 * Important: the assistant message is created immediately when `sendMessage`
 * is called (with empty content + `isStreaming=true` in the parent). This
 * way, tool-call / tool-result events that arrive before any text-delta
 * can still attach to the assistant message — otherwise an edit-style
 * request ("Make my summary shorter") where the model goes straight to a
 * tool call would produce an invisible assistant bubble.
 */

export type ChatMessageRow = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: Array<{ name: string; args: unknown }>;
  toolResult?: unknown;
};

export type UseChatStreamOptions = {
  /** Resume being edited — used to build the per-turn context URL. */
  resumeId: string;
  /** Resume name for session titles. */
  resumeName: string;
  /** Called for every accumulated message (user + assistant pairs). */
  onMessage: (messages: ChatMessageRow[]) => void;
  /** Called when a tool call event arrives (before result). */
  onToolCall?: (toolName: string, args: unknown) => void;
  /** Called when the stream finishes successfully. */
  onDone?: (finishReason: string | null) => void;
  /** Called on any error (network, rate-limit, 5xx, etc.). */
  onError?: (error: string, code?: string, limit?: number | null) => void;
  /**
   * Called after each successful turn with the server's authoritative
   * post-consume usage. Replaces the client-side counter, which used to
   * be seeded with a hardcoded `{ limit: 20, used: 0 }` and therefore
   * always displayed the full allowance no matter how much the user had
   * actually sent.
   */
  onUsage?: (usage: { used: number; limit: number }) => void;
  /**
   * Called when the server reports that a resume-mutating tool
   * (`editResume` / `switchTemplate`) actually wrote a revision.
   *
   * Without this the editor keeps rendering the pre-edit server state, so the
   * chat would report "I rewrote your summary" next to an unchanged summary.
   * The parent is expected to call `router.refresh()`.
   */
  onResumeUpdated?: () => void;
};

type StreamState = {
  /** Pending tool calls for the current assistant message. */
  toolCalls: Array<{ name: string; args: unknown }>;
  /** Final result from the most recent tool execution. */
  toolResult: unknown;
};

/**
 * Replace the message with the given id in a new array, returning a new
 * array of new references. Used to keep updates immutable so memo'd
 * `<ChatMessage>` re-renders correctly when SSE events land.
 */
function mapReplaceById(
  messages: ChatMessageRow[],
  id: string,
  replacement: ChatMessageRow
): ChatMessageRow[] {
  return messages.map((m) => (m.id === id ? replacement : m));
}

/**
 * Find or create the assistant message in the current messages array.
 * Returns a NEW assistant message (immutable). The caller is responsible
 * for splicing the new object into `messages` themselves — keeping
 * updates immutable so memo'd `<ChatMessage>` re-renders correctly.
 */
function buildAssistantMessage(
  messages: ChatMessageRow[],
  assistantId: string
): { messages: ChatMessageRow[]; assistant: ChatMessageRow; created: boolean } {
  const idx = messages.findIndex((m) => m.id === assistantId);
  if (idx >= 0) {
    const assistant = messages[idx];
    return { messages, assistant, created: false };
  }
  const created: ChatMessageRow = {
    id: assistantId,
    role: 'assistant',
    content: ''
  };
  return { messages: [...messages, created], assistant: created, created: true };
}

function makeId() {
  return `msg_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Hook that sends a message and streams the AI response.
 */
export function useChatStream({
  resumeId,
  resumeName,
  onMessage,
  onToolCall,
  onDone,
  onError,
  onUsage,
  onResumeUpdated
}: UseChatStreamOptions) {
  /** Accumulated messages for the current session. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let messages: ChatMessageRow[] = [];
  /** Whether a stream is currently in flight. */
  let isStreaming = false;

  /**
   * Send a message and stream the response.
   *
   * `currentMessages` is the conversation as it currently stands in the UI.
   * It MUST be passed in rather than read from the hook, because the hook has
   * no other way to see the history: it previously seeded its own two-element
   * array, which meant every new message **replaced** the transcript on
   * screen. The user saw their whole conversation vanish the moment they sent
   * something, and it only came back after closing and reopening the chat
   * (which re-fetches from the DB). Hence the explicit parameter.
   */
  async function sendMessage(
    sessionId: string | null,
    message: string,
    currentMessages: ChatMessageRow[] = []
  ): Promise<string | null> {
    // Cancel any in-flight request
    if ((sendMessage as any)._abortController) {
      (sendMessage as any)._abortController.abort();
    }
    const abortController = new AbortController();
    (sendMessage as any)._abortController = abortController;

    isStreaming = true;

    const userId = makeId();
    const assistantId = makeId();

    const state: StreamState = {
      toolCalls: [],
      toolResult: null
    };

    // APPEND the new pair to the existing conversation. Replacing it is what
    // made the history disappear mid-session.
    const seeded: ChatMessageRow[] = [
      ...currentMessages,
      { id: userId, role: 'user', content: message },
      { id: assistantId, role: 'assistant', content: '' }
    ];
    messages = seeded;
    onMessage([...seeded]);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, resumeId, message }),
        signal: abortController.signal
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => ({ error: `HTTP ${res.status}` }))) as {
          error?: string;
          code?: string;
          limit?: number | null;
        };
        onError?.(err.error ?? 'Request failed', err.code, err.limit);
        // Drop only the turn that failed — keep the prior conversation. The
        // old code reset to `[]` here, so one error (a 429, a dropped
        // connection) silently erased the user's whole chat from the screen.
        messages = [...currentMessages];
        onMessage([...messages]);
        isStreaming = false;
        return null;
      }

      const resolvedSessionId = res.headers.get('X-Session-Id') ?? sessionId;

      // Post-consume usage from the server, so the "N messages
      // remaining" readout in the composer reflects reality instead of
      // the hardcoded `{ limit: 20, used: 0 }` the bubble used to seed
      // (which meant the number never changed as the user chatted).
      const usageHeader = res.headers.get('X-Chat-Usage');
      if (usageHeader) {
        const used = Number.parseInt(usageHeader, 10);
        const limitHeader = res.headers.get('X-Chat-Limit');
        const limit =
          limitHeader === 'unlimited' || limitHeader === null
            ? Number.POSITIVE_INFINITY
            : Number.parseInt(limitHeader, 10);
        if (Number.isFinite(used)) {
          // Unlimited plan → caller hides the readout; finite plan →
          // caller renders "N / M messages remaining today".
          onUsage?.({ used, limit });
        }
      }

      if (!res.body) {
        onError?.('No response body');
        messages = [...currentMessages];
        onMessage([...messages]);
        isStreaming = false;
        return null;
      }

      // Parse SSE until `done`
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE messages ("data: <json>\n\n")
        while (buffer.includes('\n\n')) {
          const lineEnd = buffer.indexOf('\n\n');
          const rawLine = buffer.slice(0, lineEnd);
          buffer = buffer.slice(lineEnd + 2);

          const line = rawLine.startsWith('data: ')
            ? rawLine.slice(6)
            : rawLine;

          let event: Record<string, unknown>;
          try {
            event = JSON.parse(line) as Record<string, unknown>;
          } catch {
            // Malformed SSE line — drop it and keep parsing the stream.
            continue;
          }

          switch (event.type) {
            case 'text-delta': {
              const delta = String(event.delta ?? '');
              const { messages: nextMessages, assistant } = buildAssistantMessage(messages, assistantId);
              // Immutable update: replace the assistant in the array with a
              // new object so memo'd children re-render correctly.
              const updatedAssistant: ChatMessageRow = {
                ...assistant,
                content: assistant.content + delta
              };
              messages = mapReplaceById(nextMessages, assistantId, updatedAssistant);
              onMessage([...messages]);
              break;
            }

            case 'tool_call': {
              state.toolCalls.push({
                name: String(event.toolName ?? ''),
                args: event.args as unknown
              });
              const { messages: nextMessages, assistant } = buildAssistantMessage(messages, assistantId);
              const updatedAssistant: ChatMessageRow = {
                ...assistant,
                toolCalls: [...state.toolCalls]
              };
              messages = mapReplaceById(nextMessages, assistantId, updatedAssistant);
              onMessage([...messages]);
              onToolCall?.(String(event.toolName), event.args as unknown);
              break;
            }

            case 'tool_result': {
              state.toolResult = event.result;
              const { messages: nextMessages, assistant } = buildAssistantMessage(messages, assistantId);
              const updatedAssistant: ChatMessageRow = {
                ...assistant,
                toolResult: state.toolResult
              };
              messages = mapReplaceById(nextMessages, assistantId, updatedAssistant);
              onMessage([...messages]);
              break;
            }

            case 'resume_updated':
              // The tool wrote a revision server-side. Revalidate so the
              // editor reflects the edit the assistant just described.
              onResumeUpdated?.();
              break;

            case 'done':
              isStreaming = false;
              onDone?.(event.finishReason as string | null);
              break;

            default:
              // Unknown event type — ignore. Forward-compat for new server events.
              break;
          }
        }
      }

      isStreaming = false;
      return resolvedSessionId;
    } catch (err) {
      isStreaming = false;
      if ((err as Error).name === 'AbortError') {
        return null;
      }
      onError?.((err as Error).message ?? 'Stream failed');
      messages = [...currentMessages];
      onMessage([...messages]);
      return null;
    }
  }

  function cancel() {
    if ((sendMessage as any)._abortController) {
      (sendMessage as any)._abortController.abort();
    }
  }

  return { sendMessage, cancel, messages, isStreaming };
}