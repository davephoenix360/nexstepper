'use client';

import { useEffect, useState } from 'react';
import { Printer } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { PrintHelpTrigger } from '@/components/print/print-help-dialog';
import { getPrintHint, triggerPrint } from '@/lib/print/safe-print';

/**
 * One-click "Print" button for the editor.
 *
 * Triggers `window.print()` directly. The browser's native print
 * dialog opens, the user picks their destination (PDF, printer,
 * "Save to Files", etc.), and they're done. One click from the
 * editor to output, no preview-route hop.
 *
 * Why direct print (vs the previous flow: open /preview?print=1 in
 * a new tab)?
 *   - The previous flow was two clicks (button + dialog) AND a new
 *     tab. The new flow is one click + a dialog. The dialog is
 *     unavoidable (the browser requires it) so two interactions is
 *     the floor; the new tab was unnecessary.
 *   - The print output uses the same `@media print` rules in
 *     `globals.css` (`.no-print` on the chrome, white background,
 *     `@page { size: letter; margin: var(--resume-margin) }`), so
 *     the editor and the preview route produce the same PDF. The
 *     only thing the preview route added was rendering the resume
 *     at 8.5" max-width on the page; the editor's
 *     `<EditableResume>` already does that via the template's
 *     `max-w-[8.5in]`.
 *
 * Why not a high-level /api/pdf/render-resume route?
 *   Next.js 16's App Router blocks the `react-dom/server` import
 *   in route handlers (it reserves it for its own RSC pipeline).
 *   The proper fix is a separate worker process — tracked as a
 *   Phase 2.4+ item. Until then, the browser's print engine
 *   produces the same Tailwind-styled output as a real PDF pipeline
 *   would, with the bonus that the user keeps the original Tailwind
 *   styles (selectable text, accessible markup) rather than a
 *   flattened image.
 *
 * ## October 2026 — Apple-platform print fix
 *
 * Safari (iOS in particular) renders `window.print()` as the system
 * print sheet, which on iPhone is a small toolbar at the bottom of
 * the screen. The first Apple-using customer reported the button
 * didn't work because they didn't see the toolbar. We don't gate
 * behavior on UA sniffing — `triggerPrint()` itself is sync — but on
 * Apple platforms we now render a "Not opening?" link next to the
 * button that opens a PrintHelpDialog with platform-specific
 * directions (where to look, what to tap). See
 * `lib/print/safe-print.ts` and `lib/print/detect-safari.ts`.
 */
export function PrintButton({
  resumeId
}: {
  /** Kept for parity with the previous API; the editor already has the resume in its tree. */
  resumeId: string;
}) {
  // `hint` is resolved client-side because UA sniffing only makes
  // sense in a browser context. SSR renders `hint = null` (no help
  // link shown) and the effect upgrades it after hydration. This is
  // a pure UX copy — behaviour is identical between server and client.
  const [hint, setHint] = useState<ReturnType<typeof getPrintHint>>(null);
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    setHint(getPrintHint());
  }, []);

  return (
    <span
      // Keep Print + the contextual help link on one row in the
      // toolbar. `inline-flex` so the help trigger wraps naturally
      // on narrow screens instead of dropping to a new line.
      className="inline-flex items-center"
    >
      <Button
        type="button"
        variant="outline"
        size="sm"
        // window.print() is synchronous; the browser shows the
        // native dialog. After the user picks a destination (or
        // cancels), the editor regains focus. Called DIRECTLY from
        // the click handler — NOT inside a setTimeout, await, or
        // fetch.then — because Safari drops the call when the
        // user-activation token has expired (i.e. async-boundary
        // crossings). See lib/print/safe-print.ts.
        onClick={() => {
          triggerPrint();
        }}
        data-testid="print-button"
      >
        <Printer className="mr-2 size-4" />
        Print
      </Button>
      {hint ? (
        <PrintHelpTrigger
          hint={hint}
          open={helpOpen}
          onOpenChange={setHelpOpen}
        />
      ) : null}
    </span>
  );
}
