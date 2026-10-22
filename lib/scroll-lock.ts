/**
 * Ref-counted body scroll lock.
 *
 * ## Why this exists
 *
 * The "Tailor with a JD" flow opens TWO overlays: the form `<Dialog>`
 * and the full-screen `<AiParsingModal>`. Both used to do their own
 * capture-and-restore of `document.body.style.overflow`:
 *
 *   Dialog opens   → captures ''      → sets 'hidden'
 *   Modal opens    → captures 'hidden' → sets 'hidden'
 *   Dialog closes  → restores ''        ← correct
 *   Modal closes   → restores 'hidden'  ← WRONG, and it wins
 *
 * The modal captured the value the DIALOG had set, so its "previous"
 * was not the page's original state. Whichever overlay unmounted last
 * decided the final value, and the order was not guaranteed. The
 * observable symptom: land on the new variant and the page will not
 * scroll — the body is still locked — until you reload.
 *
 * Two independent capture/restore pairs cannot be made correct. A
 * ref-counted lock can: the first lock records the page's original
 * value, the last unlock restores it, and the ones in between are
 * no-ops. Order-independent by construction.
 */

let locks = 0;
let originalOverflow: string | null = null;

export function lockBodyScroll(): void {
  if (typeof document === 'undefined') return;

  if (locks === 0) {
    originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  locks++;
}

export function unlockBodyScroll(): void {
  if (typeof document === 'undefined') return;

  locks = Math.max(0, locks - 1);
  if (locks > 0) return;

  if (originalOverflow !== null) {
    document.body.style.overflow = originalOverflow;
    originalOverflow = null;
  }
}

/**
 * Test helper — resets the counter and restores the body. Not for
 * production use.
 */
export function __resetBodyScrollLock(): void {
  locks = 0;
  if (typeof document !== 'undefined' && originalOverflow !== null) {
    document.body.style.overflow = originalOverflow;
  }
  originalOverflow = null;
}
