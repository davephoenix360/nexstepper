'use client';

/**
 * EditableSection / EditableNestedSection — shared wrapper that adds
 * the "+ Add" and per-row "✕ Remove" affordances to any repeatable
 * section in the WYSIWYG editor.
 *
 * ## Why this exists
 *
 * Classic's per-section Inline components (SkillsInline, ProjectsInline,
 * EducationInline, …) each carry their own `useFieldArray` + `append`
 * + `remove` boilerplate. That works, but the other four templates
 * (Modern, Executive, Creative, Minimal) had no add/remove at all —
 * every section was read-only-on-add. Users could edit existing
 * entries but not add new work items, new projects, new skills, etc.
 *
 * The fix is the same shape in every template and every section, so
 * this helper carries the boilerplate once. Each template's section
 * body is a render prop `(index) => <RowContent index={i} />` whose
 * fields are already bound to `sections.X.${i}…` via the `Field*`
 * helpers — those helpers handle the editable/read-only switch
 * per-leaf, so the row content is identical between modes.
 *
 * The two variants differ only in name (and the data-testid prefix
 * for clarity) — the implementation is the same because useFieldArray
 * takes a path of any depth.
 */

import { Plus, X } from 'lucide-react';
import { useFieldArray, useFormContext } from 'react-hook-form';

import { Button } from '@/components/ui/button';

export interface EditableSectionProps<T> {
  /** RHF field-array path, e.g. `sections.work` or `sections.work.0.positions`. */
  path: string;
  /** Visible text on the "+ Add" button, e.g. "Add experience". */
  addLabel: string;
  /** data-testid prefix for rows and the add button. */
  testIdPrefix: string;
  /** Default value for newly-appended rows. Should match the section's
   *  Zod shape with every string field `''` and every array `[]`. */
  defaultRow: T;
  /** Renders a single row. Called once per existing field-array entry. */
  children: (index: number) => React.ReactNode;
}

function EditableSectionInner<T>({
  path,
  addLabel,
  testIdPrefix,
  defaultRow,
  children
}: EditableSectionProps<T>) {
  const { control } = useFormContext();
  const { fields, append, remove } = useFieldArray({ control, name: path });

  return (
    <div className="space-y-3">
      {fields.map((field, i) => (
        <div
          key={field.id}
          data-testid={`${testIdPrefix}-${i}`}
          className="group/edit-row relative"
        >
          {children(i)}
          <button
            type="button"
            onClick={() => remove(i)}
            aria-label={`Remove ${addLabel.replace(/^(\+ )?(Add )?/, '')}`}
            // no-print: removing a row is an editor-only action.
            // group-hover keeps the button out of the way until the
            // user is actually looking at the row; a focus ring
            // also reveals it for keyboard users.
            className="no-print absolute -right-2 -top-2 inline-flex size-6 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-400 opacity-0 shadow-sm transition-opacity hover:text-zinc-700 group-hover/edit-row:opacity-100 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-zinc-300"
          >
            <X className="size-3" />
          </button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => append(defaultRow as never)}
        // no-print: "+ Add" is editor chrome, not part of the resume.
        className="no-print"
        data-testid={`add-${testIdPrefix}`}
      >
        <Plus className="mr-1 size-3" />
        {addLabel}
      </Button>
    </div>
  );
}

/** Top-level repeatable section. */
export function EditableSection<T>(props: EditableSectionProps<T>) {
  return <EditableSectionInner {...props} />;
}

/** Nested repeatable section (e.g. positions within a work entry). */
export function EditableNestedSection<T>(props: EditableSectionProps<T>) {
  return <EditableSectionInner {...props} />;
}