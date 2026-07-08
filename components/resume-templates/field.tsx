'use client';

/**
 * Field* primitives — the read-only-aware counterparts to the
 * editor's Editable* components.
 *
 * Why these exist
 *   The editor uses EditableText / EditableTextarea / KeywordChips /
 *   BulletList. Each of those binds to a form context and renders
 *   click-to-edit affordances (`X` to remove a chip, `+ Add` to
 *   append a bullet, etc.). They're perfect for the WYSIWYG editor
 *   because the parent provides the form context.
 *
 *   But the same template code also has to render in contexts without
 *   a form context — the preview page, the future Playwright PDF
 *   render path. Naively rendering those Editable* components outside
 *   a FormProvider crashes (`useFormContext` returns null → useController
 *   → "Cannot read properties of null").
 *
 *   The previous workaround wrapped ModernTemplate in a static
 *   `FormProvider` seeded with `data` so the editor-shaped code would
 *   "work". That keeps the data flowing but leaves the editor's
 *   `X` / `+ Add` affordances visible in the read-only view, which
 *   is wrong for a print-clean resume.
 *
 *   The right shape: every place a template wants a single piece of
 *   text / a list of strings, render `<Field ... />` instead of
 *   `<EditableText ... />`. Field picks the right render based on
 *   `mode.editable`:
 *
 *     editable=true   → the editor's Editable* (RHF-bound, with controls)
 *     editable=false  → plain `<span>` / `<p>` / `<ul>` rendered
 *                       directly from `data`, walking the dotted path
 *                       to resolve the value. No form context needed,
 *                       no editor controls.
 *
 *   Templates keep their structure intact; only the leaf components
 *   need to swap. Classic already does its own per-section split
 *   (`editable ? SkillsInline : <plain>`) so this helper set is
 *   Modern-first; Classic can adopt it later if we want one shape.
 *
 * Path walking
 *   `read(data, 'sections.work.0.company')` walks the dotted path.
 *   Numeric segments resolve as array indices, the rest as object
 *   keys. Returns `undefined` if anything along the way is missing.
 *
 *   We intentionally type the return as `unknown` — the caller knows
 *   the shape at the call site and renders accordingly. The Field
 *   components narrow to `string` / `string[]` for their specific
 *   use cases.
 */

import * as React from 'react';
import type { ElementType } from 'react';
import { EditableText, EditableTextarea } from '@/components/editable/editable-text';
import { KeywordChips } from '@/components/editable/keyword-chips';
import { BulletList } from '@/components/editable/bullet-list';
import { cn } from '@/lib/utils';

import type { ResumeData } from '@/lib/resume-schema';

/**
 * The "where am I rendering" signal passed to every Field*. Templates
 * build this once at their root and forward it down — keeps the props
 * uniform across every helper.
 */
export interface FieldMode {
  editable: boolean;
  data: ResumeData;
}

