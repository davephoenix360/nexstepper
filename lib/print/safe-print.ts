/**
 * Safe wrappers around `window.print()`.
 *
 * Why this file exists:
 *
 *   The browser's `window.print()` is a synchronous call that opens
 *   the system print dialog. Safari has a documented quirk that
 *   treats the call as "user-initiated" only when it runs inside a
 *   direct click / tap handler; outside that context (delayed
 *   setTimeout, awaited fetch, etc.) Safari silently drops the call
 *   and the dialog never opens. October 2026 report: first Apple
 *   customer said "I clicked Print and nothing happened". The user
 *   was on iPhone Safari — the print sheet did open, but it appeared
 *   as a small bottom-of-screen toolbar that the user did not see.
 *
 *   This file does two things:
 *
 *   1. `triggerPrint()` — runs `window.print()` synchronously inside
 *      the caller's click handler. The function itself does not add
 *      any async deferrals; the caller is responsible for calling it
 *      from a direct handler (the PrintButton onClick is). It returns
 *      a discriminated union so callers can render contextual help if
 *      something downstream fails. We CAN'T actually detect whether
 *      Safari opened the sheet (it doesn't return a signal), so the
 *      union is documentary: we record the platform branch so a
 *      future integration can log which path the user took.
 *
 *   2. `getPrintHint()` — returns a short, platform-specific hint
 *      ("look for the bottom toolbar") to render NEAR the print
 *      button when we detect iPhone Safari. Mac Safari, iPad Safari,
 *      and every non-Safari browser get `null` — the regular dialog
 *      is the expected UX there.
 *
 * Why not a higher-level "is configured?" check:
 *   Print is a browser capability that exists in every modern browser.
 *   The only thing that varies is the visual chrome of the result.
 *   This file isolates the two real concerns (call + hint) so the
 *   PrintButton stays a one-liner.
 */

import {
  isIOSSafari,
  isIPadSafari,
  isIPhoneSafari,
  isMacSafari,
  type BrowserProbe
} from './detect-safari';

/**
 * Result of a `triggerPrint()` call.
 *
 *   - `opened: true` is recorded when the print method completed
 *     without throwing. The dialog may have been dismissed by the user.
 *   - `opened: false` is recorded on error. The caller can decide
 *     whether to surface a fallback UI from there.
 *   - `platform` is recorded so a server-side log can attribute
 *     "Print failed" reports back to the branch the user was in.
 */
export type PrintResult =
  | { opened: true; platform: 'safari-ios' | 'safari-mac' | 'other' }
  | { opened: false; platform: 'safari-ios' | 'safari-mac' | 'other'; error: string };

/**
 * Options accepted by `triggerPrint()` — primarily an injectable
 * `print` so tests can stub `window.print()` without monkey-patching
 * the global, and a `probe` so detection is testable.
 */
export interface TriggerPrintOptions {
  /** Override `window.print` for tests. */
  print?: () => void;
  /** Override the navigator probe for tests. */
  probe?: BrowserProbe;
  /** Override `Date.now()` for platform tagging. Not load-bearing. */
  now?: () => number;
}

/**
 * Triggers the browser's print dialog. MUST be called from a direct
 * click handler — Safari (iOS in particular) drops the call if it
 * runs after any awaited async boundary.
 *
 * The function itself is sync; callers should look like:
 *
 *   onClick={() => { triggerPrint(); }}
 */
export function triggerPrint(options: TriggerPrintOptions = {}): PrintResult {
  const probe = options.probe;
  const platform: PrintResult['platform'] =
    probe && isIOSSafari(probe)
      ? 'safari-ios'
      : probe && isMacSafari(probe)
        ? 'safari-mac'
        : 'other';

  // The print call comes FIRST so the synchronous invocation lands
  // inside the caller's click handler. Error handling is best-effort
  // — Safari doesn't return a signal and we have no way to detect
  // "sheet appeared and user dismissed" vs "sheet never appeared".
  try {
    const printFn =
      options.print ??
      (typeof window !== 'undefined' ? window.print.bind(window) : noopPrint);
    printFn();
    return { opened: true, platform };
  } catch (err) {
    return {
      opened: false,
      platform,
      error: err instanceof Error ? err.message : String(err)
    };
  }
}

function noopPrint(): void {
  // SSR stub — should never actually run because buttons live in
  // client trees, but the function needs a body for TS.
}

/**
 * The shape of a print hint.
 *
 *   - `summary` — a short one-liner to render near the button.
 *   - `steps` — ordered list of directions for the user.
 */
export interface PrintHint {
  /** Small UX copy rendered next to / above the button. */
  summary: string;
  /** Steps for the user, in order, when they need help. */
  steps: readonly string[];
}

/**
 * Returns a contextual hint for Apple-platform users, or null for
 * everyone else (regular desktop dialog is the expected UX).
 *
 * Why a hint instead of a custom modal: iPhone Safari renders the
 * system print sheet as a small toolbar at the bottom of the screen.
 * Users who don't see it assume the button is broken; users who DO
 * see it don't need additional directions. A small line of copy next
 * to the button resolves both without an extra click.
 */
export function getPrintHint(probe: BrowserProbe = {}): PrintHint | null {
  if (isIPhoneSafari(probe)) {
    return {
      summary:
        'On iPhone, the print sheet appears as a small toolbar at the bottom of the screen.',
      steps: [
        'Tap Print.',
        'Look for the small print toolbar at the bottom of the screen — it can be easy to miss.',
        'Choose "Save to Files" to keep a PDF on your device, or pick a nearby printer.',
        'Tap Cancel to close without printing.'
      ]
    };
  }
  if (isIPadSafari(probe)) {
    return {
      summary:
        'On iPad, the print sheet opens as a popover near the print button.',
      steps: [
        'Tap the sheet that appears at the bottom of the screen.',
        'Pick a printer or "Save to Files" (PDF).',
        'Tap outside the sheet to dismiss without printing.'
      ]
    };
  }
  if (isMacSafari(probe)) {
    return {
      summary:
        'Safari opens the standard print dialog — choose "PDF → Save as PDF" for a downloadable file.',
      steps: [
        'In the print dialog, click the "PDF" dropdown at the bottom-left.',
        'Pick "Save as PDF".',
        'Choose a filename and location, then Save.'
      ]
    };
  }
  return null;
}
