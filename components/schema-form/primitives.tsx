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
 *
 * Zod 4 stores refinements as ZodCheck instances with the format on a nested
 * `def.format` field — e.g. `z.string().email()` produces a check whose
 * `def.format === 'email'`. Older code that read `check.kind` won't match.
 */
export function inferInputType(schema: z.ZodTypeAny): string {
  const checks = (schema._def as {
    checks?: Array<{ def?: { format?: string } }>;
  }).checks ?? [];
  for (const check of checks) {
    const format = check.def?.format;
    if (format === 'email') return 'email';
    if (format === 'url') return 'url';
    if (format === 'datetime') return 'datetime-local';
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
// Zod 4 stores the schema kind on `_def.type` (lowercase, no 'Zod' prefix)
// and the wrapped schema on `_def.innerType`. Walk up to 5 layers deep
// through any combination of optional / nullable / default / union wrappers.
  for (let i = 0; i < 5; i++) {
    const def = inner._def as {
      type?: string;
      innerType?: z.ZodTypeAny;
      options?: z.ZodTypeAny[];
    };
    if (def.type === 'optional') {
      optional = true;
      inner = def.innerType!;
    } else if (def.type === 'default') {
      inner = def.innerType!;
    } else if (def.type === 'nullable') {
      // null wrappers don't change optional-ness — they just allow null.
      inner = def.innerType!;
    } else if (def.type === 'union' && def.options && def.options.length > 0) {
      // The resume schema uses `z.string().or(z.literal(''))` for fields
      // like email / url / phone that should accept an empty string. The
      // first option is always the meaningful type; take it.
      inner = def.options[0];
    } else {
      break;
    }
  }
  return { inner, optional };
}

/** Get the Zod schema's kind (string, number, object, etc.). */
export function getTypeName(schema: z.ZodTypeAny): string {
  // Zod 4 stores the kind at `_def.type` (lowercase). The old `typeName`
  // field no longer exists, so fall back to 'Unknown' instead of crashing.
  return (schema._def as { type?: string }).type ?? 'Unknown';
}

/**
 * Acronym overrides for `humanize`. JSON Resume and common app fields
 * have a handful of well-known acronyms that read better as ALL CAPS than
 * as our default "First char up, rest lowercase" treatment.
 *   `url` → `URL`, `id` → `ID`, `api` → `API`, `pdf` → `PDF`, `url` → `URL`.
 * Match is case-insensitive and matches the whole word (so "uid" stays
 * "Uid" instead of colliding with "id"). Unknown keys fall through to
 * the standard humanize treatment below.
 */
const ACRONYMS: Record<string, string> = {
  url: 'URL',
  id: 'ID',
  api: 'API',
  pdf: 'PDF',
  ai: 'AI',
  ui: 'UI',
  ux: 'UX',
  seo: 'SEO',
  sql: 'SQL',
  css: 'CSS',
  html: 'HTML',
  json: 'JSON',
  yaml: 'YAML',
  uuid: 'UUID'
};

/**
 * Convert a camelCase / snake_case field key to a human-readable label.
 * Examples: `firstName` → `First name`, `postalCode` → `Postal code`,
 * `jobContext` → `Job context`, `url` → `URL`, `linkedin` → `Linkedin`.
 */
export function humanize(key: string): string {
  // Whole-word acronym override runs first so 'url' or 'id' never get
  // title-cased by the generic splitter.
  const acronymKey = key.toLowerCase();
  if (ACRONYMS[acronymKey]) return ACRONYMS[acronymKey];

  const spaced = key
    // camelCase boundary: `aB` → `a B`
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    // snake/kebab: `_` or `-` → space
    .replace(/[_-]+/g, ' ')
    .toLowerCase()
    .trim();
  if (!spaced) return key;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Last segment of a dotted react-hook-form path. `sections.basics.email`
 * → `email`. Useful for generating field labels from the path without
 * showing the whole ancestor chain.
 */
export function leafName(dottedPath: string): string {
  const last = dottedPath.split('.').pop();
  return last && last.length > 0 ? last : dottedPath;
}

/**
 * Map a section's top-level path (e.g. `sections.work`) to a tab id in
 * the editor. Returns `undefined` for envelope fields that should always
 * be visible (name, note, status, template, jobContext).
 *
 * Tab ids map to the four groups in the editor: profile / experience /
 * skills / recognition.
 */
export function getTabForField(dottedPath: string): string | undefined {
  const TAB_MAP: Record<string, string> = {
    'sections.basics': 'profile',
    'sections.work': 'experience',
    'sections.projects': 'experience',
    'sections.volunteer': 'experience',
    'sections.education': 'experience',
    'sections.skills': 'skills',
    'sections.languages': 'skills',
    'sections.interests': 'skills',
    'sections.awards': 'recognition',
    'sections.certificates': 'recognition',
    'sections.publications': 'recognition',
    'sections.references': 'recognition'
  };
  return TAB_MAP[dottedPath];
}

interface StringInputProps {
  name: string;
  schema: z.ZodTypeAny;
  label?: string;
  placeholder?: string;
  multiline?: boolean;
  /** Grid columns to span within a multi-column ObjectField (1 or 2). */
  colSpan?: 1 | 2;
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
  multiline,
  colSpan
}: StringInputProps) {
  const { field, fieldState } = useController<FieldValues>({ name });
  const inputType = inferInputType(schema);
  const error = fieldState.error?.message;

  return (
    <FieldShell name={name} label={label} error={error} colSpan={colSpan}>
      {multiline ? (
        <Textarea
          {...field}
          id={name}
          value={(field.value as string) ?? ''}
          placeholder={placeholder}
          aria-invalid={Boolean(error)}
          data-testid={`field-${name}`}
        />
      ) : (
        <Input
          {...field}
          id={name}
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
  /** Grid columns to span within a multi-column ObjectField (1 or 2). */
  colSpan?: 1 | 2;
}

export function NumberInput({
  name,
  label,
  placeholder,
  colSpan
}: NumberInputProps) {
  const { field, fieldState } = useController<FieldValues>({ name });
  const error = fieldState.error?.message;
  // react-hook-form's number fields round-trip via string. We coerce here.
  return (
    <FieldShell name={name} label={label} error={error} colSpan={colSpan}>
      <Input
        id={name}
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
  /** Grid columns to span within a multi-column ObjectField (1 or 2). */
  colSpan?: 1 | 2;
}

export function BooleanInput({ name, label, colSpan }: BooleanInputProps) {
  const { field } = useController<FieldValues>({ name });
  return (
    // FieldShell below the label would render `label` a second
    // time, so we deliberately don't pass `label` down — this
    // row layout owns its own label + switch.
    <FieldShell name={name} colSpan={colSpan}>
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
    </FieldShell>
  );
}

interface EnumInputProps {
  name: string;
  schema: z.ZodTypeAny;
  label?: string;
  placeholder?: string;
  /** Grid columns to span within a multi-column ObjectField (1 or 2). */
  colSpan?: 1 | 2;
}

/**
 * Enum input — renders a Select with one option per enum value.
 *
 * Zod 4 stores enum entries on `_def.entries` as a key→value object map
 * (vs. Zod 3's `_def.values` array). Both `key` and `value` are the enum
 * string in our case, so we just need the keys.
 */
export function EnumInput({
  name,
  schema,
  label,
  placeholder,
  colSpan
}: EnumInputProps) {
  const { field, fieldState } = useController<FieldValues>({ name });
  const error = fieldState.error?.message;
  const entries = (schema._def as { entries?: Record<string, string> }).entries ?? {};
  const values = Object.keys(entries);

  return (
    <FieldShell name={name} label={label} error={error} colSpan={colSpan}>
      <Select
        value={(field.value as string) ?? ''}
        onValueChange={(v) => field.onChange(v)}
        name={field.name}
      >
        <SelectTrigger
          id={name}
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
 *
 * `colSpan` controls how many grid columns this field occupies when
 * rendered inside a multi-column `ObjectField`. Defaults to 1. A field
 * spanning 2 ends its own row in a 2-col layout, which is the right
 * shape for things like a Summary textarea or a long URL.
 */
export function FieldShell({
  name,
  label,
  error,
  children,
  className,
  colSpan
}: {
  name: string;
  label?: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
  /** Grid columns to span within a multi-column ObjectField (1 or 2). */
  colSpan?: 1 | 2;
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-1.5',
        colSpan === 2 && 'md:col-span-2',
        className
      )}
    >
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