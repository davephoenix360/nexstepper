'use client';

/**
 * ArrayField — renders a Zod array as a repeatable group with add/remove.
 *
 * Uses react-hook-form's `useFieldArray` so append/remove flow through the
 * form state cleanly. Each item is rendered by a nested dispatcher so we
 * support both `array of primitives` (chip input) and `array of objects`
 * (the more common case for resume sections like work/education).
 */

import * as React from 'react';
import { useFieldArray, useFormContext } from 'react-hook-form';
import { Plus, Trash2 } from 'lucide-react';
import type { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { unwrapSchema } from './primitives';
import { FieldDispatcher } from './field-dispatcher';
import { ObjectField } from './object-field';

export function ArrayField({
  name,
  schema,
  label
}: {
  name: string;
  schema: z.ZodTypeAny;
  label?: string;
}) {
  const { inner } = unwrapSchema(schema);
  // Zod 4 exposes the item schema as `.element` directly on the array.
  const itemSchema = (inner as unknown as { element?: z.ZodTypeAny }).element;
  const isObject =
    itemSchema &&
    (itemSchema._def as { typeName?: string }).typeName === 'ZodObject';

  if (isObject && itemSchema) {
    return (
      <ObjectArrayField
        name={name}
        itemSchema={itemSchema as unknown as z.ZodObject<z.ZodRawShape>}
        label={label}
      />
    );
  }

  return (
    <PrimitiveArrayField
      name={name}
      itemSchema={itemSchema ?? schema}
      label={label}
    />
  );
}

function PrimitiveArrayField({
  name,
  itemSchema,
  label
}: {
  name: string;
  itemSchema: z.ZodTypeAny;
  label?: string;
}) {
  // For primitives (e.g. array of strings), we just stack StringInputs.
  // Full chip-input UX is a Phase 4 polish item.
  const { control } = useFormContext();
  const { fields, append, remove } = useFieldArray({ control, name });

  return (
    <div className="flex flex-col gap-3" data-testid={`array-${name}`}>
      <div className="flex items-center justify-between">
        {label && <Label>{label}</Label>}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => append('')}
          data-testid={`add-${name}`}
        >
          <Plus className="mr-1 size-3" /> Add
        </Button>
      </div>
      {fields.length === 0 && (
        <p className="text-sm text-muted-foreground">No items yet.</p>
      )}
      <div className="flex flex-col gap-2">
        {fields.map((field, index) => (
          <div key={field.id} className="flex items-start gap-2">
            <div className="flex-1">
              <FieldDispatcher
                name={`${name}.${index}`}
                schema={itemSchema}
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => remove(index)}
              aria-label={`Remove item ${index + 1}`}
              data-testid={`remove-${name}-${index}`}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function ObjectArrayField({
  name,
  itemSchema,
  label
}: {
  name: string;
  itemSchema: z.ZodObject<z.ZodRawShape>;
  label?: string;
}) {
  const { control } = useFormContext();
  const { fields, append, remove } = useFieldArray({ control, name });

  return (
    <div className="flex flex-col gap-3" data-testid={`array-${name}`}>
      <div className="flex items-center justify-between">
        {label && <Label>{label}</Label>}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => append({})}
          data-testid={`add-${name}`}
        >
          <Plus className="mr-1 size-3" /> Add
        </Button>
      </div>
      {fields.length === 0 && (
        <p className="text-sm text-muted-foreground">No items yet.</p>
      )}
      <div className="flex flex-col gap-4">
        {fields.map((field, index) => (
          <div
            key={field.id}
            className="relative rounded-lg border p-4 pr-12"
            data-testid={`item-${name}-${index}`}
          >
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-2 top-2"
              onClick={() => remove(index)}
              aria-label={`Remove item ${index + 1}`}
              data-testid={`remove-${name}-${index}`}
            >
              <Trash2 className="size-4" />
            </Button>
            <ObjectField
              name={`${name}.${index}`}
              schema={itemSchema}
              label={`Item ${index + 1}`}
            />
          </div>
        ))}
      </div>
    </div>
  );
}