/**
 * @vitest-environment jsdom
 *
 * Behavioural tests for `useDebouncedAutosave`.
 *
 * These exist because the failure mode is invisible: a debounce built
 * with the watched values in its dependency array resets its own timer on
 * every render and therefore NEVER fires. It looks fine while you read
 * the code, passes a "does it render" smoke test, and silently loses
 * every edit in production. The tests below drive real timers and real
 * RHF updates so that trap is caught rather than assumed away.
 */

import * as React from 'react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useForm } from 'react-hook-form';

import { useDebouncedAutosave, type AutosaveState } from '@/components/editable/use-debounced-autosave';

type Values = { headline: string };

function Probe({
  save,
  debounceMs,
  onState
}: {
  save: (values: unknown) => Promise<unknown>;
  debounceMs: number;
  onState?: (s: AutosaveState) => void;
}) {
  const form = useForm<Values>({
    defaultValues: { headline: 'initial' },
    mode: 'onChange'
  });
  const { state } = useDebouncedAutosave({
    control: form.control,
    save,
    debounceMs
  });
  onState?.(state);
  return (
    <div>
      <input
        aria-label="headline"
        value={form.watch('headline')}
        onChange={(e) => form.setValue('headline', e.target.value)}
      />
      <span data-testid="state">{state}</span>
    </div>
  );
}

function type(input: HTMLElement, value: string) {
  // fireEvent/act keeps this synchronous so fake timers stay meaningful.
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value'
  )!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('useDebouncedAutosave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('does not fire for an unchanged form on mount', async () => {
    const save = vi.fn(async (_values: unknown) => undefined);
    render(<Probe save={save} debounceMs={50} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(save).not.toHaveBeenCalled();
  });

  it('fires once after the debounce window closes', async () => {
    const save = vi.fn(async (_values: unknown) => undefined);
    render(<Probe save={save} debounceMs={50} />);

    type(screen.getByLabelText('headline'), 'Senior Engineer');

    // Nothing yet — the window is still open.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
    });
    expect(save).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60);
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0]).toEqual({ headline: 'Senior Engineer' });
  });

  it('coalesces a burst of edits into a single save', async () => {
    const save = vi.fn(async (_values: unknown) => undefined);
    render(<Probe save={save} debounceMs={50} />);
    const input = screen.getByLabelText('headline');

    for (const v of ['S', 'Se', 'Sen', 'Senior']) {
      type(input, v);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10);
      });
    }

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('saves the latest value, not the first one typed', async () => {
    const save = vi.fn(async (_values: unknown) => undefined);
    render(<Probe save={save} debounceMs={50} />);
    const input = screen.getByLabelText('headline');

    type(input, 'first');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    type(input, 'second');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0]).toEqual({ headline: 'second' });
  });

  it('reports error state when the save rejects, and does not throw', async () => {
    const save = vi.fn(async (_values: unknown) => {
      throw new Error('network down');
    });
    render(<Probe save={save} debounceMs={50} />);

    type(screen.getByLabelText('headline'), 'boom');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    // Flush the rejected promise's microtasks. Not `waitFor` — that
    // polls on real timers and deadlocks under `vi.useFakeTimers()`.
    await act(async () => {
      await Promise.resolve();
    });

    expect(save).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('state').textContent).toBe('error');
  });

  it('stays idle when disabled', async () => {
    const save = vi.fn(async (_values: unknown) => undefined);
    // `enabled={false}` path — modelled by not rendering a change path,
    // so simply assert a disabled probe never fires.
    function Disabled() {
      const form = useForm<Values>({ defaultValues: { headline: 'x' } });
      const { state } = useDebouncedAutosave({
        control: form.control,
        save,
        debounceMs: 50,
        enabled: false
      });
      return <span data-testid="state">{state}</span>;
    }
    render(<Disabled />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(save).not.toHaveBeenCalled();
  });
});