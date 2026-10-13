'use client';

/**
 * Floating "Feedback" button + dialog, mounted in the dashboard layout
 * so it's always one click away while the user is mid-flow.
 *
 * Why a pill rather than just a sidebar link: the dashboard sidebar is
 * already busy (Overview / Resumes / Account / Security). A floating
 * element catches the "I want to say something RIGHT NOW" impulse
 * without forcing a menu dig.
 *
 * Why `no-print`: the pill should never appear on a printed/PDF'd
 * resume. The same `no-print` class that hides the rest of the
 * dashboard chrome hides this too.
 *
 * UX detail: when the user successfully submits, the dialog auto-
 * closes after a brief "thanks" beat. We don't want to trap them in
 * the modal after the action is done.
 */
import { useEffect, useState } from 'react';
import { MessageSquare, X } from 'lucide-react';

import { Dialog } from '@/components/ui/dialog';
import { FeedbackForm } from './feedback-form';

const CLOSE_AFTER_SUCCESS_MS = 1_800;

export function FeedbackPill() {
  const [open, setOpen] = useState(false);
  const [justSubmitted, setJustSubmitted] = useState(false);

  // After a successful submit, briefly show the success state then
  // close. Without the timer the user is stuck staring at a modal
  // that has no more work to do.
  useEffect(() => {
    if (!justSubmitted) return;
    const t = window.setTimeout(() => {
      setOpen(false);
      // Reset the success flag a tick after the dialog closes so
      // opening it again starts on the form, not the success view.
      window.setTimeout(() => setJustSubmitted(false), 250);
    }, CLOSE_AFTER_SUCCESS_MS);
    return () => window.clearTimeout(t);
  }, [justSubmitted]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        // `no-print` is the same class the rest of the dashboard
        // chrome uses. The print CSS in globals.css hides it
        // alongside the sidebar / header so a PDF'd resume is clean.
        className="no-print fixed bottom-4 right-4 z-30 inline-flex items-center gap-2 rounded-full border bg-background/95 px-4 py-2.5 text-sm font-medium shadow-lg backdrop-blur transition-all hover:bg-accent hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-indigo-300/50"
        aria-label="Send feedback"
        data-testid="feedback-pill"
      >
        <MessageSquare className="size-4" aria-hidden="true" />
        <span className="hidden sm:inline">Feedback</span>
      </button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setJustSubmitted(false);
        }}
        title="Send us feedback"
        description="Bug, idea, or anything in between — we read every note. Submissions become a public GitHub issue."
        widthClassName="max-w-xl"
      >
        <FeedbackForm
          variant="dialog"
          onSubmitted={() => setJustSubmitted(true)}
        />
      </Dialog>
    </>
  );
}

// Re-export the close button glyph so a future variant can swap it in
// without importing lucide directly. Unused for now; documents intent.
export { X as FeedbackCloseIcon };
