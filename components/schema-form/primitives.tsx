'use client';

/**
 * Form primitives — thin typed wrappers around react-hook-form's `useController`.
 *
 * Each primitive takes a `name` (the dot-notation path into form values) and
 * the Zod schema for that field. We unwrap `ZodOptional` / `ZodDefault` to
 * determine the real underlying type and required-ness.
 */

import * as React from 'react';
import { useController, type FieldValues } from 'react-hook-form';
import type { z } from 'zod';

import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/**
 * Inspect a Zod schema's checks to figure out the best HTML input type.
 * We only look at the most common refinements (email, url, datetime); default
 * to plain text otherwise.
 */
export function inferInputType(schema: z.ZodTypeAny): string {
  const checks = (schema._def as { checks?: Array<{ kind: string }> }).checks ?? [];
  for (const check of checks) {
    if (check.kind === 'email') return 'email';
    if (check.kind === 'url') return 'url';
    if (check.kind === 'datetime') return 'datetime-local';
  }
  return 'text';
}

/** Unwrap ZodOptional / ZodDefault to get the inner schema + required-ness. */
export function unwrapSchema(schema: z.ZodTypeAny): {
  inner: z.ZodTypeAny;
  optional: boolean;
} {
  let inner = schema;
  let optional = false;
  // Zod 4 uses `._def.typeName`; walk through wrappers.
  // Defensive: each step re-reads the typeName in case the schema swaps.
  for (let i = 0; i < 5; i++) {
    const def = inner._def as { typeName?: string; innerType?: z.ZodTypeAny };
    if (def.typeName === 'ZodOptional') {
      optional = true;
      inner = def.innerType!;
    } else if (def.typeName === 'ZodDefault') {
      inner = def.innerType!;
    } else {
      break;
    }
  }
  return { inner, optional };
}

/** Get the Zod schema's "typeName" (ZodString, ZodNumber, ZodObject, etc.). */
export function getTypeName(schema: z.ZodTypeAny): string {
  return (schema._def as { typeName?: string }).typeName ?? 'Unknown';
}

interface StringInputProps {
  name: string;
  schema: z.ZodTypeAny;
  label?: string;
  placeholder?: string;
  multiline?: boolean;
}

/**
 * String input (text, email, url, datetime — detected from Zod checks).
 * Set `multiline` to render a textarea instead of a single-line input.
 */
export function StringInput({
  name,
  schema,
  label,
  placeholder,
  multiline
}: StringInputProps) {
  const { field, fieldState } = useController<FieldValues>({ name });
  const inputType = inferInputType(schema);
  const error = fieldState.error?.message;

  return (
    <FieldShell name={name} label={label} error={error}>
      {multiline ? (
        <Textarea
          {...field}
          value={(field.value as string) ?? ''}
          placeholder={placeholder}
          aria-invalid={Boolean(error)}
          data-testid={`field-${name}`}
        />
      ) : (
        <Input
          {...field}
          value={(field.value as string) ?? ''}
          type={inputType}
          placeholder={placeholder}
          aria-invalid={Boolean(error)}
          data-testid={`field-${name}`}
        />
      )}
    </FieldShell>
  );
}

interface NumberInputProps {
  name: string;
  label?: string;
  placeholder?: string;
}

export function NumberInput({ name, label, placeholder }: NumberInputProps) {
  const { field, fieldState } = useController<FieldValues>({ name });
  const error = fieldState.error?.message;
  // react-hook-form's number fields round-trip via string. We coerce here.
  return (
    <FieldShell name={name} label={label} error={error}>
      <Input
        type="number"
        value={(field.value as number | undefined) ?? ''}
        onChange={(e) => {
          const v = e.target.value;
          field.onChange(v === '' ? undefined : Number(v));
        }}
        onBlur={field.onBlur}
        ref={field.ref}
        name={field.name}
        placeholder={placeholder}
        aria-invalid={Boolean(error)}
        data-testid={`field-${name}`}
      />
    </FieldShell>
  );
}

interface BooleanInputProps {
  name: string;
  label?: string;
}

export function BooleanInput({ name, label }: BooleanInputProps) {
  const { field } = useController<FieldValues>({ name });
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border p-3">
      {label && (
        <Label htmlFor={name} className="cursor-pointer">
          {label}
        </Label>
      )}
      <Switch
        id={name}
        checked={Boolean(field.value)}
        onCheckedChange={field.onChange}
        onBlur={field.onBlur}
        ref={field.ref}
        name={field.name}
        data-testid={`field-${name}`}
      />
    </div>
  );
}

interface EnumInputProps {
  name: string;
  schema: z.ZodTypeAny;
  label?: string;
  placeholder?: string;
}

/**
 * Enum input — renders a Select with one option per enum value.
 * For Zod 4 enums (z.enum(['draft', 'completed'])), values are at `_def.values`.
 */
export function EnumInput({ name, schema, label, placeholder }: EnumInputProps) {
  const { field, fieldState } = useController<FieldValues>({ name });
  const error = fieldState.error?.message;
  const values = ((schema._def as { values?: readonly string[] }).values ?? []) as string[];

  return (
    <FieldShell name={name} label={label} error={error}>
      <Select
        value={(field.value as string) ?? ''}
        onValueChange={(v) => field.onChange(v)}
        name={field.name}
      >
        <SelectTrigger
          ref={field.ref}
          onBlur={field.onBlur}
          aria-invalid={Boolean(error)}
          data-testid={`field-${name}`}
        >
          <SelectValue placeholder={placeholder ?? 'Select…'} />
        </SelectTrigger>
        <SelectContent>
          {values.map((v) => (
            <SelectItem key={v} value={v}>
              {v}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FieldShell>
  );
}

/**
 * Wraps a single field with its label + error display. Kept small and
 * dependency-free so individual primitives stay composable.
 */
export function FieldShell({
  name,
  label,
  error,
  children,
  className
}: {
  name: string;
  label?: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && <Label htmlFor={name}>{label}</Label>}
      {children}
      {error && (
        <p className="text-sm text-destructive" data-testid={`error-${name}`}>
          {error}
        </p>
      )}
    </div>
  );
}