'use client';

/**
 * ObjectField — renders a Zod object's shape as a fieldset.
 *
 * Wraps each child field with a small visual container so nested objects
 * (e.g. `basics.location`, `work.positions[]`) feel grouped.
 */

import * as React from 'react';
import type { z } from 'zod';

import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { renderObjectShape } from './field-dispatcher';

export function ObjectField({
  name,
  schema,
  label,
  className
}: {
  name: string;
  schema: z.ZodObject<z.ZodRawShape>;
  label?: string;
  className?: string;
}) {
  return (
    <fieldset
      className={cn(
        'flex flex-col gap-4 rounded-lg border p-4',
        className
      )}
      data-testid={`object-${name}`}
    >
      {label && (
        <Label asChild>
          <legend className="-mx-1 px-1 text-sm font-medium text-muted-foreground">
            {label}
          </legend>
        </Label>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {renderObjectShape(schema, name)}
      </div>
    </fieldset>
  );
}