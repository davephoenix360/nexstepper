'use client';

/**
 * EditableText / EditableTextarea — primitives that turn a piece of text
 * inside the rendered resume into an inline editor without changing its
 * typography.
 *
 * Three render states:
 *  - Idle:   renders the requested Tag (h1, h2, span, p) with the same
 *            classes the static template uses. cursor-text + a faint
 *            hover:bg show the user this is editable; both are no-ops on
 *            paper (hover doesn't fire, cursor is ignored).
 *  - Editing: renders a real <input> (or <textarea> via EditableTextarea)
 *            with identical typography classes plus an underline hint.
 *  - Empty:  idle renders the placeholder text in muted color so the
 *            editor never looks broken for an unfinished resume.
 *            The placeholder is wrapped in a <span class="print:hidden">
 *            so it disappears from the printed / Save-as-PDF output —
 *            we don't want "Click to add" or "Job title" appearing in
 *            the user's actual resume.
 *
 * Required:
 *  - Must be rendered inside an RHF <FormProvider> from react-hook-form
 *    (the editor's <EditableResume> provides one). On its own this
 *    component is inert — useController needs a form context to bind to.
 *
 * Keyboard / a11y:
 *  - Idle: role="button" tabIndex={0} + Enter/Space activate.
 *  - Editing: Enter commits (input only); Esc rolls back to the prior
 *    value without writing.
 *  - Screen readers see the value's text plus the empty-state placeholder.
 */

import * as React from 'react';
import { useController, useFormContext, type FieldValues } from 'react-hook-form';

import { cn } from '@/lib/utils';
import { RichText } from '@/components/rich-text/rich-text';
import { useFormatting } from '@/components/rich-text/use-formatting';
import { spansForWholeValue } from '@/lib/rich-text/spans';

/** A mapping of HTML tag name -> React component type for the idle render. */
type Tag = 'span' | 'h1' | 'h2' | 'h3' | 'h4' | 'p' | 'div';

interface BaseProps {
  /** Dot-notation path into RHF form values (`sections.basics.name`). */
  path: string;
  /** ClassName applied to BOTH idle and editing renders so type stays identical. */
  className?: string;
  /** Extra classes applied only to the editing (input/textarea) render. */
  editingClassName?: string;
  /** Show this muted text when the value is empty. */
  placeholder?: string;
  /**
   * Whether this field can carry formatting marks. Default `true`.
   *
   * `false` means the field renders as plain text AND carries no
   * `data-rich-path`, so the formatting toolbar ignores it entirely —
   * a mark can neither be applied nor stored.
   *
   * This is for fields whose read-only render is a COMPOSITE of several
   * leaves rather than one, so there is no single span to hand the mark
   * to. `DateRange` is the case in point: it renders a start date, an
   * en-dash and an end date as three pieces. Without this, a user could
   * bold a date in the editor and the share link would silently drop it
   * — the exact "two surfaces, two answers" drift this feature exists
   * to prevent.
   */
  formatting?: boolean;
}

interface EditableTextProps extends BaseProps {
  /** Tag for the idle render. Default `'span'`. */
  as?: Tag;
}

interface EditableTextareaProps extends BaseProps {
  /** Number of visible textarea rows. Default 3. */
  rows?: number;
}

/**
 * Shared hook: read RHF state for `path` and expose a clean coercion
 * (`value ?? ''`). RHF's DefaultValues pruning leaves empty leaf fields
 * as `undefined`; we treat that as empty string.
 */
function useBoundValue(path: string) {
  // useFormContext throws if we're outside a provider. We want this to
  // crash loudly in dev — the editor wraps <EditableResume> in a
  // FormProvider so this never fires in practice.
  const form = useFormContext();
  const { field, fieldState } = useController<FieldValues>({ name: path });
  const error = fieldState.error?.message;
  const value = (field.value as string | undefined) ?? '';
  const hasValue = value.length > 0;
  return { form, field, error, value, hasValue };
}

