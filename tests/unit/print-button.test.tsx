/**
 * Tests for the editor's Print button (Oct 2026 — one-click print).
 *
 * Pins:
 *   - The button is labeled "Print" (not "Save as PDF" or
 *     "Download PDF" — that wording was misleading because we don't
 *     hand the user a file, we route them through the browser's
 *     print dialog).
 *   - The icon is `Printer`, not `Download` or `Eye` (this is a
 *     trigger, not a viewer / a download affordance).
 *   - The data-testid is `print-button` (was `see-pdf-preview-button`
 *     and `download-pdf-button` previously).
 *   - The onClick handler references `window.print()` — pins the
 *     source-level "no new tab, no navigation" guarantee.
 *
 * The project runs vitest with `environment: 'node'` (no jsdom — see
 * AGENTS.md "How to verify before committing"), so we use the
 * standard SSR + renderToStaticMarkup pattern. Click-handler
 * behavior is pinned at the source level (we assert the rendered
 * markup contains a button element, and grep the source file for
 * the `window.print()` call) rather than simulated at the DOM level.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';

import { PrintButton } from '@/app/(dashboard)/dashboard/resumes/[id]/print-button';

const PRINT_BUTTON_SOURCE = readFileSync(
  resolve(
    process.cwd(),
    'app/(dashboard)/dashboard/resumes/[id]/print-button.tsx'
  ),
  'utf8'
);

describe('PrintButton — editor one-click print (Oct 2026)', () => {
  it('renders a button labeled "Print" (not "Save as PDF" / "Download PDF")', () => {
    const html = renderToStaticMarkup(
      React.createElement(PrintButton, { resumeId: 'r-1' })
    );
    expect(html).toContain('>Print<');
    expect(html).not.toContain('Save as PDF');
    expect(html).not.toContain('Download PDF');
    expect(html).not.toContain('See PDF preview');
  });

  it('uses the Printer icon (not Download or Eye)', () => {
    const html = renderToStaticMarkup(
      React.createElement(PrintButton, { resumeId: 'r-1' })
    );
    expect(html).toMatch(/class="lucide lucide-printer/);
    expect(html).not.toMatch(/class="lucide lucide-eye/);
    expect(html).not.toMatch(/class="lucide lucide-download/);
  });

  it('carries the stable data-testid "print-button" (was see-pdf-preview-button)', () => {
    const html = renderToStaticMarkup(
      React.createElement(PrintButton, { resumeId: 'r-1' })
    );
    expect(html).toContain('data-testid="print-button"');
  });

  it('onClick calls window.print() directly — no new tab, no navigation', () => {
    // Source-level pin: the handler must call window.print() and
    // must NOT use window.open or location.href. A future refactor
    // that re-introduces a new-tab hop would fail this test.
    expect(PRINT_BUTTON_SOURCE).toMatch(/window\.print\(\)/);
    expect(PRINT_BUTTON_SOURCE).not.toMatch(/window\.open/);
    expect(PRINT_BUTTON_SOURCE).not.toMatch(/location\.href/);
    expect(PRINT_BUTTON_SOURCE).not.toMatch(/router\.push/);
  });
});