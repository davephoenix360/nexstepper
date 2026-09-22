"use client";

import { useCallback, useMemo } from 'react';
import { useForm, useFormContext, useWatch } from 'react-hook-form';

/**
 * The data shape this hook reads from. Narrowed to just the
 * `print` envelope so callers can pass either the full
 * `ResumeData` or a partial `{ print }` literal in preview mode.
 */
type PrintEnvelope = { print?: { hiddenSections?: string[] } };

/**
 * "Where am I rendering" signal — same shape as the Field primitives
 * (`components/resume-templates/field.tsx`). Pass `mode.editable`
 * to gate RHF reads against no-form-context render paths.
 */
export interface SectionPrintMode {
  editable: boolean;
  data?: PrintEnvelope;
}

type FormShape = {
  control: ReturnType<typeof useForm>['control'];
  setValue: (
    name: string,
    value: string[],
    opts?: { shouldDirty?: boolean; shouldTouch?: boolean }
  ) => void;
};

/**
 * Read the section-hidden state for a given slug, and expose a
 * toggle handler that writes back to the RHF form.
 *
 * Modes
 *   - `mode.editable === true`  → reads `print.hiddenSections`
 *     from the live RHF form via `useWatch`. `toggle()` writes
 *     the new array back through `form.setValue(...)` with
 *     `{ shouldDirty, shouldTouch }` so the parent form's dirty
 *     flag flips and the Save button enables.
 *   - `mode.editable === false` → reads `print.hiddenSections`
 *     from `mode.data` directly (the saved resume envelope).
 *     `toggle()` is a no-op. This is the preview/PDF path: there
 *     is no FormProvider, only the saved `ResumeData` from the
 *     server.
 *
 * Why the explicit `mode` instead of detecting `useFormContext()`
 * internally:
 *   `useFormContext()` returns `null` (not throws) when no
 *   provider is present, but downstream `useWatch({ control })`
 *   then crashes on `control._getWatch`. A hook can't safely
 *   call `useWatch` conditionally without violating React's
 *   rules-of-hooks. The explicit `mode` keeps the hook
 *   deterministic in both modes.
 *
 * `hidden` updates reactively:
 *   - editor mode: via `useWatch` on the live form value.
 *   - preview mode: via `useMemo` over `mode.data.print`.
 *     A re-render is triggered by the parent (the preview
 *     page re-renders on `router.refresh()` after save).
 */
export function useSectionPrint(
  slug: string,
  mode: SectionPrintMode
): { hidden: boolean; toggle: () => void } {
  // We branch on `mode.editable` to keep the hook deterministic,
  // but each branch internally calls a stable hook set. Both
  // branches are pure functions of their inputs — the conditional
  // is stable for a given component instance (a section helper
  // doesn't move between editor and preview within its lifetime).
  if (mode.editable) {
    return useSectionPrintFromForm(slug);
  }
  return useSectionPrintFromData(slug, mode.data);
}

function useSectionPrintFromForm(slug: string) {
  // The cast loosens the form shape so we can call `setValue`
  // with our narrow (string[]) payload. The form's actual
  // runtime type is `unknown` because the resolver is cast
  // through `as never` (see editable-resume.tsx for the
  // rationale).
  const form = useFormContext() as unknown as FormShape & {
    /** Synchronous read of the form value at `name`. Available on
     *  every RHF form instance; safe in SSR (defaultValues are
     *  populated into `_formValues` during `createFormControl`). */
    getValues?: (name: string) => unknown;
  };
  // Seed the watch's defaultValue from the form's current value
  // so the FIRST render in SSR (where `useWatch` may not yet
  // have subscribed to the field) shows the correct hidden
  // state. After hydration, `useWatch` keeps the value live.
  const initial = Array.isArray(form.getValues?.('print.hiddenSections'))
    ? (form.getValues('print.hiddenSections') as string[])
    : [];
  const watched = useWatch({
    control: form.control,
    name: 'print.hiddenSections',
    defaultValue: initial
  });
  // `useWatch` returns `unknown` typed value for safety; narrow
  // to string[]. Empty array when the field is unset.
  const hiddenSections: string[] = Array.isArray(watched)
    ? (watched as string[])
    : [];
  const hidden = hiddenSections.includes(slug);

  const toggle = useCallback(() => {
    const next = hidden
      ? hiddenSections.filter((s) => s !== slug)
      : [...hiddenSections, slug];
    form.setValue('print.hiddenSections', next, {
      shouldDirty: true,
      shouldTouch: true
    });
  }, [hiddenSections, form, slug, hidden]);

  return { hidden, toggle };
}

function useSectionPrintFromData(slug: string, data: PrintEnvelope | undefined) {
  const hiddenSections = data?.print?.hiddenSections ?? [];
  return useMemo(
    () => ({
      hidden: hiddenSections.includes(slug),
      // No-op in read-only mode: there is no form context to
      // write to. The user would have to edit the resume to
      // change this — the editor is the only place that
      // toggles `print.hiddenSections`.
      toggle: () => {}
    }),
    [slug, hiddenSections]
  );
}
