/**
 * Regression test for the InlineIssueTip positioning bug.
 *
 * The previous implementation anchored the tip to the section
 * header (`left: active.rect.left; maxWidth: active.rect.width`).
 * On a narrow section like a one-line Skills header, the tip
 * collapsed to ~30px wide and wrapped each character onto its
 * own line — unreadable. Worse, it sat on top of the resume
 * content the user was trying to fix.
 *
 * The Oct 2026 fix pins the tip in the bottom-left of the
 * viewport with a fixed 420px width. This test pins the file
 * so a future refactor can't silently re-introduce the bug.
 *
 * Source-pin rather than render-test: the InlineIssueTip mounts
 * into a `createPortal(..., document.body)` which requires a
 * real DOM, and the layout-sensitive bugs we'd want to catch
 * are CSS values, not component shape. Inspecting the source
 * keeps the test fast + framework-agnostic.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const TIP_SOURCE = readFileSync(
  join(process.cwd(), 'lib/inline-issue/inline-issue-tip.tsx'),
  'utf8'
);

describe('InlineIssueTip — positioning (Oct 2026 fix)', () => {
  it('pins the tip to the bottom-left of the viewport', () => {
    // The fix replaces the section-anchored style block. Both
    // the success-path style AND the no-header fallback must
    // agree on this — if either reverts, the bug is back.
    expect(TIP_SOURCE).toMatch(/bottom:\s*24/);
    expect(TIP_SOURCE).toMatch(/left:\s*24/);
    expect(TIP_SOURCE).toMatch(/width:\s*420/);
  });

  it('caps the max-width by viewport, not by section header width', () => {
    // The old buggy code was:
    //   maxWidth: Math.min(560, active.rect.width || 560)
    // which collapsed the card to ~30px on narrow sections.
    // The new code is a viewport-relative cap, so the worst
    // case is "the tip is half the viewport on a phone", which
    // is still readable.
    expect(TIP_SOURCE).toMatch(/maxWidth:\s*'calc\(100vw - 48px\)'/);

    // Defence-in-depth: the literal `active.rect.width` must
    // not appear in any style object — if it does, the bug is
    // back in some form.
    expect(TIP_SOURCE).not.toMatch(/active\.rect\.width/);
  });

  it('uses position: fixed so the tip is anchored to the viewport, not the section', () => {
    expect(TIP_SOURCE).toMatch(/position:\s*'fixed'/);
  });
});
