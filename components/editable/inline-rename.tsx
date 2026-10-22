'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2, Pencil, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * Inline rename affordance — pencil icon → click to edit → Enter to
 * save, Esc to cancel, blur to save.
 *
 * Used by the variant editor header (`app/(dashboard)/dashboard/
 * resumes/[id]/page.tsx`) and the JD panel title
 * (`_components/jd-panel.tsx`).
 *
 * `action` is a Server Action that accepts `{ id, name }` (or
 * `{ resumeId, title }` for the JD-title variant — see
 * `renameResumeAction` + `updateJobContextTitleAction`). The
 * component is intentionally generic over the action shape so the
 * same UI drives both call sites.
 *
 * Optimistic update: the local `value` state is updated immediately
 * on submit so the user sees the rename take effect without waiting
 * for `revalidatePath`. On server failure, we revert to `initialName`
 * and show the error message.
 *
 * ## Why we call `router.refresh()` after a successful rename
 *
 * The editor's react-hook-form was initialized from the revision's
 * `data.name`, not from the `resumes.name` column this control writes.
 * Left alone, the form keeps the OLD name, and the next content save
 * sends it back to the server — which is how a rename used to silently
 * revert on the following save.
 *
 * Refreshing re-renders the Server Component, hands `EditableResume` a
 * fresh `initialData`, and its existing `form.reset(initialData)`
 * effect syncs the form. The server-side half of the fix (writing
 * `data.name` in the same transaction) is what makes that refreshed
 * `initialData` actually carry the new name.
 */
export function InlineRename({
  initialName,
  testId,
  inputTestId,
  className,
  fieldName = 'name',
  pendingTestId = 'inline-rename-pending',
  action,
  resumeId
}: {
  initialName: string;
  /** Outer wrapper's data-testid (the pencil button). */
  testId: string;
  /** Editable input's data-testid. */
  inputTestId: string;
  /** Tailwind classes for the rendered name (size, weight, etc.). */
  className?: string;
  /** Server action field name: `name` for resumes, `title` for JDs. */
  fieldName?: 'name' | 'title';
  /** data-testid on the pending state (a Loader2 icon). */
  pendingTestId?: string;
  /** Server Action. Takes `{ resumeId, [fieldName]: string }`. */
  action: (input: {
    resumeId: string;
    [k: string]: string;
  }) => Promise<
    | { ok: true; data: { [k: string]: string } }
    | { ok: false; error: string }
  >;
  /** The resume ID this rename targets. */
  resumeId: string;
  /** ARIA label for the pencil button. */
  ariaLabel?: string;
  /** Placeholder for the empty input. */
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const router = useRouter();

  // Keep the displayed value in sync with the server-rendered prop
  // (e.g. after `revalidatePath` re-renders the page with the new name).
  useEffect(() => {
    if (!editing) setValue(initialName);
  }, [initialName, editing]);

  // Focus the input when entering edit mode.
  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  function commit() {
    const trimmed = value.trim();
    if (!trimmed) {
      setError('Name cannot be empty');
      return;
    }
    if (trimmed === initialName) {
      setEditing(false);
      setError(null);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await action({ resumeId, [fieldName]: trimmed });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setEditing(false);
      // Pull the new name into the editor's form. Without this the
      // form still holds the old value and the next content save
      // writes it back, undoing the rename. See the component header.
      router.refresh();
    });
  }

  function cancel() {
    setValue(initialName);
    setError(null);
    setEditing(false);
  }

  if (editing) {
    return (
      <span className={cn('inline-flex items-center gap-1', className)}>
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              cancel();
            }
          }}
          onBlur={() => {
            // Defer slightly so the Save button's onClick (if the
            // user clicked it) fires before the blur cancels us.
            setTimeout(() => {
              if (editing) commit();
            }, 0);
          }}
          disabled={pending}
          placeholder="Resume name"
          className="h-8 text-sm"
          data-testid={inputTestId}
          aria-label="Edit resume name"
        />
        {pending ? (
          <Loader2
            className="h-3.5 w-3.5 animate-spin text-muted-foreground"
            data-testid={pendingTestId}
          />
        ) : (
          <>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onMouseDown={(e) => e.preventDefault()}
              onClick={commit}
              aria-label="Save name"
            >
              <Check className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onMouseDown={(e) => e.preventDefault()}
              onClick={cancel}
              aria-label="Cancel"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
        {error && (
          <span
            className="ml-2 text-xs text-destructive"
            role="alert"
            data-testid="inline-rename-error"
          >
            {error}
          </span>
        )}
      </span>
    );
  }

  return (
    <span
      className={cn('group inline-flex items-center gap-1', className)}
      data-testid={testId}
    >
      <span>{initialName || 'Untitled'}</span>
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
        onClick={() => setEditing(true)}
        aria-label="Rename"
      >
        <Pencil className="h-3.5 w-3.5" />
      </Button>
    </span>
  );
}
