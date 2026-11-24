import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  dispatchInlineIssueTip,
  subscribeToInlineIssueTip,
  INLINE_ISSUE_TIP_EVENT
} from '@/lib/inline-issue/apply-bridge';

/**
 * Tests for the inline-issue tip bridge.
 *
 * The scorecard (right rail) and the editor (left column) are sibling
 * Client Components with separate state, including the editor's RHF
 * form. A dim-bar or skill-gap click must make the editor scroll to the
 * measured leaf, pulse its section header and render the scorecard's
 * tip — without lifting the form up to the page level.
 *
 * The old Apply half of this bridge carried Pro-only AI rewrites into
 * the editor. That surface is retired; flagged bullets hand off to
 * Scout instead. This suite pins the one bridge that remains.
 *
 * We polyfill `window` so the bridge can dispatch + subscribe.
 */

type FakeWindow = {
  addEventListener(name: string, fn: (e: Event) => void): void;
  removeEventListener(name: string, fn: (e: Event) => void): void;
  dispatchEvent(e: Event): boolean;
};

describe('inline-issue tip bridge', () => {
  let originalWindow: FakeWindow | undefined;
  let listeners: Map<string, Set<(e: Event) => void>>;

  beforeEach(() => {
    listeners = new Map();
    const fake: FakeWindow = {
      addEventListener: (name, fn) => {
        let set = listeners.get(name);
        if (!set) {
          set = new Set();
          listeners.set(name, set);
        }
        set.add(fn);
      },
      removeEventListener: (name, fn) => {
        listeners.get(name)?.delete(fn);
      },
      dispatchEvent: (e) => {
        const set = listeners.get(e.type);
        if (set) for (const fn of set) fn(e);
        return true;
      }
    };
    originalWindow = (globalThis as { window?: FakeWindow }).window;
    (globalThis as { window?: FakeWindow }).window = fake;
  });

  afterEach(() => {
    if (originalWindow === undefined) {
      (globalThis as { window?: FakeWindow }).window = undefined;
    } else {
      (globalThis as { window?: FakeWindow }).window = originalWindow;
    }
  });

  it('exports a stable tip event name', () => {
    expect(INLINE_ISSUE_TIP_EVENT).toBe('nexstepper:inline-issue:tip');
  });

  it('dispatch + subscribe round-trips the tip payload', () => {
    const handler = vi.fn();
    const unsubscribe = subscribeToInlineIssueTip(handler);
    dispatchInlineIssueTip({
      sectionSlug: 'experience',
      sectionTitle: 'Experience',
      criterion: 'ATS Keyword Match'
    });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({
      sectionSlug: 'experience',
      sectionTitle: 'Experience',
      criterion: 'ATS Keyword Match'
    });
    unsubscribe();
  });

  it('unsubscribe stops further deliveries', () => {
    const handler = vi.fn();
    const unsubscribe = subscribeToInlineIssueTip(handler);
    dispatchInlineIssueTip({
      sectionSlug: 'work',
      sectionTitle: 'Experience',
      criterion: 'Accomplishment Focus'
    });
    expect(handler).toHaveBeenCalledTimes(1);
    unsubscribe();
    dispatchInlineIssueTip({
      sectionSlug: 'work',
      sectionTitle: 'Experience',
      criterion: 'Accomplishment Focus'
    });
    // The first delivery happened before the unsubscribe; only the
    // second dispatch must be suppressed.
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('multiple subscribers each receive the payload', () => {
    const a = vi.fn();
    const b = vi.fn();
    const unsubA = subscribeToInlineIssueTip(a);
    const unsubB = subscribeToInlineIssueTip(b);
    dispatchInlineIssueTip({
      sectionSlug: 'skills',
      sectionTitle: 'Skills',
      criterion: 'Intent Coverage'
    });
    expect(a).toHaveBeenCalledWith({
      sectionSlug: 'skills',
      sectionTitle: 'Skills',
      criterion: 'Intent Coverage'
    });
    expect(b).toHaveBeenCalledWith({
      sectionSlug: 'skills',
      sectionTitle: 'Skills',
      criterion: 'Intent Coverage'
    });
    unsubA();
    unsubB();
  });

  it('dispatch is a no-op when window is undefined', () => {
    (globalThis as { window?: FakeWindow }).window = undefined;
    expect(() =>
      dispatchInlineIssueTip({
        sectionSlug: 'x',
        sectionTitle: 'X',
        criterion: 'ATS Keyword Match'
      })
    ).not.toThrow();
    (globalThis as { window?: FakeWindow }).window = originalWindow;
  });
});
