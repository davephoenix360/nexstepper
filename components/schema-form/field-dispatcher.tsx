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
  getTypeName,
  humanize,
  leafName,
  unwrapSchema
} from './primitives';
import { ObjectField } from './object-field';
import { ArrayField } from './array-field';

export interface FieldDescriptor {
  /** Dot-notation path into form values (e.g. 'sections.basics.name'). */
  name: string;
  /** The Zod schema for this field. */
  schema: z.ZodTypeAny;
  /** Optional UI override (label, placeholder, multiline). */
  label?: string;
  placeholder?: string;
  multiline?: boolean;
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
  multiline
}: FieldDescriptor) {
  const { inner, optional } = unwrapSchema(schema);
  const typeName = getTypeName(inner);
  const effectiveLabel = label ?? humanize(leafName(name));

  switch (typeName) {
    case 'string':
      return (
        <StringInput
          name={name}
          schema={inner}
          label={effectiveLabel}
          placeholder={placeholder ?? (optional ? 'Optional' : undefined)}
          multiline={multiline}
        />
      );

    case 'number':
      return (
        <NumberInput
          name={name}
          label={effectiveLabel}
          placeholder={placeholder}
        />
      );

    case 'boolean':
      return <BooleanInput name={name} label={effectiveLabel} />;

    case 'enum':
      return (
        <EnumInput
          name={name}
          schema={inner}
          label={effectiveLabel}
          placeholder={placeholder ?? 'Select…'}
        />
      );

    case 'object':
      return (
        <ObjectField
          name={name}
          schema={inner as unknown as z.ZodObject<z.ZodRawShape>}
          label={effectiveLabel}
        />
      );

    case 'array':
      return (
        <ArrayField
          name={name}
          schema={inner}
          label={effectiveLabel}
        />
      );

    // null / undefined / never / unknown / etc. — render a controlled
    // text input so the field still shows in the UI. Phase 3+ will replace
    // with proper widgets (date picker, etc.) as we add them.
    default:
      return (
        <FieldShell name={name} label={effectiveLabel}>
          <StringInput name={name} schema={inner} />
        </FieldShell>
      );
  }
}

/**
 * Iterate an object's `shape` and render one field per key.
 * Used both by ObjectField and at the top level of SchemaForm.
 */
export function renderObjectShape(
  objectSchema: z.ZodObject<z.ZodRawShape>,
  parentName: string,
  options?: { fieldOverrides?: Record<string, Partial<FieldDescriptor>> }
): React.ReactNode {
  const entries = Object.entries(objectSchema.shape);
  return entries.map(([key, fieldSchema]) => {
    const fullName = parentName ? `${parentName}.${key}` : key;
    const override = options?.fieldOverrides?.[key];
    return (
      <FieldDispatcher
        key={fullName}
        name={fullName}
        schema={fieldSchema as z.ZodTypeAny}
        {...override}
      />
    );
  });
}