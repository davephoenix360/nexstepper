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

  describe('the editor opts in', () => {
    // The user reported that printing from the editor put a band of
    // white around the resume, while the share link's print did not.
    //
    // The cause: the dashboard chrome's own padding (16px on `<main>`,
    // 32px on the page's `<section>`) plus its vertical rhythm sat
    // BETWEEN the page box and the resume, so it landed on top of the
    // `@page` margin. Measured: the text started 1.25in from the paper
    // edge instead of 0.75in — the 0.75in `@page` margin plus exactly
    // 0.5in of layout padding.
    //
    // The fix is the mechanism this file already tests: opt the editor
    // into print isolation, which repositions `.printable` to the page
    // origin. The share link is clean because it has no chrome; the
    // editor has to opt OUT of its own.
    const editorPage = readFileSync(
      resolve(
        process.cwd(),
        'app/(dashboard)/dashboard/resumes/[id]/page.tsx'
      ),
      'utf-8'
    );

    it('marks the editor page as a print-isolated root', () => {
      expect(editorPage).toContain('printable-root');
    });

    it('still renders the resume inside a .printable wrapper', () => {
      // The isolation flips everything to `visibility: hidden` except
      // `.printable` — so if the editor ever stopped rendering the
      // resume inside one, the printed page would be BLANK.
      const editable = readFileSync(
        resolve(process.cwd(), 'components/editable/editable-resume.tsx'),
        'utf-8'
      );
      expect(editable).toContain('"printable"');
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