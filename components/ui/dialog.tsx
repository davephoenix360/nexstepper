'use client';

/**
 * Dialog — a small accessible modal built on the native <dialog> element.
 *
 * Why native: avoids the Radix Dialog dep, modern browsers ship focus
 * traps + Esc handling + backdrop-clicks-to-close for free, and the
 * rendered output is exactly what the user expects from a modal
 * (sticky inset, focus restored on close).
 *
 * Trade-off vs Radix: less configurable animation out of the box.
 * For the section-edit dialogs in this slice we don't need fancy
 * transitions, so native is fine. If we add animated sheets later,
 * we can move this to Radix Dialog or build a Radix-backed Sheet.
 *
 * ## Portal rendering (Phase 1c fix)
 *
 * Rendered via `createPortal(..., document.body)` so the `<dialog>`
 * escapes every ancestor's CSS positioning context. Even though
 * Tailwind sets `position: fixed; inset: 0` on the dialog, a
 * containing block created by a transform / filter / perspective /
 * will-change / contain: paint ancestor (the dashboard sidebar has
 * `transform`) would otherwise make `position: fixed` position
 * relative to that ancestor instead of the viewport — and the
 * modal would drift to wherever the trigger button sits. Portaling
 * to body eliminates every potential containing block at once.
 *
 * ## Centering (Phase 1b fix → Phase 4 polish)
 *
 * The native `<dialog>` UA stylesheet centers the element via
 * `margin: auto` with `width: fit-content`. We override `m-0` to
 * strip that auto-margin, AND we apply `position: fixed; inset: 0`
 * so the dialog fills the viewport.
 *
 * Centering the inner card is done with `grid place-items-center`
 * (not `flex items-center justify-center`) because:
 *   - The native `<dialog>` element with `showModal()` enters the
 *     browser's top layer. In some browsers (notably older Safari
 *     and a few Chromium edge cases), the top-layer styling can
 *     override `position: fixed` and fall back to the UA's
 *     `position: absolute` + `margin: auto` centering. Grid
 *     centering works regardless: as long as the dialog spans the
 *     viewport (via `inset: 0` or the UA's
 *     `inset-block-start: 0; inset-block-end: 0`), the inner card
 *     is centered on both axes via `place-items-center`.
 *   - Grid centering is more robust than flex against the UA's
 *     `width: fit-content` quirk on `<dialog>`.
 *
 * ## Body scroll lock (Phase 4 polish)
 *
 * When the modal is open we set `document.body.style.overflow =
 * 'hidden'`. Without this, the page body keeps its own scrollbar
 * behind the modal — the user sees TWO scrollbars (the modal's
 * internal one + the page body's) and the page can still scroll
 * while the modal is open. Locking the body eliminates the second
 * scrollbar and the "is the modal really modal?" ambiguity.
 *
 * ## Single scroll context (Phase 4 polish)
 *
 * The dialog itself does NOT scroll (`overflow: visible` from UA).
 * All scrolling lives in the inner card body via
 * `flex-1 min-h-0 overflow-y-auto`. The card is capped at
 * `max-h-[calc(100dvh-2rem)]` (matches the dialog's `p-4` padding
 * = 1rem on each side) so it can never exceed the viewport. This
 * eliminates the previous "two scrollbars" bug (one on the dialog,
 * one on the card body).
 *
 * ## Height cap (Phase 1b fix)
 *
 * `100dvh` (dynamic viewport height) handles mobile browser chrome
 * resizing the viewport on scroll — fixed `100vh` would compute
 * against the larger initial viewport and leave a gap.
 *
 * Usage:
 *   <Dialog open={open} onOpenChange={setOpen} title="Edit Skills">
 *     <SomeForm />
 *   </Dialog>
 *
 * Tip for tall inputs: pair with `<Textarea className="max-h-[60vh]
 * overflow-y-auto">` so the textarea — not the card — owns the
 * scroll. See `create-variant-from-jd-button.tsx` for the worked
 * example.
 */

import * as React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

