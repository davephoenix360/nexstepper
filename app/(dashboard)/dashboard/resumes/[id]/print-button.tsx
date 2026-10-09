'use client';

import { Printer } from 'lucide-react';

import { Button } from '@/components/ui/button';

/**
 * One-click "Print" button for the editor.
 *
 * Calls `window.print()` directly. The browser's native print dialog
 * opens, the user picks their destination (PDF, printer, "Save to
 * Files", etc.), and they're done. One click from the editor to
 * output, no preview-route hop.
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
 */
export function PrintButton({
  resumeId
}: {
  /** Kept for parity with the previous API; the editor already has the resume in its tree. */
  resumeId: string;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => {
        // window.print() is synchronous; the browser shows the
        // native dialog. After the user picks a destination
        // (or cancels), the editor regains focus.
        window.print();
      }}
      data-testid="print-button"
    >
      <Printer className="mr-2 size-4" />
      Print
    </Button>
  );
}
