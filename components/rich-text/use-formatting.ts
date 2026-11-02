'use client';

/**
 * The one place that reads and writes the formatting overlay.
 *
 * ## Why the map lives in the RHF form
 *
 * `formatting` is a field of `ResumeData`, and the editor's form's
 * values ARE `ResumeData`. So putting the map in the form gets three
 * things for free:
 *
 * - **Autosave** — `useDebouncedAutosave` watches the whole form and
 *   JSON-stringifies it. The map rides along.
 * - **Undo/redo** — `useUndoHistory` snapshots the whole form as a JSON
 *   string in local storage. The map is in the snapshot, so a
 *   formatting change is ONE undoable step (one `setValue` → one
 *   snapshot → one Ctrl+Z).
 * - **AI-applied revisions** — when the agent writes a revision and the
 *   page resets the form, the map resets with everything else.
 *
 * ## The single-owner rule
 *
 * Only this hook writes the map, and it writes it as a whole (never a
 * single path's spans mutated in place), so there is no second copy
 * of the truth to drift.
 */
import { useCallback } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';

import type { RichSpan, RichTextMap } from '@/lib/resume-schema/rich-text';

export interface FormattingApi {
  /** The whole overlay, or undefined when nothing is formatted. */
  formatting: RichTextMap | undefined;
  /** The spans for one field. */
  spansFor: (path: string) => RichSpan[];
  /** Replace the spans for one field. An empty array removes the path. */
  setSpans: (path: string, spans: RichSpan[]) => void;
  /** Remove every mark from one field. */
  clearField: (path: string) => void;
  /** Remove every mark from the whole resume. */
  clearAll: () => void;
}

export function useFormatting(): FormattingApi {
  const form = useFormContext();

  const formatting = useWatch({
    control: form.control,
    name: 'formatting'
  }) as RichTextMap | undefined;

  const spansFor = useCallback(
    (path: string): RichSpan[] => formatting?.[path] ?? [],
    [formatting]
  );

  const setSpans = useCallback(
    (path: string, spans: RichSpan[]) => {
      const current =
        (form.getValues('formatting') as RichTextMap | undefined) ?? {};
      const next: RichTextMap = { ...current };
      if (spans.length === 0) delete next[path];
      else next[path] = spans;
      form.setValue('formatting', next, { shouldDirty: true });
    },
    [form]
  );

  const clearField = useCallback(
    (path: string) => setSpans(path, []),
    [setSpans]
  );

  const clearAll = useCallback(() => {
    form.setValue('formatting', {}, { shouldDirty: true });
  }, [form]);

  return { formatting, spansFor, setSpans, clearField, clearAll };
}
