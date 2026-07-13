'use client';

import { useEffect, useRef } from 'react';

/**
 * Auto-prints the page on mount when `enabled` is true.
 *
 * The preview page passes `enabled={true}` when the URL has
 * `?print=1`. The browser opens the print dialog as soon as the
 * page is interactive — the user just picks "Save as PDF" and
 * they're done. Two clicks total from the editor: "Download PDF"
 * → "Save".
 *
 * Why guard with `enabled` (vs always-on `window.print()` on mount)?
 *   The preview route is also useful for just *looking* at a
 * resume (no intent to print). Auto-printing on every visit would
 * be hostile. The opt-in query param keeps the surface intentional.
 *
 * Why the `useRef` + double-mount guard?
 *   React strict mode in dev double-invokes effects. Without the
 * ref, the user would see two print dialogs in dev. The ref makes
 * the auto-print fire exactly once per page load.
 */
export function AutoPrintOnLoad({ enabled }: { enabled: boolean }) {
  const fired = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    if (fired.current) return;
    fired.current = true;
    // Give the browser a beat to render the resume before the
    // dialog snaps in. 100ms is enough on a typical machine and
    // imperceptible to the user.
    const timer = setTimeout(() => window.print(), 100);
    return () => clearTimeout(timer);
  }, [enabled]);

  return null;
}
