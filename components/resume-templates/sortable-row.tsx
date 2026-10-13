'use client';

/**
 * SortableRow — a single dnd-kit-sortable row in the WYSIWYG editor.
 *
 * Wraps `useSortable({ id })` so the entire EditableSection list can
 * be turned into a sortable list by wrapping it in
 * `<DndContext>` + `<SortableContext>`. The drag handle is a dedicated
 * `<button>` (lucide `GripVertical`); only the handle carries the
 * dnd-kit listeners, so clicks on the row's editable text leaves
 * keep working as today.
 *
 * ## Why a separate primitive instead of inlining it
 *
 * Every section across all five templates (Work, Projects, Education,
 * Awards, Certificates, Publications, Volunteer, References, plus the
 * nested `positions` array inside a Work entry) routes through
 * `EditableSection` / `EditableNestedSection`. Putting `<SortableRow>`
 * in its own file means handle styling, a11y label wording, and the
 * `no-print` guarantee cannot drift between sections or templates —
 * any change is one file.
 *
 * ## Print / PDF / share correctness
 *
 * The handle button has `className="no-print"`. The wrapper div
 * itself does NOT — only when the row is being dragged does it
 * carry `style.opacity` (and the `DragOverlay` shows the ghost above
 * the printer-safe in-DOM markup). In the rendered PDF the wrapper is
 * a normal resume row with no editor chrome visible.
 *
 * ## Accessibility
 *
 *  - `aria-label="Drag to reorder [section]"` on the handle.
 *  - dnd-kit's own `aria-roledescription="sortable"` and
 *    `aria-describedby` hints are wired through via `{...attributes}`
 *    on the wrapper (dnd-kit v6 ships its own screen-reader
 *    instructions; we don't restate them).
 *  - Keyboard: Tab to the handle, Space to pick up, Arrow Up/Down to
 *    move one row at a time, Space to drop (handled by
 *    `sortableKeyboardCoordinates`, configured at the DndContext
 *    level by EditableSection — not here, so this primitive remains
 *    context-agnostic).
 */

import * as React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';

export interface SortableRowProps {
  /** Stable row id from `useFieldArray`'s `field.id`. */
  id: string;
  /** Human-readable section name for the `aria-label`, e.g. "experience". */
  ariaLabel: string;
  /** Forwarded to the wrapper div — typically the section's row styling. */
  className?: string;
  /** data-testid on the wrapper. Defaults to `sortable-row-{id}`. */
  dataTestId?: string;
  /**
   * Inline `style` merged onto the wrapper. SortableRow applies its own
   * `transform` / `transition` / `opacity` internally; the consumer's
   * values flow through first so e.g. spacing or color CSS vars aren't
   * clobbered.
   */
  style?: React.CSSProperties;
  children: React.ReactNode;
}

export function SortableRow({
  id,
  ariaLabel,
  className,
  dataTestId,
  style: styleProp,
  children
}: SortableRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id });

  // Combine consumer styles with dnd-kit's transform / transition /
  // dragging-opacity. transform comes from dnd-kit's CSS helper;
  // opacity-when-dragging is what makes the in-place row fade so the
  // DragOverlay ghost appears to "lift" above the list.
  const style: React.CSSProperties = {
    ...styleProp,
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={className}
      data-testid={dataTestId ?? `sortable-row-${id}`}
      {...attributes}
    >
      {/*
        Drag handle. Listeners attached ONLY here so the row's
        click-to-edit text leaves keep working. The handle is a
        real <button> for keyboard a11y (Space activates it via
        dnd-kit's KeyboardSensor wired in at the DndContext).
      */}
      <button
        type="button"
        aria-label={ariaLabel}
        className="no-print absolute -left-2 top-3 z-10 inline-flex size-7 cursor-grab items-center justify-center rounded border border-zinc-200 bg-white/80 text-zinc-400 opacity-0 shadow-sm transition-opacity hover:text-zinc-700 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-zinc-300 active:cursor-grabbing group-hover/edit-row:opacity-100"
        data-testid={`sortable-handle-${id}`}
        {...listeners}
      >
        <GripVertical className="size-4" aria-hidden="true" />
      </button>
      {children}
    </div>
  );
}