/**
 * True when the user has just made a text selection inside this field.
 *
 * A drag-selection ends with a `click` event, so the naive
 * implementation would open the editor and destroy the very selection
 * the formatting toolbar is about to act on. A plain click leaves the
 * selection collapsed, so the editor opens exactly as it did before.
 */
function hasSelectionInside(path: string): boolean {
  if (typeof window === 'undefined') return false;
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) return false;
  const node = selection.anchorNode;
  const element =
    node instanceof HTMLElement ? node : (node?.parentElement ?? null);
  const field = element?.closest('[data-rich-path]');
  return field?.getAttribute('data-rich-path') === path;
}

/**
 * Inline edit-as-single-line. Click to focus, blur or Enter to commit,
 * Esc to roll back. See file header for the render-state contract.
 */
export function EditableText({
  path,
  className,
  editingClassName,
  placeholder = 'Click to add',
  as: Tag = 'span',
  formatting = true
}: EditableTextProps) {
  const { field, error, value, hasValue } = useBoundValue(path);
  const { spansFor, setSpans } = useFormatting();
  const [editing, setEditing] = React.useState(false);
  // Local draft so the input can render the user's typing without
  // re-rendering on every keystroke (RHF's onChange does run, but the
  // local state keeps things snappy when the value clobbers the cursor).
  const [draft, setDraft] = React.useState(value);
  const original = React.useRef(value);

  React.useEffect(() => {
    // Sync the local draft when RHF state changes externally (e.g. Save
    // sent data, or "+ Add entry" populated this field).
    if (!editing) setDraft(value);
  }, [value, editing]);

  function startEdit() {
    // The click that ended a drag-selection is not an edit gesture.
    if (hasSelectionInside(path)) return;
    original.current = value;
    setDraft(value);
    setEditing(true);
  }

  /**
   * Ctrl/Cmd+B on a focused field: bold the WHOLE value.
   *
   * The fast path for the thing people actually want — a skill chip, a
   * company name, a whole bullet — without having to drag-select it.
   */
  function toggleWholeFieldBold() {
    setSpans(path, spansForWholeValue(value, spansFor(path), 'bold'));
  }

  function commit() {
    if (draft !== original.current) field.onChange(draft);
    setEditing(false);
  }

  function cancel() {
    setDraft(original.current);
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        // Browser strips event handlers when rendering for print, so
        // even if the user triggers Print with this still focused, the
        // input's value renders as plain text.
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
          else if (e.key === 'Escape') {
            cancel();
          }
        }}
        aria-invalid={Boolean(error)}
        data-testid={`editable-${path}`}
        className={cn(
          className,
          // Underline + cursor hint while editing. bg-transparent so we
          // overlay on the page color; outline-none because the focus
          // ring already conveys focus state.
          'bg-transparent border-b border-indigo-300 dark:border-indigo-400 outline-none',
          // Strip in print: no border, no padding-shift, no cursor.
          'print:border-none print:bg-transparent print:px-0 print:cursor-default',
          editingClassName
        )}
      />
    );
  }

  const isEmpty = !hasValue;

  return (
    <Tag
      role="button"
      tabIndex={0}
      onClick={startEdit}
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) {
          e.preventDefault();
          toggleWholeFieldBold();
          return;
        }
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          startEdit();
        }
      }}
      data-testid={`editable-${path}`}
      // Which field a mouse selection landed in. The formatting
      // toolbar walks up to the nearest ancestor carrying this.
      // Omitted for fields that cannot carry marks, so the toolbar
      // never offers to format something the read-only render
      // would drop.
      data-rich-path={formatting ? path : undefined}
      data-empty={isEmpty || undefined}
      className={cn(
        className,
        // Inline-pointer + faint hover background to show the field is
        // clickable. Both no-op in print (hover doesn't fire, cursor
        // ignored).
        'cursor-text hover:bg-indigo-50/40 rounded-sm focus:outline-none focus:ring-2 focus:ring-indigo-300/50',
        // Empty state: muted placeholder text.
        //
        // NOT `text-muted-foreground`: the resume "paper" is
        // `bg-white` in BOTH themes (it is a document, not a surface),
        // so a theme token would flip to the dark theme's light grey
        // and land on white paper at 2.56:1 — invisible. The paper's
        // own palette is zinc, so the placeholder joins it.
        isEmpty && 'text-zinc-500'
      )}
    >
      {isEmpty ? (
        // `print:hidden` strips the placeholder from the printed
        // output (and the "Save as PDF" path that goes through the
        // browser's print engine). Without this, every empty field
        // would render its "Click to add" / "Job title" copy on the
        // final resume. The on-screen editor still shows it; only
        // @media print (Tailwind's `print:` variant) is affected.
        <span
          className="print:hidden"
          data-testid={`editable-${path}-placeholder`}
        >
          {placeholder}
        </span>
      ) : (
        formatting ? (
          <RichText value={value} spans={spansFor(path)} />
        ) : (
          value
        )
      )}
    </Tag>
  );
}

