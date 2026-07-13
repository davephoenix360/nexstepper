'use client';

import { Printer } from 'lucide-react';

import { Button } from '@/components/ui/button';

/**
 * One-click "Download PDF" button for the editor.
 *
 * Opens the preview route in a new tab with `?print=1`. The preview
 * page auto-triggers `window.print()` on mount (see auto-print.tsx),
 * which produces the browser's native print dialog. The user picks
 * "Save as PDF" and they're done — two clicks total.
 *
 * Why not call the high-level /api/pdf/render-resume route?
 *   Next.js 16's App Router blocks the `react-dom/server` import
 *   in route handlers (it reserves it for its own RSC pipeline).
 *   The proper fix is a separate worker process — tracked as a
 *   Phase 2.4+ item. Until then, the browser's print engine
 *   produces the same Tailwind-styled output (the preview page
 *   uses the same @page rules + compiled CSS as the PDF pipeline
 *   would).
 *
 * Why a new tab (vs same-tab navigation)?
 *   - Doesn't disrupt the user's in-progress edit
 *   - Lets them keep editing while the print dialog is up
 *   - Browser print dialogs block the originating tab; new tab
 *     leaves the editor usable.
 */
export function DownloadPdfButton({ resumeId }: { resumeId: string }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => {
        // Use window.open so the navigation happens in a new tab;
        // the editor stays mounted and the user's unsaved edits
        // aren't disturbed.
        window.open(
          `/dashboard/resumes/${resumeId}/preview?print=1`,
          '_blank',
          'noopener,noreferrer'
        );
      }}
      data-testid="download-pdf-button"
    >
      <Printer className="mr-2 size-4" />
      Download PDF
    </Button>
  );
}
