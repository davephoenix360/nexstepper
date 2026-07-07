'use client';

import { Printer } from 'lucide-react';

import { Button } from '@/components/ui/button';

/**
 * Triggers the browser's print dialog. The actual @page rules (page size,
 * margins, background colors) live in `app/globals.css` under `@media print`
 * and `@page` — this button is just the user-visible affordance that hangs
 * a button on top of `window.print()`.
 *
 * Phase 1 lets users save the preview as a PDF via the browser's
 * "Save as PDF" target in the print dialog. Phase 2 replaces this with a
 * dedicated "Download PDF" button that routes through Playwright.
 */
export function PrintButton() {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => window.print()}
      data-testid="print-button"
    >
      <Printer className="mr-2 size-4" />
      Print / Save as PDF
    </Button>
  );
}