/**
 * Multi-line variant of EditableText. Same contract; renders a <textarea>
 * in the editing state with a fixed row count and auto-grow feel (rows
 * grow on overflow via field-sizing-content on the textarea's own
 * styles — we keep an explicit row count for predictability).
 */
export function EditableTextarea({
  path,
  className,
  editingClassName,
  placeholder = 'Click to add',
  rows = 4,
  formatting = true
}: EditableTextareaProps) {
  const { field, error, value, hasValue } = useBoundValue(path);
  const { spansFor, setSpans } = useFormatting();
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);
  const original = React.useRef(value);

  React.useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  function startEdit() {
    if (hasSelectionInside(path)) return;
    original.current = value;
    setDraft(value);
    setEditing(true);
  }

  function toggleWholeFieldBold() {
    setSpans(path, spansForWholeValue(value, spansFor(path), 'bold'));
  }

  function commit() {
    if (draft !== original.current) field.onChange(draft);
    setEditing(false);
  }

  function cancel() {
    setDraft(original.current);
    setEditing(false);
  }

  if (editing) {
    return (
      <textarea
        autoFocus
        value={draft}
        rows={rows}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          // Esc cancels; Ctrl/Cmd+Enter commits (textarea swallows plain
          // Enter for newlines).
          if (e.key === 'Escape') cancel();
          else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            (e.currentTarget as HTMLTextAreaElement).blur();
          }
        }}
        aria-invalid={Boolean(error)}
        data-testid={`editable-${path}`}
        className={cn(
          className,
          // Block display + full width so a multi-line editor doesn't
          // break the surrounding inline rhythm.
          'block w-full bg-transparent border border-indigo-300 dark:border-indigo-400 rounded-md outline-none px-2 py-1 resize-y',
          'print:border-none print:bg-transparent print:px-0 print:cursor-default',
          editingClassName
        )}
      />
    );
  }

  const isEmpty = !hasValue;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={startEdit}
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) {
          e.preventDefault();
          toggleWholeFieldBold();
          return;
        }
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          startEdit();
        }
      }}
      data-testid={`editable-${path}`}
      data-rich-path={formatting ? path : undefined}
      data-empty={isEmpty || undefined}
      className={cn(
        className,
        // Block-level too, so the surrounding layout treats the field as
        // a real paragraph, not a stray inline span.
        'block w-full whitespace-pre-wrap rounded-sm cursor-text hover:bg-indigo-50/40 focus:outline-none focus:ring-2 focus:ring-indigo-300/50',
        // Empty state: muted placeholder text. See EditableText for why
        // this is a paper-palette zinc and not a theme token.
        isEmpty && 'text-zinc-500 italic'
      )}
    >
      {isEmpty ? (
        // `print:hidden` strips the placeholder from the printed
        // output. See EditableText for the rationale - this is the
        // textarea sibling of that same fix.
        <span
          className="print:hidden"
          data-testid={`editable-${path}-placeholder`}
        >
          {placeholder}
        </span>
      ) : (
        formatting ? (
          <RichText value={value} spans={spansFor(path)} />
        ) : (
          value
        )
      )}
    </div>
  );
}
