'use client';

/**
 * Field dispatcher — given a Zod schema, renders the right input component.
 *
 * Walks the schema's `_def.type` (lowercase in Zod 4) to decide which
 * primitive to render. This is the core abstraction that lets a single
 * component handle every Zod shape. When we add a new Zod type, we add a
 * case here and a primitive in primitives.tsx.
 *
 * Object and array shapes recurse via ObjectField and ArrayField.
 */

import * as React from 'react';
import type { z } from 'zod';

import {
  BooleanInput,
  EnumInput,
  FieldShell,
  NumberInput,
  StringInput,
  getTabForField,
  getTypeName,
  humanize,
  leafName,
  unwrapSchema
} from './primitives';
import { ObjectField } from './object-field';
import { ArrayField } from './array-field';

/**
 * Tag a primitive field with `data-tab` so CSS can hide it when its
 * tab isn't active. Returns the children unchanged when no tab applies
 * (envelope fields stay always-visible).
 */
function TabTagged({ name, children }: { name: string; children: React.ReactNode }) {
  const tab = getTabForField(name);
  if (!tab) return <>{children}</>;
  return <div data-tab={tab}>{children}</div>;
}

export interface FieldDescriptor {
  /** Dot-notation path into form values (e.g. 'sections.basics.name'). */
  name: string;
  /** The Zod schema for this field. */
  schema: z.ZodTypeAny;
  /** Optional UI override (label, placeholder, multiline). */
  label?: string;
  placeholder?: string;
  multiline?: boolean;
  /**
   * Grid columns to span within a multi-column `ObjectField`.
   * 1 = half row (default), 2 = full row. Anything past 2 collapses to 2.
   * Drives how wide the input renders inside a 2-col fieldset.
   */
  colSpan?: 1 | 2;
}

/**
 * Props passed down the recursion so per-field overrides (colSpan, label,
 * multiline) keep flowing into nested object/array fields. Each level
 * re-scopes the map to its own path inside `renderObjectShape` — see that
 * function's note about dotted-path keying.
 */
export interface FieldDispatcherProps extends FieldDescriptor {
  /**
   * Optional full overrides map forwarded from the caller. Forwarded
   * verbatim into `ObjectField` / `ArrayField` so descendants slice it
   * themselves by their own path. Omit when there's nothing to override.
   */
  fieldOverrides?: Record<string, Partial<FieldDescriptor>>;
}

/**
 * Top-level dispatcher. Decides primitive vs nested and recurses.
 *
 * When no explicit label is provided (most fields in the resume schema
 * don't override), we fall back to a humanized version of the leaf
 * segment of the field path — so `sections.basics.email` becomes
 * `Email`, not the whole dotted path with a type suffix.
 */
export function FieldDispatcher({
  name,
  schema,
  label,
  placeholder,
  multiline,
  colSpan,
  fieldOverrides
}: FieldDispatcherProps) {
  const { inner, optional } = unwrapSchema(schema);
  const typeName = getTypeName(inner);
  const effectiveLabel = label ?? humanize(leafName(name));

  switch (typeName) {
    case 'string':
      return (
        <TabTagged name={name}>
          <StringInput
            name={name}
            schema={inner}
            label={effectiveLabel}
            placeholder={placeholder ?? (optional ? 'Optional' : undefined)}
            multiline={multiline}
            colSpan={colSpan}
          />
        </TabTagged>
      );

    case 'number':
      return (
        <TabTagged name={name}>
          <NumberInput
            name={name}
            label={effectiveLabel}
            placeholder={placeholder}
            colSpan={colSpan}
          />
        </TabTagged>
      );

    case 'boolean':
      return (
        <TabTagged name={name}>
          <BooleanInput name={name} label={effectiveLabel} colSpan={colSpan} />
        </TabTagged>
      );

    case 'enum':
      return (
        <TabTagged name={name}>
          <EnumInput
            name={name}
            schema={inner}
            label={effectiveLabel}
            placeholder={placeholder ?? 'Select…'}
            colSpan={colSpan}
          />
        </TabTagged>
      );

    case 'object':
      return (
        <TabTagged name={name}>
          <ObjectField
            name={name}
            schema={inner as unknown as z.ZodObject<z.ZodRawShape>}
            label={effectiveLabel}
            // Forward the full overrides map so nested renderObjectShape
            // can slice it down by this object's path and apply per-leaf
            // colSpan / label / multiline hints.
            fieldOverrides={fieldOverrides}
          />
        </TabTagged>
      );

    case 'array':
      return (
        <TabTagged name={name}>
          <ArrayField
            name={name}
            schema={inner}
            label={effectiveLabel}
            fieldOverrides={fieldOverrides}
          />
        </TabTagged>
      );

    // null / undefined / never / unknown / etc. — render a controlled
    // text input so the field still shows in the UI. Phase 3+ will replace
    // with proper widgets (date picker, etc.) as we add them.
    default:
      return (
        <TabTagged name={name}>
          <FieldShell name={name} label={effectiveLabel} colSpan={colSpan}>
            <StringInput name={name} schema={inner} />
          </FieldShell>
        </TabTagged>
      );
  }
}

/**
 * Iterate an object's `shape` and render one field per key.
 * Used both by ObjectField and at the top level of SchemaForm.
 *
 * `fieldOverrides` keys are full dotted paths (e.g. `sections.basics.email`).
 * We slice the map down by `parentName` prefix before lookup so each level
 * sees only its own descendant overrides — this lets `ObjectField` forward
 * the whole map verbatim without re-prefixing keys at every level.
 *
 * `omitFields` accepts top-level keys to skip — used by the resume
 * editor to hide the jobContext envelope from the Phase 1 form (it
 * gets a proper JD-capture UI in Phase 3).
 */
export function renderObjectShape(
  objectSchema: z.ZodObject<z.ZodRawShape>,
  parentName: string,
  options?: {
    fieldOverrides?: Record<string, Partial<FieldDescriptor>>;
    omitFields?: readonly string[];
  }
): React.ReactNode {
  const omit = new Set(options?.omitFields ?? []);
  // Pre-slice the override map to keys under this parent, stripped of
  // the parent prefix so the per-key lookup below matches `shape` keys
  // directly. The cost is one pass per render; maps are small.
  const scoped: Record<string, Partial<FieldDescriptor>> = {};
  if (options?.fieldOverrides) {
    const prefix = parentName ? `${parentName}.` : '';
    for (const [path, value] of Object.entries(options.fieldOverrides)) {
      if (!prefix) {
        scoped[path] = value;
      } else if (path.startsWith(prefix)) {
        scoped[path.slice(prefix.length)] = value;
      }
    }
  }

  return Object.entries(objectSchema.shape)
    .filter(([key]) => !omit.has(key))
    .map(([key, fieldSchema]) => {
      const fullName = parentName ? `${parentName}.${key}` : key;
      const override = scoped[key];
      return (
        <FieldDispatcher
          key={fullName}
          name={fullName}
          schema={fieldSchema as z.ZodTypeAny}
          // Pass the override props first so they can be consumed by
          // this level (label, colSpan, etc.). fieldOverrides is forwarded
          // unchanged so nested levels can slice it by their own path.
          {...override}
          fieldOverrides={options?.fieldOverrides}
        />
      );
    });
}