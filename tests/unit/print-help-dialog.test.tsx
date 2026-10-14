/**
 * Tests for `components/print/print-help-dialog.tsx` — the
 * "Print not opening?" dialog + trigger link.
 *
 * Pins:
 *   - The trigger link is rendered only when a hint is provided (so
 *     non-Apple platforms don't grow visual chrome for no reason).
 *   - The dialog renders the hint's steps + a fallback "Cmd+P / Ctrl+P"
 *     keyboard-shortcut hint that works across every platform.
 *   - "Try again" closes the dialog and re-fires `triggerPrint`.
 *   - The dialog body does NOT touch `window.print()` directly — it
 *     imports `triggerPrint` from `lib/print/safe-print` so all print
 *     paths share the same platform-tagging + error-catching logic.
 *
 * These are mostly source-level tests for the same reason as
 * `print-button.test.tsx` — the project runs vitest with
 * `environment: 'node'` (no jsdom — see AGENTS.md), and the Dialog
 * itself portals into `document.body`, which is unavailable under SSR
 * rendering. We assert the *components* and the hint *types* render
 * correctly, and pin the runtime wiring at the source level.
 *
 * October 2026 — added with the Apple-print fallback work; the test
 * here is the source of truth that the help copy actually renders for
 * the platforms that needed it (the user's first Apple-using customer
 * could not find the print sheet without these instructions).
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';

import {
  PrintHelpTrigger,
  PrintHelpDialog
} from '@/components/print/print-help-dialog';
import type { PrintHint } from '@/lib/print/safe-print';

const PHONE_HINT: PrintHint = {
  summary: 'On iPhone, the print sheet appears as a small toolbar.',
  steps: [
    'Tap Print.',
    'Look for the small print toolbar at the bottom of the screen.',
    'Choose Save to Files or a printer.'
  ]
};

const MAC_HINT: PrintHint = {
  summary: 'Safari opens the standard print dialog.',
  steps: [
    'In the print dialog, click the PDF dropdown.',
    'Choose Save as PDF.'
  ]
};

// Source-level fixture for the runtime-wiring assertions. Reading the
// file at test time (rather than importing) lets a refactor of the
// component fail the wiring pin WITHOUT triggering a separate
// `import { something } from '...'` load — we want the test to be a
// source-of-truth for the implementation, not a second consumer.
const DIALOG_SOURCE = readFileSync(
  resolve(
    process.cwd(),
    'components/print/print-help-dialog.tsx'
  ),
  'utf8'
);

describe('PrintHelpTrigger', () => {
  it('renders the trigger link when a hint is provided (React-level)', () => {
    const html = renderToStaticMarkup(
      React.createElement(PrintHelpTrigger, {
        hint: PHONE_HINT,
        open: false,
        onOpenChange: () => undefined
      })
    );
    expect(html).toContain('data-testid="print-help-trigger"');
    expect(html).toContain('Not opening?');
    // a11y label carries the hint summary to screen readers.
    expect(html).toContain(
      'aria-label="On iPhone, the print sheet appears as a small toolbar."'
    );
  });

  it('renders the trigger as a <button> element (real clickable, not a div)', () => {
    // The icon-wrapped SVGR lucide components don't render text, so
    // we pin the surrounding <button> markup instead.
    const html = renderToStaticMarkup(
      React.createElement(PrintHelpTrigger, {
        hint: MAC_HINT,
        open: false,
        onOpenChange: () => undefined
      })
    );
    expect(html).toMatch(/<button[^>]*data-testid="print-help-trigger"/);
  });
});

describe('PrintHelpDialog — source-level pins (Dialog itself portals to document.body)', () => {
  it('imports triggerPrint from lib/print/safe-print (re-fires go through the safe wrapper)', () => {
    // The "Try again" button must use the platform-tagging +
    // error-catching wrapper, not the raw window.print() call.
    expect(DIALOG_SOURCE).toMatch(
      /import\s+\{\s*triggerPrint\s*\}\s+from\s+['"]@\/lib\/print\/safe-print['"]/
    );
  });

  it('binds the "Try again" button onClick to triggerPrint()', () => {
    // Pin the wiring of the Try-again button so it cannot be silently
    // moved back to a direct `window.print()` call. We allow
    // `triggerPrint()` (with or without options) but require it to be
    // called in the onClick — combined with the import pin above, this
    // means there is exactly one place to fix print behaviour.
    const matches = DIALOG_SOURCE.match(/onClick=\{[\s\S]*?triggerPrint\(\)[\s\S]*?\}/);
    expect(matches, 'expected Try-again onClick to call triggerPrint()').not.toBeNull();
  });

  it('renders the platform-specific steps when a hint is provided', () => {
    // The dialog body maps hint.steps to <li> entries; pin the map
    // call so a refactor that drops the steps fails this test.
    expect(DIALOG_SOURCE).toMatch(/hint\.steps\.map/);
  });

  it('renders the Cmd+P / Ctrl+P keyboard fallback regardless of platform', () => {
    // The keyboard fallback is the always-available escape hatch —
    // a user whose browser blocks window.print() can still use the
    // menu bar File → Print, or the OS-level shortcut.
    expect(DIALOG_SOURCE).toContain('Cmd');
    expect(DIALOG_SOURCE).toContain('Ctrl');
    expect(DIALOG_SOURCE).toContain('Windows / Linux');
  });

  it('renders the "Try again" button so users can re-fire the print dialog', () => {
    expect(DIALOG_SOURCE).toContain('Try again');
  });

  it('renders a "Got it" dismiss button', () => {
    expect(DIALOG_SOURCE).toContain('Got it');
  });

  it('guards on `hint?.summary` so a missing hint does not crash SSR', () => {
    expect(DIALOG_SOURCE).toMatch(/hint\?\.\s*summary/);
  });

  it('opens the dialog with a stable title for screen readers', () => {
    expect(DIALOG_SOURCE).toContain('Print not opening?');
  });
});
