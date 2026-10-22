'use client';

import { useEffect } from 'react';
import type { PrintSettingsCssVars } from '@/lib/print-settings';

/**
 * Mirrors the `--resume-*` custom properties onto the ROOT element.
 *
 * ## Why this component exists
 *
 * `@page { margin: var(--resume-margin, 0.4in) }` was not picking up the
 * per-resume value. The reason is a wrong assumption recorded in
 * globals.css: "CSS custom properties DO propagate into `@page` via the
 * standard cascade". They do not — not from a descendant.
 *
 * `@page` lives outside the normal element tree. Its margin resolves
 * custom properties against the ROOT element (`:root` / `<html>`), not
 * against whatever element declared them. The vars were being set
 * inline on `.printable`, which is a descendant, so `@page` never saw
 * them and always fell back to 0.4in.
 *
 * Measured consequence (2026-10-22, page-count harness):
 *
 *   standard settings   roles×bullets → pages
 *   marginOnly (compact margin, everything else standard)
 *
 * The two columns were IDENTICAL across all 27 measured combinations.
 * Changing the margin did nothing to the printed page count, while
 * line-height and section-spacing (which are consumed by descendant
 * rules and therefore inherited normally) did work. On screen the
 * preview looked like the margin had changed, because `.printable` has
 * `padding: var(--resume-margin)` and that DOES resolve the descendant
 * value. So the setting appeared to work and silently did nothing in
 * print — the worst kind of bug, because the user could see it
 * "working".
 *
 * The fix: declare the same properties on the root element as well.
 * Both places then resolve to the same value, the on-screen paper and
 * the printed page agree, and the margin actually buys space.
 */
export function PrintSettingsVars({ vars }: { vars: PrintSettingsCssVars }) {
  const margin = vars['--resume-margin'];
  const lineHeight = vars['--resume-line-height'];
  const fontSize = vars['--resume-font-size'];
  const sectionSpacing = vars['--resume-section-spacing'];

  useEffect(() => {
    const root = document.documentElement;
    const pairs: Array<[string, string | number | undefined]> = [
      ['--resume-margin', margin],
      ['--resume-line-height', lineHeight],
      ['--resume-font-size', fontSize],
      ['--resume-section-spacing', sectionSpacing]
    ];
    for (const [name, value] of pairs) {
      if (value !== undefined && value !== null) root.style.setProperty(name, String(value));
    }
    return () => {
      // Leave them in place on unmount rather than clearing: a route
      // change that swaps resumes re-renders with new values anyway,
      // and clearing would flash the fallback margin mid-navigation.
    };
  }, [margin, lineHeight, fontSize, sectionSpacing]);

  return null;
}
