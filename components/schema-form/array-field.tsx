'use client';

/**
 * ArrayField — renders a Zod array as a collapsible group of collapsible
 * items, with add/remove.
 *
 * Use react-hook-form's `useFieldArray` so append/remove flow through form
 * state cleanly. Each item is rendered by a nested dispatcher so we support
 * both `array of primitives` (chip input) and `array of objects` (the more
 * common case for resume sections like work/education).
 *
 * Two layers of disclosure, both controlled by local React state:
 *  - Section-level: collapses the whole "Work"/"Education"/etc. group,
 *    including the "Add" button. Useful when a user has filled several
 *    sections and just wants to glance at one.
 *  - Item-level: each item (e.g., one company in Work) gets its own
 *    header + collapse, with the Remove button sitting in the header so
 *    it stays accessible when the item is collapsed.
 *
 * State is in-memory per session. We deliberately don't persist this to
 * localStorage yet — long form sessions benefit from re-opening sections
 * the user has explicitly closed in this session, while not-very-useful
 * state survives across the editor sessions otherwise.
 */

import * as React from 'react';
import { useFieldArray, useFormContext } from 'react-hook-form';
import { ChevronRight, Plus, Trash2 } from 'lucide-react';
import type { z } from 'zod';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { unwrapSchema } from './primitives';
import { FieldDispatcher, type FieldDescriptor } from './field-dispatcher';
import { ObjectField } from './object-field';

export function ArrayField({
  name,
  schema,
  label,
  fieldOverrides,
  defaultOpen = true
}: {
  name: string;
  schema: z.ZodTypeAny;
  label?: string;
  /** Forwarded to item renders so per-item colSpan / multiline works. */
  fieldOverrides?: Record<string, Partial<FieldDescriptor>>;
  /** Caller can override the initial open state. */
  defaultOpen?: boolean;
}) {
  const { inner } = unwrapSchema(schema);
  // Zod 4 exposes the item schema as `.element` directly on the array.
  const itemSchema = (inner as unknown as { element?: z.ZodTypeAny }).element;
  const isObject =
    itemSchema && (itemSchema._def as { type?: string }).type === 'object';

  if (isObject && itemSchema) {
    return (
      <ObjectArrayField
        name={name}
        itemSchema={itemSchema as unknown as z.ZodObject<z.ZodRawShape>}
        label={label}
        fieldOverrides={fieldOverrides}
        defaultOpen={defaultOpen}
      />
    );
  }

  return (
    <PrimitiveArrayField
      name={name}
      itemSchema={itemSchema ?? schema}
      label={label}
      fieldOverrides={fieldOverrides}
      defaultOpen={defaultOpen}
    />
  );
}

/**
 * Hook that lets an array (or array-item) remember which children are
 * collapsed, keyed by useFieldArray's stable `.id`. `.id` is a uuid RHF
 * gives each field — it stays put across reorders and updates, so the
 * collapse state of "item 2" survives even after the user removes item 1.
 */
function useCollapsedItems(
  itemIds: string[],
  defaults: Record<string, boolean> = {}
) {
  const [collapsed, setCollapsed] = React.useState<Record<string, boolean>>(
    () => {
      const init: Record<string, boolean> = {};
      // Semantics: `collapsed[id] === true` means the row is
      // visibly collapsed (the field-level clicks on Line 189
      // toggle it). `defaults` is the caller's per-id override;
      // if an id is absent, default to `false` (open) so it
      // matches the effect below (which sets new ids to false).
      // The old expression `(id in defaults ? defaults[id] : true)`
      // was dead-equivalent to `: true` because callers never
      // pass `defaults`, AND the outer `!` negation read the
      // boolean backwards from the variable name — using the
      // value directly fixes both issues in one go.
      for (const id of itemIds) {
        if (id in defaults) init[id] = defaults[id];
        else init[id] = false;
      }
      return init;
    }
  );
  // When new items appear (e.g., user clicks Add), default them to open.
  React.useEffect(() => {
    setCollapsed((prev) => {
      const next = { ...prev };
      for (const id of itemIds) if (!(id in next)) next[id] = false;
      return next;
    });
  }, [itemIds.join('|')]);
  return [collapsed, setCollapsed] as const;
}

function PrimitiveArrayField({
  name,
  itemSchema,
  label,
  fieldOverrides: _fieldOverrides,
  defaultOpen
}: {
  name: string;
  itemSchema: z.ZodTypeAny;
  label?: string;
  fieldOverrides?: Record<string, Partial<FieldDescriptor>>;
  defaultOpen?: boolean;
}) {
  const { control } = useFormContext();
  const { fields, append, remove } = useFieldArray({ control, name });
  const [groupOpen, setGroupOpen] = React.useState(defaultOpen ?? true);
  const [collapsed, setCollapsed] = useCollapsedItems(fields.map((f) => f.id));

  const contentId = `array-${name}-content`;

  return (
    <section className="flex flex-col gap-3" data-testid={`array-${name}`}>
      <div className="flex items-center justify-between">
        {label && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="-ml-2 flex h-auto items-center gap-2 self-start rounded-md px-2 text-sm font-medium text-muted-foreground hover:text-foreground"
            onClick={() => setGroupOpen((o) => !o)}
            aria-expanded={groupOpen}
            aria-controls={contentId}
            data-testid={`array-toggle-${name}`}
          >
            <ChevronRight
              className={cn(
                'size-4 shrink-0 transition-transform',
                groupOpen && 'rotate-90'
              )}
              aria-hidden
            />
            {label}
          </Button>
        )}
        {groupOpen && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => append('')}
            data-testid={`add-${name}`}
          >
            <Plus className="mr-1 size-3" /> Add
          </Button>
        )}
      </div>
      {groupOpen && (
        <div
          id={contentId}
          className="flex flex-col gap-2"
          data-testid={`array-content-${name}`}
        >
          {fields.length === 0 && (
            <p className="text-sm text-muted-foreground">No items yet.</p>
          )}
          {fields.map((field, index) => {
            const isOpen = !collapsed[field.id];
            return (
              <CollapsibleItem
                key={field.id}
                isOpen={isOpen}
                onToggle={() =>
                  setCollapsed((prev) => ({ ...prev, [field.id]: !prev[field.id] }))
                }
                label={`Item ${index + 1}`}
                onRemove={() => remove(index)}
                testId={`item-${name}-${index}`}
              >
                <FieldDispatcher
                  name={`${name}.${index}`}
                  schema={itemSchema}
                />
              </CollapsibleItem>
            );
          })}
        </div>
      )}
    </section>
  );
}

