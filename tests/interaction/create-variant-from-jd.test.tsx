/**
 * @vitest-environment jsdom
 *
 * Interaction tests for the "Tailor with a JD" flow.
 *
 * ## Why these exist
 *
 * The flow had two bugs that a render-only assertion cannot see, and
 * the user hit both:
 *
 * 1. On success the component set the modal stage to `'working'`, not
 *    `'done'`. The auto-dismiss that triggers the navigation only fires
 *    when `done` is true, so the modal sat on the loading beat forever
 *    and the user was NEVER taken to their new variant.
 * 2. The form `<Dialog>` is a native `<dialog>` opened with
 *    `showModal()`, which puts it in the browser's TOP LAYER. Top-layer
 *    elements paint above everything regardless of z-index, so the
 *    parsing modal (z-[100]) was invisible behind it — the user saw
 *    the form spinning on a small button instead of the full-screen
 *    progress view the code clearly intended.
 *
 * Both are only observable by actually submitting and watching what
 * renders. `renderToStaticMarkup` never dispatches a click.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const push = vi.fn();
const refresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh, replace: vi.fn(), back: vi.fn() })
}));

const createVariantFromJdAction = vi.fn();
vi.mock('@/app/(dashboard)/dashboard/resumes/actions', () => ({
  createVariantFromJdAction: (...args: unknown[]) =>
    createVariantFromJdAction(...args)
}));

import { CreateVariantFromJdButton } from '@/app/(dashboard)/dashboard/resumes/_components/create-variant-from-jd-button';

/**
 * jsdom 25 has no `<dialog>` support — `showModal` and `close` are
 * undefined, and the Dialog component calls both. Polyfill a minimal
 * version that toggles the `open` attribute and fires the `close` event
 * (which the component listens to), so the test exercises the real
 * open/close handshake rather than a stubbed-out dialog.
 */
function installDialogPolyfill() {
  const proto = window.HTMLDialogElement.prototype as unknown as {
    showModal?: () => void;
    close?: (returnValue?: string) => void;
  };
  if (typeof proto.showModal === 'function') return;
  proto.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  proto.close = function (this: HTMLDialogElement, returnValue?: string) {
    this.removeAttribute('open');
    if (returnValue !== undefined) this.returnValue = returnValue;
    this.dispatchEvent(new Event('close'));
  };
}

const JD = 'We are hiring a full stack engineer to build insurance software for dental offices. You will work in TypeScript and Python.';

describe('CreateVariantFromJdButton', () => {
  beforeEach(() => {
    installDialogPolyfill();
    vi.clearAllMocks();
    createVariantFromJdAction.mockResolvedValue({
      ok: true,
      data: { id: 'variant-123' }
    });
  });

  it('shows the parsing modal while the variant is being created', async () => {
    const user = userEvent.setup();
    render(
      <CreateVariantFromJdButton masterId="m-1" masterName="Test Resume 1" />
    );

    await user.click(screen.getByTestId('tailor-with-jd-m-1'));

    const textarea = screen.getByTestId('jd-input-m-1');
    await user.type(textarea, JD);
    await user.click(screen.getByRole('button', { name: /create variant/i }));

    await waitFor(() => {
      expect(screen.getByTestId('ai-parsing-modal')).toBeTruthy();
    });
    // The WORKING beat, not the success beat — the action has resolved
    // by now, so it should have moved on.
    await waitFor(() => {
      expect(
        screen.getByTestId('ai-parsing-modal').getAttribute('data-done')
      ).toBe('true');
    });
  });

  it('navigates to the new variant after the success beat', async () => {
    const user = userEvent.setup();
    render(
      <CreateVariantFromJdButton masterId="m-1" masterName="Test Resume 1" />
    );

    await user.click(screen.getByTestId('tailor-with-jd-m-1'));
    await user.type(screen.getByTestId('jd-input-m-1'), JD);
    await user.click(screen.getByRole('button', { name: /create variant/i }));

    // The auto-dismiss fires 1.5s after `done`. That only happens if
    // the component set the stage to 'done' — the bug this test pins.
    //
    // The `?autotailor=1` marker tells the variant page to run the
    // tailoring pass automatically.
    await waitFor(
      () => {
        expect(push).toHaveBeenCalledWith(
          '/dashboard/resumes/variant-123?autotailor=1'
        );
      },
      { timeout: 5000 }
    );
    expect(refresh).toHaveBeenCalled();
  });

  it('closes the form dialog so the parsing modal is actually visible', async () => {
    // A native <dialog> in the top layer paints over the parsing modal
    // no matter what z-index the modal has. The form dialog has to be
    // closed once the variant exists, or the user stares at a spinner
    // on a small button instead of the full-screen progress view.
    const user = userEvent.setup();
    render(
      <CreateVariantFromJdButton masterId="m-1" masterName="Test Resume 1" />
    );

    await user.click(screen.getByTestId('tailor-with-jd-m-1'));
    const dialog = screen.getByTestId('dialog-root');
    expect(dialog.hasAttribute('open')).toBe(true);

    await user.type(screen.getByTestId('jd-input-m-1'), JD);
    await user.click(screen.getByRole('button', { name: /create variant/i }));

    await waitFor(() => {
      expect(dialog.hasAttribute('open')).toBe(false);
    });
  });

  it('surfaces an error and stays on the form when creation fails', async () => {
    createVariantFromJdAction.mockResolvedValue({
      ok: false,
      error: 'Master resume not found'
    });
    const user = userEvent.setup();
    render(
      <CreateVariantFromJdButton masterId="m-1" masterName="Test Resume 1" />
    );

    await user.click(screen.getByTestId('tailor-with-jd-m-1'));
    await user.type(screen.getByTestId('jd-input-m-1'), JD);
    await user.click(screen.getByRole('button', { name: /create variant/i }));

    await waitFor(() => {
      expect(screen.getByTestId('jd-error-card')).toBeTruthy();
    });
    expect(push).not.toHaveBeenCalled();
    // No modal left spinning over a failed request.
    expect(screen.queryByTestId('ai-parsing-modal')).toBeNull();
  });
});
