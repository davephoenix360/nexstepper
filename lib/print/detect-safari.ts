/**
 * Lightweight Apple-platform detection for print UX.
 *
 * Why UA sniffing at all: the print button is the one place where we
 * ship platform-specific copy. On iPhone / iPad, the system print
 * sheet is a small bottom toolbar that's easy to miss; on macOS Safari
 * the print dialog is a normal modal. Telling the user "look at the
 * bottom of the screen" is much friendlier than letting them think
 * the button is broken.
 *
 * UA sniffing is brittle by definition — Apple deliberately folds iPad
 * into desktop-Mac strings in iPadOS 13+ to defeat UA-based
 * fingerprinting, and Chromium flags Safari as "Safari" when the
 * WebKit engine is in play. That brittleness is acceptable here: we
 * use the result to surface an OPTIONAL hint, never to gate behavior.
 * A wrong hint costs a sentence of extra copy; gating behavior on UA
 * would silently break something on the next iOS version.
 *
 * Signature: every helper accepts an optional `probe` so unit tests
 * don't need a real navigator. Pattern mirrors
 * `components/editable/save-shortcut.ts` (the `isMacPlatform` /
 * `getSaveShortcutLabel` helpers there).
 *
 * October 2026 — added in response to the first Apple-using customer
 * reporting "click print, nothing happened". Their Safari was rendering
 * the system print sheet at the bottom of the screen; we had no
 * contextual hint pointing them there.
 */

export interface BrowserProbe {
  /** navigator.userAgent (or a fake one for tests). */
  userAgent?: string;
  /** navigator.vendor (some browsers only populate vendor). */
  vendor?: string;
  /** navigator.platform (deprecated but useful as a secondary signal). */
  platform?: string;
  /**
   * navigator.maxTouchPoints. iPads (including iPadOS-disguised-as-Mac)
   * report ≥ 1; Mac desktops report 0 unless a touchscreen is attached.
   * Used to disambiguate iPad from Mac when the UA says "Mac".
   */
  maxTouchPoints?: number;
}

/**
 * Returns true when the probe looks like an iPhone-running-Safari.
 * iPad Safari is intentionally excluded — iPad has a different UX
 * (full print dialog sheet, not the phone's bottom toolbar).
 *
 * Examples that should match:
 *   "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1"
 *
 * Examples that should NOT match:
 *   "... (iPad; CPU OS 17_4 ...) ..." (iPad branch)
 *   "... (Macintosh; Intel Mac OS X 10_15_7) ..." (desktop branch)
 *   "... Firefox/121 ..." (not WebKit)
 */
export function isIPhoneSafari(probe: BrowserProbe = readBrowser()): boolean {
  const ua = probe.userAgent ?? '';
  if (!/iPhone/i.test(ua)) return false;
  // Exclude Chrome-on-iOS (CriOS) and Firefox-on-iOS (FxiOS) — those
  // have their own print paths that we don't need to pre-hint.
  if (/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua)) return false;
  return /Safari/i.test(ua) && /AppleWebKit/i.test(ua) && !/Android/i.test(ua);
}

/**
 * Returns true when the probe looks like an iPad. iPadOS 13+
 * deliberately returns a desktop-Mac UA to defeat fingerprinting,
 * so we layer `maxTouchPoints > 0` as the disambiguator: a Mac
 * with no touchscreen reports 0, an iPad always reports at least 1.
 */
export function isIPadSafari(probe: BrowserProbe = readBrowser()): boolean {
  const ua = probe.userAgent ?? '';
  // Classic iPad UA (iOS 12 and earlier).
  if (/iPad/i.test(ua)) {
    if (/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua)) return false;
    return /Safari/i.test(ua) && /AppleWebKit/i.test(ua);
  }
  // iPadOS 13+ disguise: report Mac + multi-touch → treat as iPad.
  if (/Macintosh/i.test(ua) && (probe.maxTouchPoints ?? 0) > 0) {
    return true;
  }
  return false;
}

/**
 * Returns true for any iPhone-or-iPad Safari variant.
 * The two are split because the UX hint is different (phone's tiny
 * bottom toolbar vs the iPad's regular modal sheet), but most call
 * sites want either-or.
 */
export function isIOSSafari(probe: BrowserProbe = readBrowser()): boolean {
  return isIPhoneSafari(probe) || isIPadSafari(probe);
}

/**
 * Returns true for desktop macOS Safari (no touch points).
 */
export function isMacSafari(probe: BrowserProbe = readBrowser()): boolean {
  const ua = probe.userAgent ?? '';
  if (!/Macintosh/i.test(ua)) return false;
  // Skip iPadOS-disguised-as-Mac.
  if ((probe.maxTouchPoints ?? 0) > 0) return false;
  // Safari proper (not Chrome/Firefox/Edge on Mac).
  if (/Chrome|CriOS|Firefox|FxiOS|Edg|OPR/i.test(ua)) return false;
  return /Safari/i.test(ua) && /AppleWebKit/i.test(ua);
}

/**
 * Returns true for any Safari variant (iPhone, iPad, Mac).
 */
export function isSafari(probe: BrowserProbe = readBrowser()): boolean {
  return isIPhoneSafari(probe) || isIPadSafari(probe) || isMacSafari(probe);
}

/**
 * Reads the real navigator values into a probe. SSR-safe: returns an
 * empty object when `navigator` is undefined (no UA, no vendor, no
 * platform). All detection helpers then resolve to `false`, which is
 * the correct default for "we don't know, don't show a hint".
 */
function readBrowser(): BrowserProbe {
  if (typeof navigator === 'undefined') return {};
  return {
    userAgent: navigator.userAgent,
    vendor: navigator.vendor,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints
  };
}