function ObjectArrayField({
  name,
  itemSchema,
  label,
  fieldOverrides,
  defaultOpen
}: {
  name: string;
  itemSchema: z.ZodObject<z.ZodRawShape>;
  label?: string;
  /**
   * Forwarded as the full overrides map to each item's ObjectField. Item
   * paths inside the array look like `${name}.${index}.<leaf>`; rebase the
   * map up one level by stripping the `${name}.<index>.` prefix per item
   * so the per-item renderObjectShape's scoping picks it up.
   */
  fieldOverrides?: Record<string, Partial<FieldDescriptor>>;
  defaultOpen?: boolean;
}) {
  const { control } = useFormContext();
  const { fields, append, remove } = useFieldArray({ control, name });
  const [groupOpen, setGroupOpen] = React.useState(defaultOpen ?? true);
  const [collapsed, setCollapsed] = useCollapsedItems(fields.map((f) => f.id));
  const itemsPrefix = `${name}.`;
  const contentId = `array-${name}-content`;

  return (
    <section className="flex flex-col gap-3" data-testid={`array-${name}`}>
      <div className="flex items-center justify-between">
        {label && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="-ml-2 flex h-auto items-center gap-2 self-start rounded-md px-2 text-sm font-medium text-muted-foreground hover:text-foreground"
            onClick={() => setGroupOpen((o) => !o)}
            aria-expanded={groupOpen}
            aria-controls={contentId}
            data-testid={`array-toggle-${name}`}
          >
            <ChevronRight
              className={cn(
                'size-4 shrink-0 transition-transform',
                groupOpen && 'rotate-90'
              )}
              aria-hidden
            />
            {label}
          </Button>
        )}
        {groupOpen && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => append({})}
            data-testid={`add-${name}`}
          >
            <Plus className="mr-1 size-3" /> Add
          </Button>
        )}
      </div>
      {groupOpen && (
        <div
          id={contentId}
          className="flex flex-col gap-3"
          data-testid={`array-content-${name}`}
        >
          {fields.length === 0 && (
            <p className="text-sm text-muted-foreground">No items yet.</p>
          )}
          {fields.map((field, index) => {
            const isOpen = !collapsed[field.id];
            // Build a per-item override map: each entry's key gets the
            // current index substituted for whatever index was originally
            // written in the override (typically 0 for "apply to all").
            const itemOverrides: Record<string, Partial<FieldDescriptor>> = {};
            if (fieldOverrides) {
              for (const [key, value] of Object.entries(fieldOverrides)) {
                if (key.startsWith(itemsPrefix)) {
                  const rest = key.slice(itemsPrefix.length);
                  const dot = rest.indexOf('.');
                  const leaf = dot >= 0 ? rest.slice(dot + 1) : '';
                  if (leaf) itemOverrides[leaf] = value;
                }
              }
            }
            return (
              <CollapsibleItem
                key={field.id}
                isOpen={isOpen}
                onToggle={() =>
                  setCollapsed((prev) => ({ ...prev, [field.id]: !prev[field.id] }))
                }
                label={`Item ${index + 1}`}
                onRemove={() => remove(index)}
                testId={`item-${name}-${index}`}
              >
                <ObjectField
                  name={`${name}.${index}`}
                  schema={itemSchema}
                  fieldOverrides={itemOverrides}
                />
              </CollapsibleItem>
            );
          })}
        </div>
      )}
    </section>
  );
}

/**
 * Per-item card with collapsible content + Remove in the header. Shared
 * between object and primitive arrays so both look/behave the same.
 */
function CollapsibleItem({
  isOpen,
  onToggle,
  label,
  onRemove,
  testId,
  children
}: {
  isOpen: boolean;
  onToggle: () => void;
  label: string;
  onRemove: () => void;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="overflow-hidden rounded-lg border bg-card/30"
      data-testid={testId}
    >
      <div className="flex items-center gap-1 border-b">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-ml-1 flex h-auto flex-1 items-center gap-2 justify-start rounded-none px-3 py-2 text-sm font-medium hover:bg-transparent"
          onClick={onToggle}
          aria-expanded={isOpen}
          data-testid={`${testId}-toggle`}
        >
          <ChevronRight
            className={cn(
              'size-4 shrink-0 transition-transform',
              isOpen && 'rotate-90'
            )}
            aria-hidden
          />
          {label}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="mr-1"
          onClick={onRemove}
          aria-label={`Remove ${label}`}
          data-testid={`${testId}-remove`}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
      {isOpen && <div className="p-4">{children}</div>}
    </div>
  );
}