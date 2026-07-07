'use client';

/**
 * Add a Work entry — small client button used inside the Experience
 * section of the editable Classic template.
 *
 * Appends an empty work entry via RHF's useFieldArray.append, then
 * scrolls into view + focuses the company-name field on the new entry
 * so the user can start typing without reaching for the mouse.
 *
 * Rendered only when the template is in editable mode; static /preview
 * never sees it (and the rest of the `.no-print` family strips it from
 * the PDF).
 */

import * as React from 'react';
import { Plus } from 'lucide-react';
import { useFieldArray, useFormContext } from 'react-hook-form';

import { Button } from '@/components/ui/button';

interface AddWorkButtonProps {
  /** Dot-notation path of the work array in RHF form values. */
  path: string;
}

export function AddWorkButton({ path }: AddWorkButtonProps) {
  const { control } = useFormContext();
  const { fields, append } = useFieldArray({ control, name: path });

  function handleClick() {
    // Pick a stable id we can scroll to after the re-render.
    const indexAfter = fields.length;
    append({
      company: '',
      location: '',
      url: '',
      description: '',
      // Auto-seed the first position so the user lands straight on the
      // "Title" input. JSON Resume convention: most jobs (especially
      // single-role roles) have one position per entry; users add more
      // via "+ Add a position" inside the entry.
      positions: [
        { title: '', startDate: '', endDate: '', highlights: [] }
      ]
    });

    // Defer scroll/focus to next paint — RHF has to render the new
    // item into the DOM first, and useFieldArray's id only exists once
    // the new field is registered. setTimeout(0) is the cheapest way to
    // yield a tick; we also retry slightly in case RHF hasn't finished.
    requestAnimationFrame(() => {
      const node = document.querySelector(
        `[data-testid="editable-${path}.${indexAfter}.company"]`
      );
      node?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      (node as HTMLElement | null)?.click();
    });
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={handleClick}
      className="no-print"
      data-testid={`add-${path}`}
    >
      <Plus className="mr-1 size-3" />
      Add a work entry
    </Button>
  );
}
