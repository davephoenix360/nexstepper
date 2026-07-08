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
 * Inline edit-as-single-line. Click to focus, blur or Enter to commit,
 * Esc to roll back. See file header for the render-state contract.
 */
export function EditableText({
  path,
  className,
  editingClassName,
  placeholder = 'Click to add',
  as: Tag = 'span'
}: EditableTextProps) {
  const { field, error, value, hasValue } = useBoundValue(path);
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
    original.current = value;
    setDraft(value);
    setEditing(true);
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
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          startEdit();
        }
      }}
      data-testid={`editable-${path}`}
      data-empty={isEmpty || undefined}
      className={cn(
        className,
        // Inline-pointer + faint hover background to show the field is
        // clickable. Both no-op in print (hover doesn't fire, cursor
        // ignored).
        'cursor-text hover:bg-indigo-50/40 dark:hover:bg-indigo-900/30 rounded-sm focus:outline-none focus:ring-2 focus:ring-indigo-300/50',
        // Empty state: muted placeholder text.
        isEmpty && 'text-muted-foreground'
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
        value
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
  rows = 4
}: EditableTextareaProps) {
  const { field, error, value, hasValue } = useBoundValue(path);
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);
  const original = React.useRef(value);

  React.useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  function startEdit() {
    original.current = value;
    setDraft(value);
    setEditing(true);
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
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          startEdit();
        }
      }}
      data-testid={`editable-${path}`}
      data-empty={isEmpty || undefined}
      className={cn(
        className,
        // Block-level too, so the surrounding layout treats the field as
        // a real paragraph, not a stray inline span.
        'block w-full whitespace-pre-wrap rounded-sm cursor-text hover:bg-indigo-50/40 dark:hover:bg-indigo-900/30 focus:outline-none focus:ring-2 focus:ring-indigo-300/50',
        isEmpty && 'text-muted-foreground italic'
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
        value
      )}
    </div>
  );
}