/** Walk a dotted path against `data`. Numeric segments = array indices. */
export function read(data: unknown, path: string): unknown {
  let cur: unknown = data;
  for (const key of path.split('.')) {
    if (cur == null) return undefined;
    if (Array.isArray(cur)) {
      const i = Number(key);
      if (!Number.isFinite(i)) return undefined;
      cur = cur[i];
    } else if (typeof cur === 'object') {
      cur = (cur as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }
  return cur;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function arr(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

/* -------------------------------------------------------------------------- */
/*  Field — single-line text                                                  */
/* -------------------------------------------------------------------------- */

interface FieldProps {
  mode: FieldMode;
  path: string;
  /** Class applied in BOTH modes so layout stays identical. */
  className?: string;
  /** Rendered (muted) when the value is empty. */
  placeholder?: string;
  /** Tag for the idle render in editable mode AND for the read-only span. */
  as?: 'span' | 'h1' | 'h2' | 'h3' | 'h4' | 'p' | 'div';
  /** Extra classes applied only to the editing (input) state. */
  editingClassName?: string;
}

export function Field({
  mode,
  path,
  className,
  placeholder,
  as,
  editingClassName
}: FieldProps) {
  if (mode.editable) {
    return (
      <EditableText
        path={path}
        className={className}
        editingClassName={editingClassName}
        placeholder={placeholder}
        {...(as ? { as } : {})}
      />
    );
  }
  const value = str(read(mode.data, path));
  if (!value) {
    // Mirror EditableText's "empty state" behavior but without the
    // print:hidden wrapper — read-only mode never prints
    // "Click to add" because the placeholder is only shown when the
    // user has saved nothing yet. Kept here so the visual width
    // doesn't collapse.
    return (
      <span className={cn(className, 'text-zinc-400')}>
        {placeholder ?? ''}
      </span>
    );
  }
  const Tag: ElementType = as ?? 'span';
  return <Tag className={className}>{value}</Tag>;
}

/* -------------------------------------------------------------------------- */
/*  FieldArea — multi-line text                                               */
/* -------------------------------------------------------------------------- */

interface FieldAreaProps {
  mode: FieldMode;
  path: string;
  className?: string;
  placeholder?: string;
  rows?: number;
  /** Read-only wrapper element. The editor wraps in the same
   *  EditableTextarea; for read-only we use `<p>` by default. */
  readOnlyAs?: 'p' | 'div';
}

export function FieldArea({
  mode,
  path,
  className,
  placeholder,
  rows,
  readOnlyAs = 'p'
}: FieldAreaProps) {
  if (mode.editable) {
    return (
      <EditableTextarea
        path={path}
        className={className}
        placeholder={placeholder}
        rows={rows}
      />
    );
  }
  const value = str(read(mode.data, path));
  if (!value) {
    return React.createElement(readOnlyAs, {
      className: cn(className, 'text-zinc-400')
    }, placeholder ?? '');
  }
  return React.createElement(readOnlyAs, { className }, value);
}

/* -------------------------------------------------------------------------- */
/*  FieldChips — string[] as inline pills (Skills keywords, Languages)        */
/* -------------------------------------------------------------------------- */

interface FieldChipsProps {
  mode: FieldMode;
  path: string;
  placeholder?: string;
  size?: 'xs' | 'sm';
  /** Read-only color. Editable mode lets KeywordChips pick its own. */
  chipClassName?: string;
  /** Read-only wrapper class. */
  className?: string;
}

export function FieldChips({
  mode,
  path,
  placeholder,
  size,
  chipClassName,
  className
}: FieldChipsProps) {
  if (mode.editable) {
    return (
      <KeywordChips
        path={path}
        placeholder={placeholder}
        size={size}
        className={className}
      />
    );
  }
  const values = arr(read(mode.data, path));
  if (values.length === 0) {
    return (
      <span className={cn(className, 'text-zinc-400 text-sm')}>
        {placeholder ? `Add ${placeholder}` : ''}
      </span>
    );
  }
  return (
    <span className={cn('inline-flex flex-wrap gap-1.5', className)}>
      {values.map((v, i) => (
        <span
          key={`${v}-${i}`}
          className={cn(
            'inline-flex items-center rounded-md border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[10.5pt] text-zinc-700 print:border-zinc-300',
            chipClassName
          )}
        >
          {v}
        </span>
      ))}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*  FieldBullets — string[] as <ul> (Work highlights, Projects bullets)       */
/* -------------------------------------------------------------------------- */

interface FieldBulletsProps {
  mode: FieldMode;
  path: string;
  placeholder?: string;
  emptyText?: string;
  /** Class on the inner <ul>. */
  className?: string;
  /** Class on each <li> (e.g. for typography). */
  itemClassName?: string;
}

export function FieldBullets({
  mode,
  path,
  placeholder,
  emptyText,
  className,
  itemClassName
}: FieldBulletsProps) {
  if (mode.editable) {
    return (
      <BulletList
        path={path}
        placeholder={placeholder}
        emptyText={emptyText}
        className={className}
      />
    );
  }
  const values = arr(read(mode.data, path)).filter((s) => s.trim().length > 0);
  if (values.length === 0) return null;
  return (
    <ul className={cn('list-outside list-disc space-y-1 pl-5', className)}>
      {values.map((v, i) => (
        <li key={i} className={itemClassName}>
          {v}
        </li>
      ))}
    </ul>
  );
}
