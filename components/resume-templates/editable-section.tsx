'use client';

/**
 * EditableSection / EditableNestedSection — shared wrapper that owns
 * the boilerplate around any repeatable section in the WYSIWYG editor:
 *  - "+ Add" button → `useFieldArray.append(defaultRow)`
 *  - per-row ✕ Remove → `useFieldArray.remove(i)`
 *  - **drag-to-reorder** (new) → `useFieldArray.move(from, to)`
 *
 * Every section that uses this helper (Work, Projects, Education,
 * Awards, Certificates, Publications, Volunteer, References, plus the
 * nested `positions` array inside a Work entry) gets drag-to-reorder
 * for free. The five templates are not edited here — they pass
 * `reorderable={false}` only when their consumption is editorial chrome
 * (none of the current callers do, but the prop is there so the
 * SchemaForm path or future non-editor surface can opt out cleanly).
 *
 * ## Why one helper, not per-template
 *
 * Same rationale as the original add/remove wiring (see prior history):
 * the shape is identical across sections, so the wrapper should live
 * in one place. `group/edit-row` + `group-hover` styling is the
 * per-section tweak point; everything else is shared.
 *
 * ## Why drag lives here
 *
 * The render-prop children (ModernHeader, ModernProjectRow, etc.)
 * bind field-array indices through RHF dotted paths. Reorder changes
 * the indices but not the data, so:
 *  - the children render functions stay read-only,
 *  - the form becomes dirty on drag-end (the moved array is a
 *    mutation; RHF marks it dirty for the next Save),
 *  - the existing `saveResumeAction` server action persists the new
 *    order on the user's next explicit Save (Ctrl+S or click), with
 *    no new DB call surface, no migration, no autosave.
 *
 * ## Print / PDF / share correctness
 *
 * SortableRow's drag handle carries `className="no-print"`; the row
 * wrapper itself does NOT, so a row mid-drag is invisible in print
 * (the drag in progress is short-lived and never reaches print). In
 * any other context (read-only, share, design-lab, preview) the
 * components are mounted with `editable={false}` and EditableSection
 * is not mounted at all, so the handle never renders.
 */

import * as React from 'react';
import { Plus, X } from 'lucide-react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy
} from '@dnd-kit/sortable';
import { useFieldArray, useFormContext } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { SortableRow } from './sortable-row';

export interface EditableSectionProps<T> {
  /** RHF field-array path, e.g. `sections.work` or `sections.work.0.positions`. */
  path: string;
  /** Visible text on the "+ Add" button, e.g. "Add experience". The
   *  same text (minus the leading "Add ") is reused for the
   *  `aria-label` on the remove + drag handles — keeping the three
   *  consistent means screen-reader users hear one section name, not
   *  three synonyms for it. */
  addLabel: string;
  /** data-testid prefix for rows, the drag handle, and the add button. */
  testIdPrefix: string;
  /** Default value for newly-appended rows. Should match the section's
   *  Zod shape with every string field `''` and every array `[]`. */
  defaultRow: T;
  /** Render prop: called once per existing entry with the current index. */
  children: (index: number) => React.ReactNode;
  /**
   * Whether the rows are drag-to-reorderable. Default `true`. Pass
   * `false` if the consumer renders the helper in a non-editor
   * surface (e.g. the SchemaForm EditSectionDialog array view, if
   * it ever adopts this helper) where keyboard/mouse drag would be
   * out of scope.
   */
  reorderable?: boolean;
}

