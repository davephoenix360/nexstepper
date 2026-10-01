/**
 * Tests for the print-isolation CSS (Phase 1g, plan:
 * docs/plans/print-default-opt-in.md).
 *
 * Browser print rendering is hard to assert from jsdom (the actual
 * print pipeline runs in the browser's native renderer, not in
 * any DOM API we can mock). Instead, we assert the source-level
 * invariants that prevent the regression class:
 *
 *   1. The CSS source contains the `.printable-root` opt-in rules
 *      under `@media print`. If a future refactor accidentally
 *      drops them, this test catches it.
 *   2. The `ProLaunchingSoonBanner` has `no-print` on its outer
 *      wrapper. This was the source of the original bug — the
 *      banner lacked `no-print` so it leaked into the user's PDF.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProLaunchingSoonBanner } from '@/components/billing/pro-launching-soon-cta';

describe('print isolation (Phase 1g)', () => {
  describe('globals.css source', () => {
    const css = readFileSync(
      resolve(process.cwd(), 'app/globals.css'),
      'utf-8'
    );

    it('declares the .printable-root opt-in rule under @media print', () => {
      // The opt-in rule is scoped via .printable-root — we don't
      // want a global flip-default because that would blank Ctrl+P
      // output on every page that hasn't been audited for printable
      // content (dashboard list, billing card, settings, etc.).
      expect(css).toMatch(/\.printable-root\s*\*\s*\{\s*visibility:\s*hidden/);
    });

    it('reverses the visibility on .printable inside .printable-root', () => {
      expect(css).toMatch(
        /\.printable-root\s+\.printable,?\s*\.printable-root\s+\.printable\s*\*\s*\{\s*visibility:\s*visible/
      );
    });

    it('repositions .printable to the page origin so it does not carry the surrounding layout', () => {
      expect(css).toMatch(
        /\.printable-root\s+\.printable\s*\{[^}]*position:\s*absolute[^}]*left:\s*0[^}]*top:\s*0/
      );
    });
  });

  describe('ProLaunchingSoonBanner', () => {
    it('has the no-print class on its outermost <div> (defense-in-depth against the original leak)', () => {
      // Phase 1g regression test: the original bug was that this
      // banner leaked into the user's resume PDF because it lacked
      // `no-print`. Now the banner is wrapped in `.no-print` AND
      // the preview route uses `.printable-root` for the print
      // flip default. The class on the banner is defense-in-depth
      // for every OTHER dashboard page.
      const html = renderToStaticMarkup(<ProLaunchingSoonBanner />);
      expect(html).toContain('no-print');
      expect(html).toContain('data-testid="pro-launching-soon-banner"');
      // Sanity: the banner copy is intact.
      expect(html).toContain('Pro is launching soon');
    });
  });
});