'use client';

/**
 * EditSectionDialog — opens a Dialog with the existing <SchemaForm>
 * scoped to a single section of the resume (e.g. Skills, Education,
 * Projects). The parent <EditableResume> wraps everything in a
 * <FormProvider>; this dialog reads + writes to that same RHF state
 * via `useFormContext`. On submit it:
 *
 *  1. Translates the dialog's submitted `data` (which lives inside a
 *     `{ items: [...] }` wrapper for array sections, or is the section
 *     shape directly for object-shaped sections like basics) back to
 *     the parent form's dotted path via `form.setValue`.
 *  2. Triggers the parent's save handler so a single "Save changes"
 *     in this dialog writes the entire pending form to the server.
 *     Closing the dialog then surfaces the parent's success or inline
 *     error.
 *
 * Skipping the auto-save and requiring a second click on the parent
 * Save would be safer but feels like two clicks for one operation.
 * The auto-save is intentional — opening a modal Save commits the whole
 * form, matching how Notion's per-block editor feels.
 */

import * as React from 'react';
import { useFormContext, type FieldValues } from 'react-hook-form';
import type { z } from 'zod';

import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { SchemaForm } from '@/components/schema-form';

import type { SectionDialogSchema } from './section-schemas';

interface EditSectionDialogProps {
  /** Label for the trigger button and dialog title. */
  label: string;
  /** Dotted path into the parent form's values for this section. */
  sectionPath: string;
  /**
   * The Zod schema the SchemaForm renders. For array sections this is
   * the `{ items: <array> }` wrapper produced by section-schemas; for
   * `basics` it's the bare basics object schema.
   */
  schema: SectionDialogSchema;
  /** Translate the section's value into the wrapped form's defaultValues. */
  toItems: (currentValue: unknown) => Record<string, unknown>;
  /** Translate the wrapped form's submitted `data` back to section value. */
  fromItems: (data: unknown) => unknown;
  /** Triggered with new full form values after the user clicks Save. */
  onSaved: (values: unknown) => void;
  /** Optional description shown under the dialog title. */
  description?: string;
}

export function EditSectionDialog({
  label,
  sectionPath,
  schema,
  toItems,
  fromItems,
  onSaved,
  description
}: EditSectionDialogProps) {
  const form = useFormContext();
  const [open, setOpen] = React.useState(false);

  function handleSubmit(next: unknown) {
    // `next` is what SchemaForm resolves from the wrapper schema's type.
    // For object sections (basics), `next` is the section shape itself;
    // for array sections, it's `{ items: [...] }`. We hand it off to
    // fromItems which knows which.
    const sectionValue = fromItems(next);
    form.setValue(sectionPath, sectionValue as FieldValues, {
      shouldDirty: true,
      shouldTouch: true
    });
    // Pass the full parent form values up to the saved callback. The
    // callback's shape (ResumeData) is enforced at the call-site in
    // EditableResume where we know the form schema.
    onSaved(form.getValues());
    setOpen(false);
  }

  // Read the current section value to seed the dialog's SchemaForm.
  // Using `watch` so re-opening the dialog after a previous save picks
  // up the latest committed values.
  const current = form.watch(sectionPath);
  const defaultValues = toItems(current);

  return (
    <>
      {/*
        Trigger button — sits in the row of section buttons under
        the rendered resume. `variant="ghost"` keeps it visually quiet
        so it doesn't compete with the WYSIWYG content above; the
        button grows on hover to remind the user it's clickable.
      */}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="no-print"
        data-testid={`edit-section-${sectionPath.replace(/\./g, '-')}`}
      >
        Edit {label}
      </Button>

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={`Edit ${label}`}
        description={description}
        widthClassName="max-w-3xl"
      >
        {/*
          SchemaForm creates its own useForm. The wrapper schema's
          `defaultValues` (the `{ items: [...] }` shape for arrays) is
          fully owned by this dialog; the parent's RHF stays untouched
          until `handleSubmit` fires.
        */}
        <SchemaForm
          schema={schema as z.ZodObject<z.ZodRawShape>}
          defaultValues={defaultValues as never}
          onSubmit={handleSubmit}
          submitLabel="Save changes"
        />
      </Dialog>
    </>
  );
}
