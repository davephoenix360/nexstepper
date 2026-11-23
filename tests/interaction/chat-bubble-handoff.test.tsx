// @vitest-environment jsdom
/**
 * The attention icon does not own a chat client: it publishes a request and
 * `ChatBubble` sends it through the same hook a typed message uses. These
 * tests pin that handoff contract with a stubbed stream client — the real
 * stream parser is covered by
 * `tests/interaction/use-chat-stream-score-events.test.tsx`.
 */

import * as React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  options: null as Record<string, unknown> | null,
  refresh: vi.fn(),
  markAgentIntroSeen: vi.fn()
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mocks.refresh })
}));

vi.mock('@/components/chat/use-chat-stream', () => ({
  useChatStream: (options: Record<string, unknown>) => {
    mocks.options = options;
    return { sendMessage: mocks.sendMessage, cancel: vi.fn() };
  }
}));

vi.mock('@/components/chat/chat-window', () => ({
  ChatWindow: (props: { notice: string | null }) => (
    <div data-testid="chat-window">{props.notice}</div>
  )
}));

vi.mock('@/components/chat/agent-intro-bubble', () => ({
  AgentIntroBubble: () => null
}));

vi.mock('@/components/brand/agent-mark', () => ({
  AgentMark: () => <span data-testid="agent-mark" />
}));

vi.mock('@/components/brand/use-agent-mark-state', () => ({
  useAgentMarkState: () => 'idle'
}));

vi.mock('@/lib/chat/agent-intro', () => ({
  markAgentIntroSeen: mocks.markAgentIntroSeen
}));

import { ChatBubble } from '@/components/chat/chat-bubble';
import {
  ChatHandoffProvider,
  useChatHandoff
} from '@/components/chat/chat-handoff-provider';

function AskButton({ prompt = 'Improve this bullet' }: { prompt?: string }) {
  const { askScout } = useChatHandoff();
  return (
    <button type="button" onClick={() => askScout({ prompt, label: 'Bullet issue' })}>
      ask scout
    </button>
  );
}

function renderChat(dailyLimit: number | null = 20) {
  return render(
    <ChatHandoffProvider>
      <AskButton />
      <ChatBubble
        resumeId="r1"
        resumeName="Variant"
        isPro={false}
        dailyLimit={dailyLimit}
      />
    </ChatHandoffProvider>
  );
}

describe('ChatBubble bullet-attention handoff', () => {
  beforeEach(() => {
    mocks.sendMessage.mockReset();
    mocks.refresh.mockClear();
    mocks.markAgentIntroSeen.mockClear();
    mocks.options = null;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ sessions: [] })
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('opens the panel and sends the exact handoff prompt once', async () => {
    mocks.sendMessage.mockResolvedValue('session-1');
    renderChat();

    await userEvent.click(screen.getByRole('button', { name: 'ask scout' }));

    await waitFor(() => {
      expect(mocks.sendMessage).toHaveBeenCalledTimes(1);
    });
    expect(mocks.sendMessage).toHaveBeenCalledWith(null, 'Improve this bullet', []);
    expect(screen.getByTestId('chat-window')).toBeTruthy();
    expect(mocks.markAgentIntroSeen).toHaveBeenCalled();
  });

  it('queues a second handoff until the first turn ends', async () => {
    let finishFirst: (() => void) | null = null;
    mocks.sendMessage.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          finishFirst = () => resolve('session-1');
        })
    );
    mocks.sendMessage.mockResolvedValueOnce('session-1');

    renderChat();
    const ask = screen.getByRole('button', { name: 'ask scout' });

    await userEvent.click(ask);
    await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledTimes(1));

    await userEvent.click(ask);
    expect(mocks.sendMessage).toHaveBeenCalledTimes(1);

    await act(async () => {
      finishFirst?.();
      (mocks.options?.onDone as (() => void) | undefined)?.();
    });

    await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledTimes(2));
    expect(mocks.sendMessage.mock.calls.map((call) => call[1])).toEqual([
      'Improve this bullet',
      'Improve this bullet'
    ]);
  });

  it('uses the normal rate-limit notice instead of a second paywall', async () => {
    mocks.sendMessage.mockResolvedValue(null);
    renderChat();

    // The notice lives inside the chat window, which is mounted only
    // once the panel is open. A handoff opens it automatically; here we
    // exercise the error path from a typed turn, so open it explicitly.
    await userEvent.click(
      screen.getByRole('button', { name: 'Open Scout, the AI assistant' })
    );

    await waitFor(() => {
      expect(typeof mocks.options?.onError).toBe('function');
    });

    await act(async () => {
      (mocks.options?.onError as (error: string, code?: string) => void)(
        'You have used today’s allowance.',
        'RATE_LIMITED'
      );
    });

    // Token-limit errors are the only ones surfaced as a notice; a turn
    // limit is described by the counter in ChatWindow itself.
    expect(screen.getByTestId('chat-window').textContent).toBe('');
  });

  it('coalesces resume_updated and score_updated into one refresh', async () => {
    renderChat();
    await userEvent.click(
      screen.getByRole('button', { name: 'Open Scout, the AI assistant' })
    );

    await waitFor(() => {
      expect(typeof mocks.options?.onResumeUpdated).toBe('function');
      expect(typeof mocks.options?.onScoreUpdated).toBe('function');
    });

    await act(async () => {
      (mocks.options?.onResumeUpdated as () => void)();
      (mocks.options?.onScoreUpdated as () => void)();
    });

    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
    // Let the scheduled macrotask flush so a second refresh would be
    // visible before the assertion ends the test.
    await act(async () => {});
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });
});
