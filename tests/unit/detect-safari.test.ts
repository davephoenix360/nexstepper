/**
 * Tests for `lib/print/detect-safari.ts` — UA sniffing helpers used
 * by the print UX to surface platform-specific instructions.
 *
 * October 2026 — added in response to the first Apple-using customer
 * reporting "click print, nothing happened". The user's iPhone Safari
 * was rendering the print sheet as a bottom toolbar that they didn't
 * see. We never gate behavior on UA sniffing (the print button always
 * calls window.print()), but we DO show a contextual hint when the
 * probe matches an Apple branch — these tests pin that detection.
 *
 * Every test passes an explicit `probe` (no global `navigator`), so
 * the suite is environment-agnostic and runs identically on Windows,
 * Mac, and CI runners — no host UA flake.
 */

import { describe, expect, it } from 'vitest';

import {
  isIPhoneSafari,
  isIPadSafari,
  isIOSSafari,
  isMacSafari,
  isSafari,
  type BrowserProbe
} from '@/lib/print/detect-safari';

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';

const IPAD_UA =
  'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';

const IPADOS_DISGUISED_AS_MAC_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';

const MAC_SAFARI_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';

const MAC_CHROME_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';

const WINDOWS_CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';

const LINUX_FIREFOX_UA =
  'Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0';

const CHROME_ON_IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/121.0.0.0 Mobile/15E148 Safari/604.1';

describe('detect-safari', () => {
  describe('isIPhoneSafari', () => {
    it('returns true for iPhone Safari', () => {
      expect(isIPhoneSafari({ userAgent: IPHONE_UA })).toBe(true);
    });

    it('returns false for iPad (different UX hint)', () => {
      expect(isIPhoneSafari({ userAgent: IPAD_UA })).toBe(false);
    });

    it('returns false for Mac Safari', () => {
      expect(isIPhoneSafari({ userAgent: MAC_SAFARI_UA })).toBe(false);
    });

    it('returns false for Chrome on iPhone (uses its own print path)', () => {
      expect(isIPhoneSafari({ userAgent: CHROME_ON_IPHONE_UA })).toBe(false);
    });

    it('returns false for Windows Chrome', () => {
      expect(isIPhoneSafari({ userAgent: WINDOWS_CHROME_UA })).toBe(false);
    });

    it('returns false for Linux Firefox', () => {
      expect(isIPhoneSafari({ userAgent: LINUX_FIREFOX_UA })).toBe(false);
    });

    it('returns false for empty probe (SSR / unknown)', () => {
      expect(isIPhoneSafari({})).toBe(false);
    });
  });

  describe('isIPadSafari', () => {
    it('returns true for an iPad with the classic UA', () => {
      expect(isIPadSafari({ userAgent: IPAD_UA })).toBe(true);
    });

    it('returns true for iPadOS disguised as Mac when touch points > 0', () => {
      expect(
        isIPadSafari({
          userAgent: IPADOS_DISGUISED_AS_MAC_UA,
          maxTouchPoints: 5
        })
      ).toBe(true);
    });

    it('returns false for iPadOS-style UA when touch points are 0 (real Mac)', () => {
      expect(
        isIPadSafari({
          userAgent: IPADOS_DISGUISED_AS_MAC_UA,
          maxTouchPoints: 0
        })
      ).toBe(false);
    });

    it('returns false for iPhone (different branch)', () => {
      expect(isIPadSafari({ userAgent: IPHONE_UA })).toBe(false);
    });

    it('returns false for Chrome on Mac', () => {
      expect(isIPadSafari({ userAgent: MAC_CHROME_UA })).toBe(false);
    });
  });

  describe('isIOSSafari', () => {
    it('returns true for iPhone', () => {
      expect(isIOSSafari({ userAgent: IPHONE_UA })).toBe(true);
    });

    it('returns true for iPad', () => {
      expect(isIOSSafari({ userAgent: IPAD_UA })).toBe(true);
    });

    it('returns false for Mac Safari', () => {
      expect(isIOSSafari({ userAgent: MAC_SAFARI_UA })).toBe(false);
    });

    it('returns false for an empty probe', () => {
      expect(isIOSSafari({})).toBe(false);
    });
  });

  describe('isMacSafari', () => {
    it('returns true for Mac Safari with no touch points', () => {
      expect(
        isMacSafari({ userAgent: MAC_SAFARI_UA, maxTouchPoints: 0 })
      ).toBe(true);
    });

    it('returns false for Mac Chrome (not Safari)', () => {
      expect(isMacSafari({ userAgent: MAC_CHROME_UA })).toBe(false);
    });

    it('returns false for Windows Chrome', () => {
      expect(isMacSafari({ userAgent: WINDOWS_CHROME_UA })).toBe(false);
    });

    it('returns false for iPadOS disguised as Mac when touch points > 0', () => {
      // The iPad branch handles touch points > 0; Mac Safari only
      // applies to desktops where maxTouchPoints is 0.
      expect(
        isMacSafari({
          userAgent: IPADOS_DISGUISED_AS_MAC_UA,
          maxTouchPoints: 5
        })
      ).toBe(false);
    });
  });

  describe('isSafari', () => {
    it('returns true for iPhone Safari', () => {
      expect(isSafari({ userAgent: IPHONE_UA })).toBe(true);
    });

    it('returns true for iPad Safari', () => {
      expect(isSafari({ userAgent: IPAD_UA })).toBe(true);
    });

    it('returns true for Mac Safari', () => {
      expect(
        isSafari({ userAgent: MAC_SAFARI_UA, maxTouchPoints: 0 })
      ).toBe(true);
    });

    it('returns false for Mac Chrome', () => {
      expect(isSafari({ userAgent: MAC_CHROME_UA })).toBe(false);
    });

    it('returns false for Linux Firefox', () => {
      expect(isSafari({ userAgent: LINUX_FIREFOX_UA })).toBe(false);
    });
  });

  it('accepts an injected probe without touching navigator (test isolation)', () => {
    // The whole point of the probe injection is that the suite runs
    // on a Windows CI runner without its UA leaking into the results.
    // This test enforces that the helpers ignore globals.
    const result = isIPhoneSafari({ userAgent: IPHONE_UA });
    expect(result).toBe(true);
  });
});
