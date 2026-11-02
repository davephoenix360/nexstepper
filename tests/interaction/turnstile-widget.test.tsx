/**
 * @vitest-environment jsdom
 *
 * The Turnstile widget.
 *
 * The behaviour that matters and is easy to get wrong:
 *
 *  - the token is captured from the widget's callback and handed to the
 *    parent, which puts it on the `x-captcha-response` header;
 *  - a Turnstile token is SINGLE USE, so after a submission attempt the
 *    widget must be reset and the token cleared, or the retry fails
 *    with a token the server already spent;
 *  - an expired or errored challenge clears the token rather than
 *    leaving a stale one behind.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

import { TurnstileWidget } from '@/components/auth/turnstile-widget';

type RenderOptions = {
  sitekey: string;
  action: string;
  callback?: (token: string) => void;
  'error-callback'?: () => void;
  'expired-callback'?: () => void;
  'timeout-callback'?: () => void;
};

const renderMock = vi.fn();
const resetMock = vi.fn();
const removeMock = vi.fn();

/** The options the widget passed to `window.turnstile.render`. */
let lastRenderOptions: RenderOptions | null = null;

beforeEach(() => {
  lastRenderOptions = null;
  renderMock.mockReset();
  resetMock.mockReset();
  removeMock.mockReset();
  renderMock.mockImplementation((_container: HTMLElement, options: RenderOptions) => {
    lastRenderOptions = options;
    return 'widget-1';
  });
  (window as unknown as { turnstile: unknown }).turnstile = {
    render: renderMock,
    reset: resetMock,
    remove: removeMock
  };
});

afterEach(() => {
  delete (window as unknown as { turnstile?: unknown }).turnstile;
});

/**
 * Render the widget and wait for it to actually render the Turnstile
 * frame. The widget resolves the script promise before rendering, so
 * the assertion has to let that microtask run.
 */
async function renderWidget(props: {
  siteKey: string;
  action: string;
  onToken: (token: string | null) => void;
  resetSignal?: number;
}) {
  const result = render(
    <TurnstileWidget
      siteKey={props.siteKey}
      action={props.action}
      onToken={props.onToken}
      resetSignal={props.resetSignal ?? 0}
    />
  );
  await waitFor(() => expect(renderMock).toHaveBeenCalled());
  return result;
}

describe('TurnstileWidget', () => {
  it('renders the widget with the site key and the action', async () => {
    await renderWidget({
      siteKey: '0x4AAAAAAFw4ohsxlVQ359Nc',
      action: 'signup',
      onToken: () => {}
    });
    expect(lastRenderOptions?.sitekey).toBe('0x4AAAAAAFw4ohsxlVQ359Nc');
    expect(lastRenderOptions?.action).toBe('signup');
    expect(screen.getByTestId('turnstile-widget')).toBeTruthy();
  });

  it('hands the token to the parent when the challenge is solved', async () => {
    const onToken = vi.fn();
    await renderWidget({ siteKey: 'site-key', action: 'login', onToken });
    lastRenderOptions?.callback?.('a-real-token');
    expect(onToken).toHaveBeenCalledWith('a-real-token');
  });

  it('clears the token when the challenge expires', async () => {
    const onToken = vi.fn();
    await renderWidget({ siteKey: 'site-key', action: 'login', onToken });
    lastRenderOptions?.callback?.('a-real-token');
    onToken.mockClear();
    lastRenderOptions?.['expired-callback']?.();
    expect(onToken).toHaveBeenCalledWith(null);
  });

  it('clears the token when the challenge errors', async () => {
    const onToken = vi.fn();
    await renderWidget({ siteKey: 'site-key', action: 'login', onToken });
    lastRenderOptions?.['error-callback']?.();
    expect(onToken).toHaveBeenCalledWith(null);
  });

  it('resets the widget when the reset signal changes', async () => {
    const onToken = vi.fn();
    const { rerender } = await renderWidget({
      siteKey: 'site-key',
      action: 'login',
      onToken
    });
    expect(resetMock).not.toHaveBeenCalled();

    rerender(
      <TurnstileWidget
        siteKey="site-key"
        action="login"
        onToken={onToken}
        resetSignal={1}
      />
    );
    // A Turnstile token is redeemed exactly once, so a retry needs a
    // fresh one — otherwise the server rejects it as already spent.
    await waitFor(() => expect(resetMock).toHaveBeenCalledWith('widget-1'));
    expect(onToken).toHaveBeenCalledWith(null);
  });

  it('does not reset on mount', async () => {
    await renderWidget({
      siteKey: 'site-key',
      action: 'login',
      onToken: () => {},
      resetSignal: 0
    });
    expect(resetMock).not.toHaveBeenCalled();
  });

  it('removes the widget on unmount', async () => {
    const { unmount } = await renderWidget({
      siteKey: 'site-key',
      action: 'login',
      onToken: () => {}
    });
    unmount();
    expect(removeMock).toHaveBeenCalledWith('widget-1');
  });
});
