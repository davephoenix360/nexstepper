/**
 * Pure helpers for rendering react-hook-form + Zod validation errors as
 * a summary panel inside the editor.
 *
 * The shape we receive from `formState.errors` is a nested object that
 * mirrors the data tree (e.g. `{ sections: { basics: { url: { message,
 * type } } } }`). To display it as a flat "field path — message" list
 * we flatten it. The path is also humanized so users see something
 * more useful than `sections.work.0.company`.
 *
 * No React, no DOM — pure functions, easily testable.
 *
 * Exported because the future "open JSON editor" dialog will want to
 * reuse the same flattening when its own SchemaForm surfaces Zod
 * issues through RHF's error channel.
 */

import { humanize } from '@/components/schema-form/primitives';

/**
 * A single leaf error, ready to render in a <ul>.
 */
export interface FlatFormError {
  /** Dotted path into RHF form values (`sections.basics.url`). */
  path: string;
  /** Zod (or RHF) error message. */
  message: string;
}

/**
 * Walk a nested `FieldErrors` tree and emit one entry per leaf with a
 * `.message`. Skips nullish children and `ref`-only refs (those don't
 * carry user-readable errors).
 *
 * RHF can also surface `types` (multi-error) wrappers — when that
 * happens we take the first type's message to keep the list short.
 */
export function flattenFormErrors(
  errors: Record<string, unknown> | undefined | null,
  prefix = ''
): FlatFormError[] {
  if (!errors || typeof errors !== 'object') return [];

  const out: FlatFormError[] = [];

  for (const [key, val] of Object.entries(errors)) {
    if (val === undefined || val === null) continue;
    const path = prefix ? `${prefix}.${key}` : key;

    // Leaf shape: { message: string, type: string, ... }
    if (typeof val === 'object' && 'message' in val) {
      // A `message` property means this is a leaf — don't recurse
      // into its other fields (type, ref, etc. are scalar/handle,
      // not nested error subtrees). Emit if the message is usable;
      // otherwise skip silently.
      const m = (val as { message?: unknown }).message;
      if (typeof m === 'string' && m.length > 0) {
        out.push({ path, message: m });
      }
      continue;
    }

    // RHF multi-error wrapper: { types: { typeName: 'msg' } }
    if (
      typeof val === 'object' &&
      'types' in val &&
      typeof (val as { types?: unknown }).types === 'object'
    ) {
      // A `types` property means this is a leaf too — same
      // "don't recurse" rule as above. Pick the first string
      // message; if none, skip silently.
      const types = (val as { types: Record<string, unknown> }).types;
      const firstMsg = Object.values(types).find(
        (v) => typeof v === 'string'
      );
      if (typeof firstMsg === 'string') {
        out.push({ path, message: firstMsg });
      }
      continue;
    }

    // Otherwise it's a nested subtree — recurse.
    if (typeof val === 'object') {
      out.push(
        ...flattenFormErrors(val as Record<string, unknown>, path)
      );
    }
  }

  return out;
}

/**
 * Convert a dotted form path to a human-readable label.
 *
 *   sections.basics.url          -> "Basics › Url"
 *   sections.work.0.company      -> "Work › Company"
 *   sections.skills.0.keywords.1 -> "Skills › Keywords"
 *
 * Strips the leading `sections.` (it's redundant in a single-resume
 * editor) and drops numeric segments (array indices) so the label
 * describes the field, not its position.
 *
 * Falls back to the raw path if no humanize match produces something
 * more useful.
 */
export function humanizeFormPath(path: string): string {
  if (!path) return '';

  const cleaned = path.replace(/^sections\./, '');
  const segments = cleaned
    .split('.')
    .filter((s) => !/^\d+$/.test(s))
    .map((s) => humanize(s))
    .filter(Boolean);

  return segments.length > 0 ? segments.join(' › ') : path;
}