'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';

import { deleteResumeAction } from '../actions';

/**
 * Destructive "Delete resume" affordance + confirm dialog.
 *
 * Lives in two spots:
 *   - The library list (`/dashboard/resumes`) — one per master card,
 *     threads `variantCount` so the dialog warns about cascades.
 *   - The editor header (`/dashboard/resumes/[id]`) — works for both
 *     masters and variants; redirects to `/dashboard/resumes` on success
 *     so the user doesn't land on a 404 for a row that no longer exists.
 *
 * UX:
 *   - Dialog copy spells out exactly what will be removed (master vs
 *     variant, and how many children for masters).
 *   - Confirm button is `variant="destructive"` (red). Disabled while
 *     the action is in flight.
 *   - On failure, the dialog stays open with an inline error so the
 *     user can retry without losing context.
 *   - On success, `router.refresh()` re-runs the parent RSC, and — if
 *     `redirectOnDelete` is set — we push to `/dashboard/resumes` so
 *     the editor doesn't try to load a deleted row.
 *
 * Plan: docs/plans/delete-resume.md
 */
export function DeleteResumeButton({
  resumeId,
  resumeName,
  isMaster,
  variantCount,
  redirectOnDelete = false
}: {
  resumeId: string;
  resumeName: string;
  /** Whether the row being deleted was a master (controls dialog copy). */
  isMaster: boolean;
  /**
   * Number of variants that will cascade-delete with a master. 0 for
   * a variant delete, 0 for a master with no variants, N otherwise.
   * Drives the "and its N variant(s)" copy.
   */
  variantCount: number;
  /**
   * If true, router.push('/dashboard/resumes') after a successful
   * delete. Used by the editor page so the user doesn't get stuck
   * on a 404 for a row that no longer exists.
   */
  redirectOnDelete?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleOpenChange(next: boolean) {
    if (pending) return; // don't let the user bail mid-delete
    setOpen(next);
    if (!next) setError(null);
  }

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await deleteResumeAction({
        resumeId,
        isMaster,
        variantCount
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Close the dialog first so the success state is clean, then
      // refresh + (optionally) navigate. The refresh re-runs the
      // parent RSC so the list shows the new state.
      setOpen(false);
      if (redirectOnDelete) {
        router.push('/dashboard/resumes');
      } else {
        router.refresh();
      }
    });
  }

  const trimmedName = resumeName.trim() || (isMaster ? 'Untitled master' : 'Untitled variant');
  const title = isMaster ? 'Delete this master resume?' : 'Delete this variant?';
  const description = isMaster
    ? variantCount > 0
      ? `This will permanently delete "${trimmedName}" and its ${variantCount} variant${variantCount === 1 ? '' : 's'}, along with every score snapshot and chat conversation. This cannot be undone.`
      : `This will permanently delete "${trimmedName}", along with every score snapshot and chat conversation. This cannot be undone.`
    : `This will permanently delete the variant "${trimmedName}". This cannot be undone.`;

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        aria-label={`Delete ${isMaster ? 'master' : 'variant'} "${trimmedName}"`}
        data-testid={`delete-resume-${resumeId}`}
        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 className="h-4 w-4" />
        Delete
      </Button>

      <Dialog
        open={open}
        onOpenChange={handleOpenChange}
        title={title}
        description={description}
        closeLabel="Cancel"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleConfirm}
            disabled={pending}
            data-testid={`delete-resume-confirm-${resumeId}`}
          >
            {pending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Deleting…
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4" />
                {isMaster ? 'Delete master' : 'Delete variant'}
              </>
            )}
          </Button>
        </div>

        {error && (
          <p
            className="mt-3 text-sm text-destructive"
            role="alert"
            data-testid={`delete-resume-error-${resumeId}`}
          >
            {error}
          </p>
        )}
      </Dialog>
    </>
  );
}