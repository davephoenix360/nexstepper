'use client';

/**
 * PrintHelpDialog — the contextual "Print isn't working? Try this"
 * dialog shown by the editor's Print button on Apple platforms.
 *
 * Why it exists:
 *
 *   The first Apple-using customer (October 2026) reported that
 *   tapping Print did nothing. What actually happened: iPhone Safari
 *   DID open the print sheet, but it appeared as a small bottom-of-
 *   screen toolbar that the user did not see. They closed the tab
 *   thinking the button was broken.
 *
 *   This dialog is the graceful fallback suggested in the print-
 *   research note we worked from. We render it conditionally — only
 *   when the platform probe matches an Apple branch — and we never
 *   gate behavior on UA sniffing; the dialog is informational.
 *
 *   The dialog is opened by a "Not opening?" link rendered next to
 *   the print button. On a non-Safari desktop the link stays hidden
 *   so the UI doesn't grow visual chrome for no reason. On Mac
 *   Safari the same link still works because the dialog offers the
 *   OS-standard Cmd+P / Ctrl+P keyboard shortcut as a fallback.
 *
 * Rendering surface:
 *
 *   <PrintHelpDialog hint={hintForUser} open={open} onOpenChange={setOpen} />
 *
 * Where `hintForUser` is the result of `getPrintHint(probe)` (or null
 * if no hint applies — in which case the trigger link stays hidden).
 */

import * as React from 'react';
import { HelpCircle, Printer } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import type { PrintHint } from '@/lib/print/safe-print';
import { triggerPrint } from '@/lib/print/safe-print';

export interface PrintHelpDialogProps {
  /** The platform-specific hint from `getPrintHint()`. Null = no hint. */
  hint: PrintHint | null;
  /** Controls open state. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PrintHelpDialog({
  hint,
  open,
  onOpenChange
}: PrintHelpDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Print not opening?"
      description={
        hint?.summary ??
        "Most browsers let you print with the standard keyboard shortcut."
      }
      widthClassName="max-w-md"
    >
      {hint ? (
        <div className="space-y-4">
          <ol className="list-decimal space-y-1.5 pl-5 text-sm text-foreground">
            {hint.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
      ) : null}

      {/* Keyboard-shortcut fallback — works on every platform, so we
          show it whether or not we have an Apple-specific hint. */}
      <p className="mt-5 text-xs text-muted-foreground">
        Or use the keyboard:{' '}
        <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[11px]">
          Cmd
        </kbd>{' '}
        +{' '}
        <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[11px]">
          P
        </kbd>{' '}
        on Mac,{' '}
        <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[11px]">
          Ctrl
        </kbd>{' '}
        +{' '}
        <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[11px]">
          P
        </kbd>{' '}
        on Windows / Linux.
      </p>

      <div className="mt-5 flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onOpenChange(false)}
        >
          Got it
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => {
            onOpenChange(false);
            // Re-trigger the print dialog. Fire-and-forget — the
            // synchronous `window.print()` runs immediately so the
            // user-activation context is preserved.
            triggerPrint();
          }}
        >
          <Printer className="mr-2 size-4" />
          Try again
        </Button>
      </div>
    </Dialog>
  );
}

/**
 * The "Not opening?" trigger link rendered next to a Print button on
 * Apple platforms. Hidden on non-Apple platforms so the chrome
 * doesn't grow for nothing.
 *
 * Usage:
 *   <>
 *     <PrintButton ... />
 *     {hint ? <PrintHelpTrigger hint={hint} open={helpOpen} onOpenChange={setHelpOpen} /> : null}
 *   </>
 */
export interface PrintHelpTriggerProps {
  hint: PrintHint;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PrintHelpTrigger({
  hint,
  open,
  onOpenChange
}: PrintHelpTriggerProps) {
  return (
    <>
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        className="ml-2 inline-flex items-center gap-1 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
        aria-label={hint.summary}
        data-testid="print-help-trigger"
      >
        <HelpCircle className="size-3.5" />
        Not opening?
      </button>
      <PrintHelpDialog hint={hint} open={open} onOpenChange={onOpenChange} />
    </>
  );
}
