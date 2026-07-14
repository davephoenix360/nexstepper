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
 *   React strict mode in dev double-invokes effects. The first
 * effect run schedules the timer; the cleanup cancels it; the
 * second effect run sees the ref unset and re-schedules. Only the
 * SECOND scheduling's timer actually fires. We set `fired.current
 * = true` INSIDE the timeout callback (not at effect entry) so the
 *   ref flips only once the dialog has actually opened — otherwise
 * the second effect run would short-circuit on the ref check and
 * the print dialog would never appear in dev.
 */
export function AutoPrintOnLoad({ enabled }: { enabled: boolean }) {
  const fired = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    if (fired.current) return;
    // Give the browser a beat to render the resume before the
    // dialog snaps in. 100ms is enough on a typical machine and
    // imperceptible to the user. The ref flip happens INSIDE the
    // callback so strict-mode dev can survive the double-invoke
    // (see JSDoc above for the full trace).
    const timer = setTimeout(() => {
      fired.current = true;
      window.print();
    }, 100);
    return () => clearTimeout(timer);
  }, [enabled]);

  return null;
}
