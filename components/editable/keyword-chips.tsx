'use client';

/**
 * KeywordChips — inline editor for an array of strings rendered as
 * "chip"-style pills. Used for Skills keywords, Education majors/minors,
 * Projects keywords, and Languages list. All four sections share the
 * same shape (a string[] under a dotted path in RHF), so the
 * component is generic.
 *
 * UX:
 *  - Each existing value renders as a chip with `cursor-text` so the
 *    user knows it's clickable.
 *  - Click → swap the text into an <input>. Blur or Enter commits.
 *  - Hover a chip → ✕ button appears; click removes.
 *  - Trailing `+ Add` button appends an empty chip and focuses it.
 *  - Empty chips (after the user deletes the text but before the ✕)
 *    hide themselves once the value normalizes to "" on blur — no
 *    dangling zero-length chips in the rendered output.
 *
 * Always inside a <FormProvider>.
 */

import * as React from 'react';
import { Plus, X } from 'lucide-react';
import { useFieldArray, useFormContext } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { EditableText } from './editable-text';

interface KeywordChipsProps {
  /** Dotted path of an array-of-strings field in RHF form values. */
  path: string;
  /** Placeholder shown in the input of an empty chip. */
  placeholder?: string;
  /** Visual size — defaults to small (sits inline with text). */
  size?: 'xs' | 'sm';
  /** Optional fixed height for the wrap container. */
  className?: string;
}

export function KeywordChips({
  path,
  placeholder = 'keyword',
  size = 'xs',
  className
}: KeywordChipsProps) {
  const { control } = useFormContext();
  // useFieldArray gives us stable .id for keys — survives removes + reorders.
  const { fields, append, remove } = useFieldArray({ control, name: path });

  function handleAdd() {
    append('');
    // Focus the new chip after paint — requestAnimationFrame is cheap
    // and survives one render cycle which is enough for the new
    // EditableText to mount.
    requestAnimationFrame(() => {
      const el = document.querySelector(
        `[data-testid="chip-input-${path}.${fields.length}"]`
      );
      (el as HTMLElement | null)?.click();
    });
  }

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-1.5',
        size === 'sm' && 'gap-2',
        className
      )}
      data-testid={`keyword-chips-${path.replace(/\./g, '-')}`}
    >
      {fields.map((field, i) => (
        <Chip
          key={field.id}
          path={`${path}.${i}`}
          placeholder={placeholder}
          size={size}
          onRemove={() => remove(i)}
        />
      ))}
      <Button
        type="button"
        variant="outline"
        size={size === 'sm' ? 'sm' : 'sm'}
        onClick={handleAdd}
        className="no-print"
        data-testid={`add-chip-${path.replace(/\./g, '-')}`}
      >
        <Plus className={size === 'sm' ? 'mr-1 size-3' : 'size-3'} />
        Add
      </Button>
    </div>
  );
}

function Chip({
  path,
  placeholder,
  size,
  onRemove
}: {
  path: string;
  placeholder: string;
  size: 'xs' | 'sm';
  onRemove: () => void;
}) {
  return (
    <span
      className={cn(
        'group inline-flex items-center gap-1 rounded-md border border-zinc-300 bg-zinc-100/60 px-2 py-0.5 text-zinc-800',
        size === 'sm' && 'px-3 py-1'
      )}
      data-testid={`chip-${path.replace(/\./g, '-')}`}
    >
      <EditableText
        path={path}
        placeholder={placeholder}
        className={cn(
          'inline w-fit',
          size === 'sm' ? 'text-sm' : 'text-xs'
        )}
      />
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove"
        // no-print: chips-only-on-screen — the underlying array still
        // serializes, the PDF reads it via the project's render path.
        className="no-print ml-0.5 -mr-1 inline-flex size-4 items-center justify-center rounded text-zinc-400 opacity-0 transition-opacity hover:bg-zinc-300 hover:text-zinc-700 group-hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-1 focus:ring-zinc-400"
      >
        <X className="size-3" />
      </button>
    </span>
  );
}
