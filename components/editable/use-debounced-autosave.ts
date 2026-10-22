'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWatch, type Control } from 'react-hook-form';

/**
 * Debounced autosave for the resume editor.
 *
 * ## Why debounce-and-compare rather than save-on-every-keystroke
 *
 * Each save is a Server Action round trip. Firing one per character
 * would queue dozens of concurrent requests and reorder their results,
 * so we wait for a quiet period, and we skip entirely when the
 * serialized values are identical to what we last persisted.
 *
 * ## The starvation trap (and why `values` is not a dependency)
 *
 * `useWatch` returns a fresh object identity on every render, so
 * putting `values` in the effect's dependency array restarts the
 * timeout on every render — including the ones the timer itself causes.
 * The timeout then never reaches its deadline and autosave silently
 * never fires. It looks like it works in dev (where renders are sparse)
 * and does nothing in production.
 *
 * So the effect depends only on `serialized` (a string, so it only
 * changes when the content genuinely changes) and reads the live values
 * from a ref.
 *
 * ## Failure policy
 *
 * Autosave is a safety net, not the source of truth. The explicit Save
 * button remains authoritative: it validates, surfaces errors, appends
 * a revision, and revalidates the page. Autosave deliberately does none
 * of that (see `autosaveResumeAction`), so an autosave failure is
 * reported here but never blocks the user from pressing Save.
 */

export type AutosaveState = 'idle' | 'pending' | 'saved' | 'error';

export function useDebouncedAutosave({
  control,
  save,
  debounceMs = 1500,
  enabled = true
}: {
  /**
   * Only `control` is needed — the hook never reads form methods.
   *
   * Deliberately NOT generic over the field type, and typed `any`.
   * `Control<T>` turns out to be invariant in practice — its
   * `_options.validate.name` narrows to the literal field-name union, so
   * `Control<Values>` is not assignable to `Control<any>`. The editor
   * builds its form with `useForm({ resolver: ... } as never)` and so
   * has `Control<never>`, while a test form has `Control<Values>`. There
   * is no parameter type that accepts both.
   *
   * `any` is the honest type at this boundary rather than a workaround:
   * the hook never reads a field by name. It watches, JSON-serializes,
   * and hands the result to the caller's `save`, which is where the real
   * typing happens.
   */
  control: any;
  /** Performs the actual save. Resolves falsy on failure. */
  save: (values: unknown) => Promise<unknown>;
  /** How long to wait after the last change before saving. */
  debounceMs?: number;
  /** Turn off while a modal owns the same fields, or during SSR. */
  enabled?: boolean;
}): { state: AutosaveState; markSaved: (values: unknown) => void } {
  const values = useWatch({ control }) as unknown;

  const serialized = useMemo(() => {
    try {
      return JSON.stringify(values ?? {});
    } catch {
      // Circular structure — never happens with ResumeData, but a
      // throw here must not take the editor down with it.
      return '';
    }
  }, [values]);

  const [state, setState] = useState<AutosaveState>('idle');

  // Latest values without making them an effect dependency.
  const valuesRef = useRef<unknown>(values);
  valuesRef.current = values;

  // What the server last confirmed. Seeded with the initial data so a
  // page load that changes nothing never triggers a write.
  const lastSavedRef = useRef<string>('');
  const seeded = useRef(false);
  if (!seeded.current) {
    lastSavedRef.current = serialized;
    seeded.current = true;
  }

  const inFlight = useRef(false);
  const saveRef = useRef(save);
  saveRef.current = save;

  const markSaved = useCallback((next: unknown) => {
    try {
      lastSavedRef.current = JSON.stringify(next ?? {});
    } catch {
      /* ignore */
    }
    setState('idle');
  }, []);

  useEffect(() => {
    if (!enabled) return;
    if (!serialized || serialized === lastSavedRef.current) return;

    const timer = setTimeout(() => {
      // A save already in flight means newer edits have arrived since it
      // started; it will pick them up on the next pass. Dropping this
      // one avoids two concurrent writes racing to "latest".
      if (inFlight.current) return;

      inFlight.current = true;
      setState('pending');

      void Promise.resolve(saveRef.current(valuesRef.current))
        .then(() => {
          // Only mark clean if the form hasn't changed again while we
          // were awaiting — otherwise we'd skip the newer edits.
          if (serialized === JSON.stringify(valuesRef.current ?? {})) {
            lastSavedRef.current = serialized;
            setState('saved');
          } else {
            setState('idle');
          }
        })
        .catch(() => {
          setState('error');
        })
        .finally(() => {
          inFlight.current = false;
        });
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [serialized, debounceMs, enabled]);

  return { state, markSaved };
}