function EditableSectionInner<T>({
  path,
  addLabel,
  testIdPrefix,
  defaultRow,
  reorderable = true,
  children
}: EditableSectionProps<T>) {
  const { control } = useFormContext();
  const { fields, append, remove, move } = useFieldArray({
    control,
    name: path
  });

  // Strip a leading "+ " / "Add " / "add " from addLabel so we can
  // reuse the noun as an aria-label suffix:
  //  addLabel="Add experience" → sectionLabel="experience"
  //  addLabel="Add a position" → sectionLabel="a position"
  // Matches the regex used by the previous remove-button label so
  // existing test assertions on `aria-label="Remove experience"`
  // continue to hold.
  const sectionLabel = React.useMemo(
    () => addLabel.replace(/^(\+ )?(Add )?/i, '').trim(),
    [addLabel]
  );

  // Stable row ids from useFieldArray. SortableContext needs these
  // in `items`; it does NOT need the array length.
  const itemIds = React.useMemo(
    () => fields.map((f) => f.id),
    [fields]
  );

  // Sensors: PointerSensor for mouse/touch drag; KeyboardSensor for
  // a11y drag (Space to pick up, Arrow Up/Down to move, Space to drop).
  // `activationConstraint.distance: 4` requires a small mouse move
  // before activation so a click on the handle doesn't initiate a drag
  // — keyboard activations are unaffected.
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 4 }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  );

  // Drag-end → useFieldArray.move(oldIndex, newIndex).
  // active === over is a no-op (drop on same row).
  const handleDragEnd = React.useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = fields.findIndex((f) => f.id === active.id);
      const newIndex = fields.findIndex((f) => f.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return;
      move(oldIndex, newIndex);
    },
    [fields, move]
  );

  // Track the active drag id for the <DragOverlay> ghost. dnd-kit's
  // DragOverlay renders a copy of the dragged row above the list
  // while the in-place row is faded (opacity-while-dragging in
  // SortableRow).
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const activeIndex = activeId
    ? fields.findIndex((f) => f.id === activeId)
    : -1;

  const rows = fields.map((field, i) => {
    const removeButton = (
      <button
        type="button"
        onClick={() => remove(i)}
        aria-label={`Remove ${sectionLabel}`}
        // no-print: removing a row is an editor-only action.
        // group-hover keeps the button out of the way until the
        // user is actually looking at the row; a focus ring
        // also reveals it for keyboard users.
        className="no-print absolute -right-2 -top-2 inline-flex size-6 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-400 opacity-0 shadow-sm transition-opacity hover:text-zinc-700 group-hover/edit-row:opacity-100 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-zinc-300"
      >
        <X className="size-3" />
      </button>
    );

    if (!reorderable) {
      return (
        <div
          key={field.id}
          data-testid={`${testIdPrefix}-${i}`}
          className="group/edit-row relative"
        >
          {children(i)}
          {removeButton}
        </div>
      );
    }

    return (
      <SortableRow
        key={field.id}
        id={field.id}
        ariaLabel={`Drag to reorder ${sectionLabel}`}
        dataTestId={`${testIdPrefix}-${i}`}
        className="group/edit-row relative pl-6"
      >
        {children(i)}
        {removeButton}
      </SortableRow>
    );
  });

  const addButton = (
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
  );

  if (!reorderable) {
    return (
      <div className="space-y-[var(--resume-item-gap)]">
        {rows}
        {addButton}
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={(e) => setActiveId(e.active.id as string)}
      onDragEnd={(e) => {
        handleDragEnd(e);
        setActiveId(null);
      }}
      onDragCancel={() => setActiveId(null)}
    >
      <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
        <div className="space-y-[var(--resume-item-gap)]">
          {rows}
          {addButton}
        </div>
        {/* DragOverlay ghost. Renders the active row's children at
            a higher z-index so the user sees what they're dragging
            while the in-place row is faded. no-print on the
            overlay (and the handle inside SortableRow) keeps the
            editor chrome out of the PDF. */}
        {activeId !== null && activeIndex >= 0 && (
          <DragOverlay>
            <div
              data-testid={`drag-overlay-${testIdPrefix}-${activeIndex}`}
              className="no-print group/edit-row relative rounded-md bg-white pl-6 shadow-2xl ring-1 ring-zinc-300"
            >
              {children(activeIndex)}
            </div>
          </DragOverlay>
        )}
      </SortableContext>
    </DndContext>
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
