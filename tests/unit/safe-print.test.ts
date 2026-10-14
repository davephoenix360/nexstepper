/**
 * Tests for `lib/print/safe-print.ts` — `triggerPrint` + `getPrintHint`.
 *
 * Pins:
 *   - `triggerPrint` calls the injected print() and returns
 *     `opened: true` with the platform tag from the probe. We use an
 *     injected print stub so the test never fires a real window.print
 *     and never reads navigator globals.
 *   - `triggerPrint` catches exceptions from the injected print and
 *     returns `opened: false` with the error message. The graceful
 *     fallback the user sees when Safari silently drops the call relies
 *     on this branch — see `components/print/print-help-dialog.tsx`.
 *   - `getPrintHint` returns the right platform-specific hint for each
 *     Safari branch and `null` for non-Safari branches (regular
 *     browsers don't need extra copy).
 *
 * October 2026 — added alongside the first Apple-using customer's
 * "click Print, nothing happened" report.
 */

import { describe, expect, it } from 'vitest';

import { getPrintHint, triggerPrint } from '@/lib/print/safe-print';

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const IPAD_UA =
  'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const MAC_SAFARI_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';
const WINDOWS_CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';
const LINUX_FIREFOX_UA =
  'Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0';

describe('triggerPrint', () => {
  it('calls the injected print function and returns opened: true', () => {
    let called = false;
    const print = () => {
      called = true;
    };
    const result = triggerPrint({
      print,
      probe: { userAgent: WINDOWS_CHROME_UA }
    });
    expect(called).toBe(true);
    expect(result).toEqual({ opened: true, platform: 'other' });
  });

  it('tags the result "safari-ios" for an iPhone probe', () => {
    const print = () => undefined;
    const result = triggerPrint({
      print,
      probe: { userAgent: IPHONE_UA }
    });
    expect(result).toEqual({ opened: true, platform: 'safari-ios' });
  });

  it('tags the result "safari-ios" for an iPad probe', () => {
    const print = () => undefined;
    const result = triggerPrint({
      print,
      probe: { userAgent: IPAD_UA }
    });
    expect(result).toEqual({ opened: true, platform: 'safari-ios' });
  });

  it('tags the result "safari-mac" for a Mac Safari probe', () => {
    const print = () => undefined;
    const result = triggerPrint({
      print,
      probe: { userAgent: MAC_SAFARI_UA, maxTouchPoints: 0 }
    });
    expect(result).toEqual({ opened: true, platform: 'safari-mac' });
  });

  it('tags the result "other" for a Firefox probe', () => {
    const print = () => undefined;
    const result = triggerPrint({
      print,
      probe: { userAgent: LINUX_FIREFOX_UA }
    });
    expect(result).toEqual({ opened: true, platform: 'other' });
  });

  it('returns opened: false with the error message when print throws', () => {
    const print = () => {
      throw new Error('Print dialog suppressed by browser policy');
    };
    const result = triggerPrint({
      print,
      probe: { userAgent: IPHONE_UA }
    });
    expect(result).toEqual({
      opened: false,
      platform: 'safari-ios',
      error: 'Print dialog suppressed by browser policy'
    });
  });

  it('handles non-Error throws without crashing', () => {
    const print = () => {
      // eslint-disable-next-line @typescript-eslint/no-throw-literal -- intentional non-Error throw
      throw 'string error';
    };
    const result = triggerPrint({
      print,
      probe: { userAgent: WINDOWS_CHROME_UA }
    });
    expect(result.opened).toBe(false);
    if (!result.opened) {
      expect(result.error).toBe('string error');
    }
  });
});

describe('getPrintHint', () => {
  it('returns a phone-specific hint for iPhone Safari', () => {
    const hint = getPrintHint({ userAgent: IPHONE_UA });
    expect(hint).not.toBeNull();
    expect(hint?.summary).toMatch(/bottom of the screen/i);
    expect(hint?.steps.length).toBeGreaterThanOrEqual(3);
    expect(hint?.steps.some((s) => /print toolbar/i.test(s))).toBe(true);
    expect(hint?.steps.some((s) => /Save to Files/i.test(s))).toBe(true);
  });

  it('returns an iPad-specific hint for iPad Safari', () => {
    const hint = getPrintHint({ userAgent: IPAD_UA });
    expect(hint).not.toBeNull();
    expect(hint?.summary).toMatch(/iPad/i);
  });

  it('returns a Mac Safari hint that mentions the PDF dropdown', () => {
    const hint = getPrintHint({
      userAgent: MAC_SAFARI_UA,
      maxTouchPoints: 0
    });
    expect(hint).not.toBeNull();
    expect(hint?.summary).toMatch(/Save as PDF/i);
    expect(hint?.steps.some((s) => /PDF/i.test(s))).toBe(true);
  });

  it('returns null for Windows Chrome (default dialog is fine)', () => {
    expect(getPrintHint({ userAgent: WINDOWS_CHROME_UA })).toBeNull();
  });

  it('returns null for Linux Firefox (default dialog is fine)', () => {
    expect(getPrintHint({ userAgent: LINUX_FIREFOX_UA })).toBeNull();
  });

  it('returns null for an empty probe', () => {
    expect(getPrintHint({})).toBeNull();
  });

  it('returns null when called with no probe argument (SSR-safe)', () => {
    // When called with no args the function reads the live navigator —
    // in a test environment that yields empty/no match. Pinning the
    // expected SSR behaviour here keeps the function's contract
    // explicit: SSR returns null, hydration upgrades it.
    expect(getPrintHint()).toBeNull();
  });
});
