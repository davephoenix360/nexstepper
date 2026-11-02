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
 *
 * Formatting
 *   The read-only branch renders through `<RichText>` so a marked
 *   field shows its bold / italic / underline in the preview page, the
 *   public share link and the printed PDF — the same marks the editor
 *   shows, because the editor's idle render is the SAME component.
 *
 *   The spans come from `data.formatting[path]`, keyed by the SAME
 *   dotted path react-hook-form uses. A list item's path is the list
 *   path plus its index (`sections.projects.0.highlights.2`), which is
 *   exactly what the editor's `BulletList` / `KeywordChips` address.
 *
 *   `<RichText>` renders a FRAGMENT and adds no characters of its own,
 *   so a field with no marks renders as a bare text node — the DOM of
 *   an unmarked resume is unchanged by this feature.
 */

import * as React from 'react';
import type { ElementType } from 'react';
import { EditableText, EditableTextarea } from '@/components/editable/editable-text';
import { KeywordChips } from '@/components/editable/keyword-chips';
import { BulletList } from '@/components/editable/bullet-list';
import { RichText } from '@/components/rich-text/rich-text';
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
  // `data-rich-path` is how the editor's selection handler knows which
  // field a mouse selection landed in — it walks up to the nearest
  // ancestor carrying the attribute.
  return (
    <Tag className={className} data-rich-path={path}>
      <RichText value={value} spans={mode.data.formatting?.[path]} />
    </Tag>
  );
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
  return React.createElement(
    readOnlyAs,
    { className, 'data-rich-path': path },
    <RichText value={value} spans={mode.data.formatting?.[path]} />
  );
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
  /** Inline style applied to each chip in read-only mode. Used by
   *  templates that need accent-coloured chips (e.g. Creative) where
   *  the chip background depends on the template accent variable.
   *  Editing mode ignores this -- KeywordChips picks its own style. */
  chipStyle?: React.CSSProperties;
  /**
   * Read-only rendering. `list` (the default) is a plain
   * comma-separated run of text — what a resume should actually look
   * like. `chips` restores the boxed pills.
   *
   * Pills are opt-IN because Creative uses accent-coloured chips as a
   * deliberate part of its identity, but boxing every keyword on every
   * other template reads as UI chrome rather than content and wastes
   * vertical space in a one-page resume.
   */
  variant?: 'list' | 'chips';
}

export function FieldChips({
  mode,
  path,
  placeholder,
  size,
  chipClassName,
  className,
  chipStyle,
  variant = 'list'
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
  if (variant === 'chips') {
    return (
      <span className={cn('inline-flex flex-wrap gap-1.5', className)}>
        {values.map((v, i) => (
          <span
            key={`${v}-${i}`}
            className={cn(
              'inline-flex items-center rounded-md border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[10.5pt] text-zinc-700 print:border-zinc-300',
              chipClassName
            )}
            style={chipStyle}
          >
            <RichText value={v} spans={mode.data.formatting?.[`${path}.${i}`]} />
          </span>
        ))}
      </span>
    );
  }

  // Comma-separated, so it wraps like prose and reads as the resume it
  // is. Joined rather than mapped to spans so there is no per-item box
  // for a screen reader to walk and nothing to strip in print.
  //
  // The one exception: a MARKED chip has to be rendered on its own,
  // because the mark wraps the chip's text and the separator between
  // chips is not part of any chip's value. When no chip is marked the
  // joined string is kept verbatim — an unmarked list of keywords is
  // still one text node, exactly as it was before this feature.
  const formatting = mode.data.formatting;
  const anyMarked = values.some((_, i) => (formatting?.[`${path}.${i}`]?.length ?? 0) > 0);

  if (!anyMarked) {
    return <span className={className}>{values.join(', ')}</span>;
  }

  return (
    <span className={className}>
      {values.map((v, i) => (
        <React.Fragment key={`${v}-${i}`}>
          {i > 0 && ', '}
          <RichText value={v} spans={formatting?.[`${path}.${i}`]} />
        </React.Fragment>
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
  // The ORIGINAL index is kept, not the index in the filtered list:
  // the editor addresses a bullet as `<listPath>.<index>` against the
  // UNFILTERED array, so a filtered-out empty bullet must not shift
  // every later bullet's path by one.
  const values = arr(read(mode.data, path));
  const items = values
    .map((v, i) => ({ value: v, index: i }))
    .filter((item) => item.value.trim().length > 0);
  if (items.length === 0) return null;
  return (
    <ul className={cn('list-outside list-disc space-y-1 pl-5', className)}>
      {items.map((item) => (
        // Per-bullet break avoidance (Oct 2026).
        //
        // The bug this fixes: when the whole WORK ENTRY carried
        // `break-inside-avoid`, an entry whose bullets spilled past
        // the page boundary was pushed ENTIRELY to the next page,
        // leaving ~half a page of dead space. The user reported this
        // as "page breaks are reluctant to break between bullet
        // points, they'd rather move the whole work experience
        // section down."
        //
        // The fix is a two-level preference:
        //   - The title row carries `break-inside-avoid` so a
        //     header can never orphan at the bottom of a page.
        //   - Each individual <li> carries `break-inside-avoid` so a
        //     bullet is never split mid-sentence across pages.
        //   - The <ul> and the entry wrapper carry NOTHING, so the
        //     browser is free to break BETWEEN bullets — which is
        //     exactly the behaviour a reader expects.
        //
        // Previously no template had the per-<li> guard, so bullets
        // could split mid-sentence (Modern) or the whole entry jumped
        // (classic / minimal / executive / creative). This line makes
        // all six templates behave identically: never orphan a
        // header, never split a bullet, always allow a break between
        // two bullets.
        <li key={item.index} className={cn('print:break-inside-avoid', itemClassName)}>
          <RichText
            value={item.value}
            spans={mode.data.formatting?.[`${path}.${item.index}`]}
          />
        </li>
      ))}
    </ul>
  );
}
