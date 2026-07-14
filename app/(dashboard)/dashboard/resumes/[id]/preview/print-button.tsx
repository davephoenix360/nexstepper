'use client';

import { Download, Printer } from 'lucide-react';

import { Button } from '@/components/ui/button';

/**
 * Triggers the browser's print dialog. The user picks "Save as PDF" in
 * the destination dropdown to get a real PDF on their machine.
 *
 * The actual @page rules (page size, margins, background colors) live
 * in `app/globals.css` under `@media print` and `@page` — this button
 * is just the user-visible affordance that hangs a button on top of
 * `window.print()`. The browser's print engine produces the same
 * Tailwind-styled output the user sees on screen, no third-party
 * renderer required.
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
      <Download className="mr-2 size-4" />
      Save as PDF
    </Button>
  );
}
