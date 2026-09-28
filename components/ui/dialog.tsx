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
 * ## Centering (Phase 1b fix)
 *
 * The native `<dialog>` UA stylesheet centers the element via
 * `margin: auto` with `width: fit-content`. We override `m-0` to
 * strip that auto-margin, AND we apply `position: fixed; inset: 0`
 * so the dialog fills the viewport. Combined with
 * `flex items-center justify-center`, the inner card is centered on
 * BOTH axes regardless of content height.
 *
 * ## Height cap (Phase 1b fix)
 *
 * The inner card uses `flex flex-col` with a `max-h-[calc(100dvh-3rem)]`
 * wrapper, a sticky title header, and a `flex-1 min-h-0 overflow-y-auto`
 * body. Long content scrolls inside the body instead of pushing the
 * card past the screen edge. `100dvh` (dynamic viewport height) handles
 * mobile browser chrome resizing the viewport on scroll.
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
      className={cn(
        // Reset the UA stylesheet and pin the dialog to the viewport.
        // `fixed inset-0` is what makes the flex centering below work
        // on both axes — without it the dialog sits at top-left and
        // gets clipped on tall content (Phase 1b regression).
        'fixed inset-0 z-50 m-0 bg-transparent',
        'backdrop:bg-zinc-900/40 backdrop:backdrop-blur-sm',
        // `open:flex` keeps the dialog hidden when closed (UA's
        // display: none has lower specificity than author CSS, so we
        // MUST gate `display: flex` on the [open] attribute).
        'open:flex open:items-center open:justify-center',
        // The dialog itself is the scroll container for the rare
        // case where even the capped card is too tall for the
        // viewport (small phone landscape, etc.). Padding reserves
        // breathing room from the viewport edges.
        'open:overflow-y-auto open:p-4 sm:open:p-6 md:open:p-8'
      )}
    >
      <div
        className={cn(
          // `relative` keeps the absolute close button anchored.
          // `w-full` lets the card stretch up to `max-w-*`.
          // `flex flex-col` + `max-h` keeps the card bounded and
          // gives us a header/body layout.
          'relative flex w-full flex-col overflow-hidden rounded-xl border bg-background shadow-xl',
          'max-h-[calc(100dvh-3rem)]',
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
            // to `min-height: auto` and refuse to shrink.
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