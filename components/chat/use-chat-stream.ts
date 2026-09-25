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
  onError?: (error: string, code?: string) => void;
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

const LOG_PREFIX = '[chat-client]';

/**
 * Hook that sends a message and streams the AI response.
 */
export function useChatStream({
  resumeId,
  resumeName,
  onMessage,
  onToolCall,
  onDone,
  onError
}: UseChatStreamOptions) {
  /** Accumulated messages for the current session. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let messages: ChatMessageRow[] = [];
  /** Whether a stream is currently in flight. */
  let isStreaming = false;

  /**
   * Send a message and stream the response.
   */
  async function sendMessage(
    sessionId: string | null,
    message: string
  ): Promise<string | null> {
    console.log(LOG_PREFIX, 'sendMessage() called', {
      sessionId,
      resumeId,
      messageLength: message.length
    });

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

    // Seed both user + assistant messages up front
    const currentMessages: ChatMessageRow[] = [
      { id: userId, role: 'user', content: message },
      { id: assistantId, role: 'assistant', content: '' }
    ];
    messages = currentMessages;
    console.log(LOG_PREFIX, 'seeded messages', currentMessages.map((m) => ({ id: m.id, role: m.role, contentLen: m.content.length })));
    onMessage([...currentMessages]);

    try {
      console.log(LOG_PREFIX, 'fetch POST /api/chat →');
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, resumeId, message }),
        signal: abortController.signal
      });

      console.log(LOG_PREFIX, 'fetch ← response', {
        status: res.status,
        ok: res.ok,
        xSessionId: res.headers.get('X-Session-Id'),
        xTitle: res.headers.get('X-Title'),
        contentType: res.headers.get('Content-Type')
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        const code = (err as { code?: string }).code;
        console.error(LOG_PREFIX, 'response not OK', { status: res.status, err });
        onError?.(err.error ?? 'Request failed', code ?? undefined);
        messages = [];
        onMessage([]);
        isStreaming = false;
        return null;
      }

      const resolvedSessionId = res.headers.get('X-Session-Id') ?? sessionId;
      console.log(LOG_PREFIX, 'resolved session id', resolvedSessionId);

      if (!res.body) {
        console.error(LOG_PREFIX, 'no response body');
        onError?.('No response body');
        messages = [];
        onMessage([]);
        isStreaming = false;
        return null;
      }

      // Parse SSE until `done`
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let eventCount = 0;

      console.log(LOG_PREFIX, 'streaming started, reading SSE…');

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          console.log(LOG_PREFIX, 'reader done (stream closed)');
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        console.log(LOG_PREFIX, 'chunk received', { bytes: value?.byteLength, bufferLen: buffer.length });

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
          } catch (err) {
            console.warn(LOG_PREFIX, 'failed to parse SSE line, skipping', { rawLine, err: (err as Error).message });
            continue;
          }

          eventCount++;
          console.log(LOG_PREFIX, `SSE event #${eventCount}`, event);

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
              console.log(LOG_PREFIX, '  text-delta applied', {
                deltaLen: delta.length,
                assistantContentLen: updatedAssistant.content.length,
                preview: updatedAssistant.content.slice(0, 80)
              });
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
              console.log(LOG_PREFIX, '  tool_call attached', {
                toolName: String(event.toolName ?? ''),
                toolCallsCount: state.toolCalls.length
              });
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
              console.log(LOG_PREFIX, '  tool_result attached', {
                resultType: typeof event.result,
                resultKeys: typeof event.result === 'object' && event.result ? Object.keys(event.result) : []
              });
              onMessage([...messages]);
              break;
            }

            case 'done':
              console.log(LOG_PREFIX, '  done event', { finishReason: event.finishReason });
              isStreaming = false;
              onDone?.(event.finishReason as string | null);
              break;

            default:
              console.warn(LOG_PREFIX, '  unhandled event type', event.type);
          }
        }
      }

      console.log(LOG_PREFIX, 'streaming finished', {
        totalEvents: eventCount,
        finalAssistantContentLen: messages.find((m) => m.id === assistantId)?.content.length ?? 0,
        finalAssistantToolCalls: state.toolCalls.length,
        finalToolResult: state.toolResult ? 'present' : 'null'
      });
      isStreaming = false;
      return resolvedSessionId;
    } catch (err) {
      console.error(LOG_PREFIX, 'fetch/stream error', err);
      isStreaming = false;
      if ((err as Error).name === 'AbortError') {
        console.log(LOG_PREFIX, 'aborted by user');
        return null;
      }
      onError?.((err as Error).message ?? 'Stream failed');
      messages = [];
      onMessage([]);
      return null;
    }
  }

  function cancel() {
    console.log(LOG_PREFIX, 'cancel() invoked');
    if ((sendMessage as any)._abortController) {
      (sendMessage as any)._abortController.abort();
    }
  }

  return { sendMessage, cancel, messages, isStreaming };
}
