import { z } from 'zod';

import {
  basicsSchema,
  workSchema,
  certificatesSchema,
  publicationsSchema,
  languagesSchema,
  interestsSchema,
  referencesSchema
} from '@/lib/resume-schema';

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
  schema: z.object({ items: workSchema }) as never, // overwritten per-row below
  toItems: (currentValue: unknown) => ({ items: currentValue ?? [] }),
  fromItems: (data: unknown) => (data as { items?: unknown }).items ?? []
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
    fromItems: (data: unknown) => (data as { items?: unknown }).items ?? []
  };
}

export const SECTION_DIALOGS: ReadonlyArray<SectionDialog> = [
  {
    label: 'Profile (basics)',
    path: 'sections.basics',
    description:
      'Name, label, email, phone, website, summary, location, online profiles.',
    schema: basicsSchema as SectionDialogSchema,
    toItems: (currentValue: unknown) =>
      (currentValue as Record<string, unknown>) ?? {},
    fromItems: (data: unknown) => data
  },
  // Experience is inline in the editor; keep a dialog escape hatch in
  // case the user wants to do row-level surgery in a table instead of
  // clicking rows in the rendered view.
  arraySectionWithSchema(
    'Experience',
    'sections.work',
    'One row per employer. Use positions[] inside a company for role changes.',
    workSchema
  ),
  // Skills + Education + Projects + Volunteer + Awards are all inline
  // (chips / bullets / EditableText fields right inside the rendered
  // view). When the editor grows them to inline, they drop out of
  // SECTION_DIALOGS — the table-editor escape hatch stays only for
  // sections we still read-only.
  arraySectionWithSchema(
    'Certificates',
    'sections.certificates',
    'Certifications, licenses, dates.',
    certificatesSchema
  ),
  arraySectionWithSchema(
    'Publications',
    'sections.publications',
    'Talks, papers, blog posts.',
    publicationsSchema
  ),
  arraySectionWithSchema(
    'Languages',
    'sections.languages',
    'Each language + spoken/written fluency.',
    languagesSchema
  ),
  arraySectionWithSchema(
    'Interests',
    'sections.interests',
    'Hobbies and outside interests.',
    interestsSchema
  ),
  arraySectionWithSchema(
    'References',
    'sections.references',
    'Reference contacts.',
    referencesSchema
  )
];

// Re-export `arraySection` as unused-but-handy if a future contributor
// wants to define a new section row inline. We give it an underscore to
// signal "internal but available" without tripping ESLint.
export const _arraySectionHelper = arraySection;
