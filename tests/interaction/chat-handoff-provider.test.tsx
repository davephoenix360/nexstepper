// @vitest-environment jsdom
/**
 * The handoff channel is the repeatable sibling of `autoPrompt`. These
 * tests pin the queue semantics the chat bubble relies on: every click is
 * a new request, requests keep their order, and consuming one does not
 * drop the rest.
 */

import * as React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import {
  ChatHandoffProvider,
  useChatHandoff,
  type ChatHandoffRequest
} from '@/components/chat/chat-handoff-provider';

let seen: readonly ChatHandoffRequest[] = [];
let current: ChatHandoffRequest | null = null;

function Probe() {
  const handoff = useChatHandoff();
  seen = handoff.requests;
  current = handoff.currentRequest;

  return (
    <>
      <button
        type="button"
        onClick={() => handoff.askScout({ prompt: 'first', label: 'First' })}
      >
        ask first
      </button>
      <button
        type="button"
        onClick={() => handoff.askScout({ prompt: 'second', label: 'Second' })}
      >
        ask second
      </button>
      <button
        type="button"
        onClick={() => current && handoff.consumeHandoff(current.id)}
      >
        consume current
      </button>
    </>
  );
}

function mount() {
  return render(
    <ChatHandoffProvider>
      <Probe />
    </ChatHandoffProvider>
  );
}

describe('ChatHandoffProvider', () => {
  it('queues repeat requests and exposes the oldest as current', async () => {
    const user = userEvent.setup({ document });
    mount();

    await user.click(screen.getByRole('button', { name: 'ask first' }));
    await user.click(screen.getByRole('button', { name: 'ask second' }));

    expect(seen.map((request) => request.prompt)).toEqual(['first', 'second']);
    expect(current?.prompt).toBe('first');
    expect(new Set(seen.map((request) => request.id)).size).toBe(2);
  });

  it('advances to the next request when the current one is consumed', async () => {
    const user = userEvent.setup({ document });
    mount();

    await user.click(screen.getByRole('button', { name: 'ask first' }));
    await user.click(screen.getByRole('button', { name: 'ask second' }));
    await user.click(screen.getByRole('button', { name: 'consume current' }));

    expect(seen.map((request) => request.prompt)).toEqual(['second']);
    expect(current?.prompt).toBe('second');
  });
});
