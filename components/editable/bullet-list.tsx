'use client';

/**
 * BulletList — inline editor for a `string[]` that wants to render as
 * a real `<ul>` of bullet items (e.g. Projects.highlights,
 * Volunteer.highlights, Work positions[*].highlights).
 *
 * Sibling of {@link KeywordChips}, which renders the same `string[]`
 * shape as inline pills. We don't try to share the component because
 * the visual models differ:
 *   - chips     → flow inline next to text, single line
 *   - bullets   → block-level list with disc markers
 *
 * UX:
 *  - Each bullet is an <EditableText> (idle = a `<span>`, click → input).
 *  - Hover the row → ✕ button shows; click to remove.
 *  - Empty list shows an "Add a highlight" placeholder + Add button so
 *    the user has an obvious path forward.
 *  - "+ Add bullet" button appends and focuses the new field.
 *
 * Print:
 *  - Renders static bullets (no ✕, no Add) on the PDF — same DOM as the
 *    non-editable path. The Add button has `.no-print`.
 *
 * Always inside a <FormProvider>.
 */

import * as React from 'react';
import { Plus, X } from 'lucide-react';
import { useFieldArray, useFormContext } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { EditableText } from './editable-text';

interface BulletListProps {
  /** Dotted path of the string[] field in RHF form values. */
  path: string;
  /** Placeholder shown in the empty bullet input. */
  placeholder?: string;
  /** Empty-state placeholder shown in front of the Add button when no
   *  bullets exist yet. */
  emptyText?: string;
  /** Visual size — controls list spacing. */
  className?: string;
}

export function BulletList({
  path,
  placeholder = 'Bullet',
  emptyText = 'No bullets yet',
  className
}: BulletListProps) {
  const { control } = useFormContext();
  // useFieldArray gives us stable .id for keys — survives removes + reorders.
  const { fields, append, remove } = useFieldArray({ control, name: path });

  function handleAdd() {
    append('');
    // Focus the new bullet after paint.
    requestAnimationFrame(() => {
      const node = document.querySelector(
        `[data-testid="editable-${path}.${fields.length}"]`
      );
      (node as HTMLElement | null)?.click();
    });
  }

  if (fields.length === 0) {
    return (
      <div className="flex flex-wrap items-baseline gap-2 text-[11pt]">
        {/* `print:hidden` strips the "No bullets yet" hint from the
            printed PDF. The Add button has `.no-print` already. Both
            are editor-only affordances and shouldn't appear on the
            final resume. */}
        <span
          className="italic text-zinc-400 print:hidden"
          data-testid={`empty-bullets-${path.replace(/\./g, '-')}`}
        >
          {emptyText}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAdd}
          className="no-print"
          data-testid={`add-bullet-${path.replace(/\./g, '-')}`}
        >
          <Plus className="mr-1 size-3" />
          Add bullet
        </Button>
      </div>
    );
  }

  return (
    <>
      <ul
        className={cn(
          'list-disc space-y-0.5 pl-5 text-[11pt] marker:text-zinc-400',
          className
        )}
        data-testid={`bullet-list-${path.replace(/\./g, '-')}`}
      >
        {fields.map((field, i) => (
          <li
            key={field.id}
            data-testid={`bullet-${path.replace(/\./g, '-')}-${i}`}
            className="group"
          >
            <EditableText
              path={`${path}.${i}`}
              placeholder={placeholder}
              className="inline w-fit"
            />
            <button
              type="button"
              onClick={() => remove(i)}
              aria-label={`Remove bullet ${i + 1}`}
              // no-print: the bullet itself still serializes, but the
              // ✕ button is editor-only.
              className="no-print ml-2 inline-flex size-5 items-center justify-center rounded text-zinc-400 opacity-40 transition-opacity hover:bg-zinc-200 hover:text-zinc-700 group-hover:opacity-100 hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-1 focus:ring-zinc-400"
            >
              <X className="size-3" />
            </button>
          </li>
        ))}
      </ul>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleAdd}
        className="no-print mt-1"
        data-testid={`add-bullet-${path.replace(/\./g, '-')}`}
      >
        <Plus className="mr-1 size-3" />
        Add bullet
      </Button>
    </>
  );
}