import { cn } from '@/lib/utils';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  /** Tailwind max-width class. Default `max-w-lg`. */
  widthClassName?: string;
  children: React.ReactNode;
  /** A11y label for the close button (defaults to "Close"). */
  closeLabel?: string;
}

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  widthClassName = 'max-w-lg',
  children,
  closeLabel = 'Close'
}: DialogProps) {
  const ref = React.useRef<HTMLDialogElement>(null);
  // Guard against SSR — `document` is undefined on the server, so we
  // can only render the portal client-side. Pre-rendering the JSX
  // also avoids a hydration mismatch (the portal target doesn't
  // exist on the server).
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  // Sync the imperative `showModal()` / `close()` calls with our `open`
  // prop. Native <dialog> has its own open state and won't reopen via
  // setting the attribute alone in all browsers.
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    else if (!open && el.open) el.close();
  }, [open]);

  // Body scroll lock — see the docstring above. We capture and
  // restore the previous `overflow` value so we don't stomp on a
  // pre-existing inline style (rare, but defensive).
  React.useEffect(() => {
    if (!open || !mounted) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open, mounted]);

  // Click on the backdrop (the dialog element itself, not its content)
  // closes. The dialog's own ::backdrop pseudo doesn't fire clicks
  // reliably across browsers, so we attach a click handler on the
  // dialog and check the target.
  function handleClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === ref.current) onOpenChange(false);
  }

  // Esc closes — browsers handle this automatically for <dialog>, but
  // we listen so the React state stays in sync (native close events
  // bubble to the dialog element so onClose is enough).
  // Stable IDs for aria-labelledby / aria-describedby. Wired only
  // when the corresponding prop is provided, so screen readers
  // announce title and description as the dialog's accessible
  // name and description.
  const titleId = title ? 'dialog-title' : undefined;
  const descriptionId = description ? 'dialog-description' : undefined;

  if (!mounted) return null;

  return createPortal(
    <dialog
      ref={ref}
      onClose={() => onOpenChange(false)}
      onClick={handleClick}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      data-testid="dialog-root"
      className={cn(
        // Reset the UA stylesheet and pin the dialog to the viewport.
        // We set FOUR things explicitly because the native `<dialog>`
        // element's top-layer styling is browser-quirky:
        //   1. `fixed inset-0` — pins the dialog to all four edges
        //      of the viewport (works in browsers that honor
        //      `position: fixed` on top-layer dialogs).
        //   2. `h-[100dvh] w-screen` — EXPLICIT width/height. The UA
        //      stylesheet gives `<dialog>` `width: fit-content` and
        //      `max-width: calc((100% - 2 * 3px) - 2 * 1em)`. Without
        //      explicit width, the dialog shrinks to fit content even
        //      when `inset: 0` says "span the viewport". `100dvh`
        //      (dynamic viewport height) handles mobile browser chrome
        //      resizing the viewport on scroll.
        //   3. `max-w-none max-h-none` — strips the UA's `max-width`
        //      and `max-height` so our explicit width/height win.
        //   4. `m-0` — strips the UA's `margin: auto`. We rely on
        //      `inset: 0` + grid centering instead of UA auto-margin
        //      because the auto-margin behavior conflicts with our
        //      explicit width/height in some browsers.
        // Together these guarantee the dialog fills the viewport on
        // every browser, which is what makes `place-items-center`
        // actually center the inner card.
        'fixed inset-0 z-50 m-0 h-[100dvh] w-screen max-w-none max-h-none bg-transparent p-0',
        // Dim the page behind the modal. Bumped from `/40` to `/60`
        // so the modal feels distinctly on top of the page — the
        // lighter `/40` made the page content feel "right next to"
        // the modal which read as "the modal is a side panel" rather
        // than "the modal is a modal".
        'backdrop:bg-zinc-900/60 backdrop:backdrop-blur-sm',
        // Grid centering (NOT flex — see docstring). We gate on
        // `open:` so the dialog stays at its UA `display: none`
        // when closed; the `open:` variant targets the `[open]`
        // attribute that `showModal()` sets.
        'open:grid open:place-items-center open:p-4',
        // The dialog itself does NOT scroll (single scroll context
        // rule — see docstring). All scrolling lives in the inner
        // card body. We deliberately omit any `overflow-y-auto`
        // here to fix the double-scrollbar bug.
      )}
    >
      <div
        data-testid="dialog-card"
        className={cn(
          // `relative` keeps the absolute close button anchored.
          // `w-full` lets the card stretch up to `max-w-*`.
          // `flex flex-col` + `max-h` keeps the card bounded and
          // gives us a header/body layout.
          'relative flex w-full flex-col overflow-hidden rounded-xl border bg-background shadow-xl',
          // Card max height matches the dialog's `p-4` padding
          // (1rem on each side = 2rem total) so the card can fill
          // the viewport minus its breathing room without ever
          // exceeding the visible area.
          'max-h-[calc(100dvh-2rem)]',
          widthClassName
        )}
        // Stop propagation so clicks inside the card don't bubble up
        // to the dialog itself (which we use to detect backdrop clicks).
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          aria-label={closeLabel}
          className="no-print absolute right-3 top-3 z-10 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-300/50"
        >
          <X className="size-4" />
        </button>
        {title && (
          <h2
            id="dialog-title"
            className="shrink-0 border-b px-6 pb-3 pt-5 pr-12 text-base font-semibold tracking-tight"
          >
            {title}
          </h2>
        )}
        <div
          className={cn(
            // `flex-1 min-h-0` lets this div grow to fill the card
            // and shrink below its content height, which activates
            // the `overflow-y-auto` scroll when content is taller
            // than the card. Without `min-h-0`, flex children default
            // to `min-height: auto` and refuse to shrink. This is
            // the SINGLE scroll context — the dialog itself never
            // scrolls.
            'min-h-0 flex-1 overflow-y-auto px-6 py-4',
            title ? '' : 'pt-6'
          )}
        >
          {description && (
            <p
              id="dialog-description"
              className="mb-4 text-sm text-muted-foreground"
            >
              {description}
            </p>
          )}
          {children}
        </div>
      </div>
    </dialog>,
    document.body
  );
}