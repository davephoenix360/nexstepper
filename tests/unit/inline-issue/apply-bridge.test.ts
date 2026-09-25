import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  dispatchInlineIssueApply,
  subscribeToInlineIssueApply,
  INLINE_ISSUE_APPLY_EVENT,
  dispatchInlineIssueTip,
  subscribeToInlineIssueTip,
  INLINE_ISSUE_TIP_EVENT
} from '@/lib/inline-issue/apply-bridge';

/**
 * Tests for the apply-bridge pub/sub.
 *
 * The bridge is the scorecard → editor communication channel for
 * the inline-issue surface (see `lib/inline-issue/apply-bridge.ts`).
 * The scorecard calls `dispatchInlineIssueApply({ path, text })`
 * when the user clicks Apply; the editor subscribes via
 * `subscribeToInlineIssueApply()` and writes the rewrite into
 * its RHF form.
 *
 * These tests cover the bridge in isolation — the scorecard +
 * editor integration is exercised by the manual smoke test
 * (Plan §"Test plan" #7).
 *
 * We polyfill `window` so the bridge can dispatch + subscribe.
 */

// Minimal window-ish shape — the bridge only touches
// addEventListener / removeEventListener / dispatchEvent.
type FakeWindow = {
  addEventListener(name: string, fn: (e: Event) => void): void;
  removeEventListener(name: string, fn: (e: Event) => void): void;
  dispatchEvent(e: Event): boolean;
};

describe('apply-bridge', () => {
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

  it('exports a stable event name', () => {
    expect(INLINE_ISSUE_APPLY_EVENT).toBe('nexstepper:inline-issue:apply');
  });

  it('dispatch + subscribe round-trips the payload', () => {
    const handler = vi.fn();
    const unsubscribe = subscribeToInlineIssueApply(handler);
    dispatchInlineIssueApply({
      path: 'sections.work[0].highlights[0]',
      text: 'New bullet text'
    });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({
      path: 'sections.work[0].highlights[0]',
      text: 'New bullet text'
    });
    unsubscribe();
  });

  it('unsubscribe stops further deliveries', () => {
    const handler = vi.fn();
    const unsubscribe = subscribeToInlineIssueApply(handler);
    dispatchInlineIssueApply({ path: 'a', text: '1' });
    unsubscribe();
    dispatchInlineIssueApply({ path: 'a', text: '2' });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('multiple subscribers each receive the payload', () => {
    const a = vi.fn();
    const b = vi.fn();
    const unsubA = subscribeToInlineIssueApply(a);
    const unsubB = subscribeToInlineIssueApply(b);
    dispatchInlineIssueApply({ path: 'x', text: 'y' });
    expect(a).toHaveBeenCalledWith({ path: 'x', text: 'y' });
    expect(b).toHaveBeenCalledWith({ path: 'x', text: 'y' });
    unsubA();
    unsubB();
  });

  it('dispatch is a no-op when window is undefined', () => {
    // Simulate SSR — no window. Should not throw.
    (globalThis as { window?: FakeWindow }).window = undefined;
    expect(() =>
      dispatchInlineIssueApply({ path: 'x', text: 'y' })
    ).not.toThrow();
    // Restore for afterEach.
    (globalThis as { window?: FakeWindow }).window = originalWindow;
  });

  describe('tip-event bridge', () => {
    it('exports a stable tip event name', () => {
      expect(INLINE_ISSUE_TIP_EVENT).toBe('nexstepper:inline-issue:tip');
    });

    it('dispatch + subscribe round-trips the tip payload', () => {
      const handler = vi.fn();
      const unsubscribe = subscribeToInlineIssueTip(handler);
      dispatchInlineIssueTip({
        sectionSlug: 'experience',
        sectionTitle: 'Experience',
        criterion: 'ATS Coverage'
      });
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith({
        sectionSlug: 'experience',
        sectionTitle: 'Experience',
        criterion: 'ATS Coverage'
      });
      unsubscribe();
    });

    it('tip subscribers do not receive apply events (cross-talk guard)', () => {
      const tipHandler = vi.fn();
      const applyHandler = vi.fn();
      const unsubTip = subscribeToInlineIssueTip(tipHandler);
      const unsubApply = subscribeToInlineIssueApply(applyHandler);
      dispatchInlineIssueTip({
        sectionSlug: 'skills',
        sectionTitle: 'Skills',
        criterion: 'Intent Coverage'
      });
      expect(tipHandler).toHaveBeenCalledTimes(1);
      expect(applyHandler).not.toHaveBeenCalled();
      dispatchInlineIssueApply({ path: 'x', text: 'y' });
      expect(applyHandler).toHaveBeenCalledTimes(1);
      expect(tipHandler).toHaveBeenCalledTimes(1); // unchanged
      unsubTip();
      unsubApply();
    });

    it('tip dispatch is a no-op when window is undefined', () => {
      (globalThis as { window?: FakeWindow }).window = undefined;
      expect(() =>
        dispatchInlineIssueTip({
          sectionSlug: 'x',
          sectionTitle: 'X',
          criterion: 'ATS Coverage'
        })
      ).not.toThrow();
      (globalThis as { window?: FakeWindow }).window = originalWindow;
    });
  });
});