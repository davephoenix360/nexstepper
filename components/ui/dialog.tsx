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
 * Usage:
 *   <Dialog open={open} onOpenChange={setOpen} title="Edit Skills">
 *     <SomeForm />
 *   </Dialog>
 */

import * as React from 'react';
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

  return (
    <dialog
      ref={ref}
      onClose={() => onOpenChange(false)}
      onClick={handleClick}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className={cn(
        // Reset user-agent stylesheet, then dress up. We render the
        // backdrop via @media (max-width: 0) trick? No — <dialog>'s
        // built-in ::backdrop works in modern browsers.
        'm-0 p-0 bg-transparent',
        'backdrop:bg-zinc-900/40 backdrop:backdrop-blur-sm',
        // Center + slot for inner card. Tailwind's `open:` lets us
        // animate the dialog in (browser support varies).
        'open:flex open:items-start open:justify-center open:min-h-screen open:overflow-y-auto open:py-12 open:px-4'
      )}
    >
      <div
        className={cn(
          'relative w-full rounded-xl border bg-background p-6 shadow-xl',
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
          className="no-print absolute right-3 top-3 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-300/50"
        >
          <X className="size-4" />
        </button>
        {title && (
          <h2 id="dialog-title" className="mb-1 pr-8 text-base font-semibold tracking-tight">
            {title}
          </h2>
        )}
        {description && (
          <p id="dialog-description" className="mb-4 text-sm text-muted-foreground">
            {description}
          </p>
        )}
        {children}
      </div>
    </dialog>
  );
}
