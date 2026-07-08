import { z } from 'zod';

import { basicsSchema } from '@/lib/resume-schema';

/**
 * Most resume sections are ZodArray<T> (e.g. `sections.skills` is
 * `z.array(SkillEntry)`), but the project's <SchemaForm> component
 * constrains its `schema` prop to `z.ZodObject`. Rather than relax
 * SchemaForm, we wrap each section in a single-field object whose value
 * is the array — `<SchemaForm>` renders that one field, the user sees a
 * clean array-of-entries UI, and on submit we read `.items` and write
 * it back to the parent RHF state at the section's dotted path.
 *
 * The basics section is already an object schema, so we use it as-is
 * (no wrapping). The unified `SectionDialogSchema` is the schema
 * SchemaForm renders with — it's always a ZodObject by construction,
 * since the array case wraps in `{ items: ... }`.
 *
 * As of the WYSIWYG slice (basics + work + 10 array sections inline
 * via <EditableText> / <KeywordChips> / <BulletList> primitives) this
 * registry is empty. The footer + dialog machinery stays wired so we
 * can re-populate it if we add an "Open JSON editor" or similar
 * escape-hatch feature later.
 */

export type SectionDialogSchema = z.ZodObject<z.ZodRawShape>;

/**
 * Static section map for the WYSIWYG editor's "Edit [section]"
 * dialogs. Each row carries:
 *   - label/dialog title
 *   - sectionPath dotted-path into the parent form values
 *   - schema: the ZodObject-shaped schema SchemaForm expects
 *   - toItems: function that takes the *current* parent-form value at
 *     `sectionPath` and produces the `defaultValues` for the wrapped
 *     dialog schema ({ items: [...] })
 *   - fromItems: inverse — takes the dialog's submitted `data.items`
 *     and produces what to push up via form.setValue(sectionPath, ...)
 */
export interface SectionDialog {
  label: string;
  description?: string;
  path: string;
  schema: SectionDialogSchema;
  /** `(currentValue) => ({ items: ... })` so the array-shaped sections
   *  hydrate the dialog with the current list. */
  toItems: (currentValue: unknown) => Record<string, unknown>;
  /** `(data) => itemsArray` so the dialog's submit gets pushed back
   *  up to the parent form. */
  fromItems: (data: unknown) => unknown;
}

const arraySection = (label: string, path: string, description: string) => ({
  label,
  path,
  description,
  // The schema is overwritten per-row below in `arraySectionWithSchema` —
  // the bare `z.object({ items: ... })` here is a placeholder that
  // types-correct thanks to the `as never` cast. Kept around for future
  // use; no callers today (every section is inline-editable now).
  schema: z.object({ items: z.array(z.unknown()) }) as never,
  toItems: (currentValue: unknown) => ({ items: currentValue ?? [] }),
  // Optional-chained access on `data` so `null`/`undefined`/missing-input
  // don't throw before the `?? []` fallback fires. SchemaForm never feeds
  // us `null` in practice (it always submits a validated object), but
  // this is the defensive floor for a function exposed as a public helper.
  fromItems: (data: unknown) =>
    (data as { items?: unknown } | null | undefined)?.items ?? []
});

/**
 * Build a SectionDialog row for an array-shaped section. The schema is
 * the per-section array schema wrapped in `{ items: ... }` so it
 * satisfies SchemaForm's ZodObject constraint. We accept the broadest
 * possible Zod type because each section schema is a slightly different
 * concrete type (e.g. `ZodDefault<ZodArray<...>>`), and the wrapper
 * construction works regardless of the underlying shape.
 */
function arraySectionWithSchema(
  label: string,
  path: string,
  description: string,
  arraySchema: z.ZodTypeAny
): SectionDialog {
  return {
    label,
    path,
    description,
    schema: z.object({ items: arraySchema }) as unknown as SectionDialogSchema,
    toItems: (currentValue: unknown) => ({ items: currentValue ?? [] }),
    fromItems: (data: unknown) =>
      (data as { items?: unknown } | null | undefined)?.items ?? []
  };
}

export const SECTION_DIALOGS: ReadonlyArray<SectionDialog> = [
  // The basics section has more nested state (location + profiles) than
  // is convenient to inline. We keep the dialog as an escape hatch for
  // users who'd rather edit a flat form than click individual fields.
  // (The header in the rendered view is already inline-editable for
  // the common name/label/contact fields.)
  //
  // Once the inline editor covers all basics fields we can drop this
  // entry and SECTION_DIALOGS becomes empty — which is fine; the
  // editor footer (`SectionEditTriggers`) hides itself when the list is
  // empty.
  {
    label: 'Profile (basics)',
    path: 'sections.basics',
    description:
      'Name, label, email, phone, website, summary, location, online profiles.',
    schema: basicsSchema as SectionDialogSchema,
    toItems: (currentValue: unknown) =>
      (currentValue as Record<string, unknown>) ?? {},
    fromItems: (data: unknown) => data
  }
];

// Re-export `arraySection` as unused-but-handy if a future contributor
// wants to define a new section row inline. We give it an underscore to
// signal "internal but available" without tripping ESLint.
export const _arraySectionHelper = arraySection;
