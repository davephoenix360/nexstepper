// @vitest-environment jsdom
/**
 * The chat route emits `score_updated` only after a successful single-bullet
 * edit and its fresh snapshot write. If the client stops parsing that event,
 * the attention icon outlives the fix until the user reloads — so the event
 * is pinned here against a real ReadableStream, not against a mocked hook.
 */

import * as React from 'react';
import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  useChatStream,
  type ChatMessageRow
} from '@/components/chat/use-chat-stream';

type SendMessage = (
  sessionId: string | null,
  message: string,
  currentMessages?: ChatMessageRow[]
) => Promise<string | null>;

let sendMessageRef: SendMessage | null = null;

function Probe({
  onResumeUpdated,
  onScoreUpdated,
  onDone
}: {
  onResumeUpdated: () => void;
  onScoreUpdated: () => void;
  onDone: (finishReason: string | null) => void;
}) {
  const { sendMessage } = useChatStream({
    resumeId: 'r1',
    resumeName: 'Variant',
    onMessage: () => undefined,
    onResumeUpdated,
    onScoreUpdated,
    onDone
  });
  sendMessageRef = sendMessage;
  return null;
}

function sseResponse(events: readonly Record<string, unknown>[]) {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }
      controller.close();
    }
  });

  return {
    ok: true,
    status: 200,
    headers: {
      get: (name: string) =>
        name === 'X-Session-Id' ? 'session-1' : null
    },
    body
  };
}

describe('useChatStream score events', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    sendMessageRef = null;
  });

  it('surfaces score_updated alongside resume_updated from one turn', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      sseResponse([
        { type: 'resume_updated' },
        { type: 'score_updated' },
        { type: 'done', finishReason: 'stop' }
      ])
    );
    vi.stubGlobal('fetch', fetchMock);

    const onResumeUpdated = vi.fn();
    const onScoreUpdated = vi.fn();
    const onDone = vi.fn();
    render(
      <Probe
        onResumeUpdated={onResumeUpdated}
        onScoreUpdated={onScoreUpdated}
        onDone={onDone}
      />
    );

    let sessionId: string | null = null;
    await act(async () => {
      const send = sendMessageRef;
      if (!send) throw new Error('useChatStream did not expose sendMessage');
      sessionId = await send('session-1', 'Improve this bullet', []);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sessionId).toBe('session-1');
    expect(onResumeUpdated).toHaveBeenCalledTimes(1);
    expect(onScoreUpdated).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith('stop');
  });
});
