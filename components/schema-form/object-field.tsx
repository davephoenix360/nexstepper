'use client';

/**
 * ObjectField — renders a Zod object's shape as a collapsible card.
 *
 * Wraps each child field with a small visual container so nested objects
 * (e.g. `basics.location`) feel grouped. Header is a click-to-toggle
 * disclosure (chevron + label) so users can collapse sections they're
 * done editing, keeping the long form manageable.
 *
 * Layout: single full-width column. Each input/textarea renders at the
 * container's full width. (Earlier we tried a 2-col layout; we reverted
 * to 1-col because the resume data is dominated by long-text fields
 * that look better stacked, and the per-section collapse pattern keeps
 * the overall scroll short without needing a denser grid.)
 */

import * as React from 'react';
import { ChevronRight } from 'lucide-react';
import type { z } from 'zod';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { renderObjectShape, type FieldDescriptor } from './field-dispatcher';

export function ObjectField({
  name,
  schema,
  label,
  className,
  fieldOverrides,
  defaultOpen = true
}: {
  name: string;
  schema: z.ZodObject<z.ZodRawShape>;
  label?: string;
  className?: string;
  fieldOverrides?: Record<string, Partial<FieldDescriptor>>;
  /** Caller can override the initial open state (e.g. Section always-open). */
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  const contentId = `object-${name}-content`;

  return (
    <section
      className={cn(
        'flex flex-col gap-4 rounded-xl border bg-card/30 p-5',
        className
      )}
      data-testid={`object-${name}`}
    >
      {label && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          // `h-auto` + `px-2` lets the button size to its text (chevron + label),
          // rather than the default square button shape.
          className="-ml-2 flex h-auto items-center gap-2 self-start rounded-md px-2 text-sm font-medium text-muted-foreground hover:text-foreground"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={contentId}
          data-testid={`object-toggle-${name}`}
        >
          <ChevronRight
            className={cn(
              'size-4 shrink-0 transition-transform',
              open && 'rotate-90'
            )}
            aria-hidden
          />
          {label}
        </Button>
      )}
      {open && (
        <div
          id={contentId}
          className="flex flex-col gap-5"
          data-testid={`object-content-${name}`}
        >
          {renderObjectShape(schema, name, { fieldOverrides })}
        </div>
      )}
    </section>
  );
}