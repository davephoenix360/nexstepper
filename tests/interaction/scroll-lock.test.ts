/**
 * @vitest-environment jsdom
 *
 * Regression test for the scroll-lock race that left the new variant
 * unscrollable.
 *
 * The "Tailor with a JD" flow opens two overlays: the form `<Dialog>`
 * and the full-screen `<AiParsingModal>`. Both used to capture and
 * restore `document.body.style.overflow` independently:
 *
 *   Dialog opens   → captures ''       → sets 'hidden'
 *   Modal opens    → captures 'hidden' → sets 'hidden'
 *   Dialog closes  → restores ''        ← correct
 *   Modal closes   → restores 'hidden'  ← WRONG, and it wins
 *
 * The modal's "previous" was the value the DIALOG had set, not the
 * page's original state — so the page was left with the body locked
 * and would not scroll until a reload.
 *
 * The fix is a ref-counted lock: the first lock records the original
 * value, the last unlock restores it, and the ones in between are
 * no-ops. Order-independent by construction.
 */
import { describe, expect, it, beforeEach } from 'vitest';

import {
  __resetBodyScrollLock,
  lockBodyScroll,
  unlockBodyScroll
} from '@/lib/scroll-lock';

describe('body scroll lock', () => {
  beforeEach(() => {
    __resetBodyScrollLock();
    document.body.style.overflow = '';
  });

  it('locks and restores the body', () => {
    lockBodyScroll();
    expect(document.body.style.overflow).toBe('hidden');
    unlockBodyScroll();
    expect(document.body.style.overflow).toBe('');
  });

  it('restores the original value even when unlocked out of order', () => {
    // Two overlays, the way the JD flow actually stacks them.
    lockBodyScroll();
    lockBodyScroll();

    // The DIALOG closes first while the modal is still open.
    unlockBodyScroll();
    expect(document.body.style.overflow).toBe('hidden');

    // The modal closes second — it must restore the PAGE's original
    // value, not the value the dialog happened to leave behind.
    unlockBodyScroll();
    expect(document.body.style.overflow).toBe('');
  });

  it('survives a third nested overlay', () => {
    lockBodyScroll();
    lockBodyScroll();
    lockBodyScroll();
    unlockBodyScroll();
    unlockBodyScroll();
    expect(document.body.style.overflow).toBe('hidden');
    unlockBodyScroll();
    expect(document.body.style.overflow).toBe('');
  });

  it('preserves a pre-existing inline overflow value', () => {
    document.body.style.overflow = 'scroll';
    lockBodyScroll();
    expect(document.body.style.overflow).toBe('hidden');
    unlockBodyScroll();
    expect(document.body.style.overflow).toBe('scroll');
    document.body.style.overflow = '';
  });

  it('does not go negative on an extra unlock', () => {
    lockBodyScroll();
    unlockBodyScroll();
    unlockBodyScroll();
    unlockBodyScroll();
    expect(document.body.style.overflow).toBe('');
  });
});
