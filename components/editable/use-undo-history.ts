'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWatch, type Control } from 'react-hook-form';

/**
 * Undo / redo for the resume editor.
 *
 * ## Why the history lives in local storage
 *
 * The resume is JSON, and the history is JSON too. Putting it in
 * Postgres would mean a write per keystroke-ish change, a table to
 * migrate, and a GDPR surface for data the user has already asked us to
 * hold. The history is a transient editing aid — it belongs to the
 * browser session, not to the user's account. The DATABASE still holds
 * the document; only the ability to step back through it is local.
 *
 * ## Why one snapshot per committed change
 *
 * The editor commits a field on BLUR (`EditableText` keeps the draft in
 * local state and calls `field.onChange` on blur), so a text field is
 * one atomic change, not a stream of keystrokes. That makes the form
 * state itself the right granularity: a snapshot per distinct form
 * state, coalesced automatically because a half-typed field never
 * reaches the form.
 *
 * ## Why the snapshots are serialized strings
 *
 * Three reasons, all practical:
 *   - comparing states is a string compare, so "did anything change?"
 *     is exact rather than a deep-equality guess;
 *   - the local-storage shape is a plain array of strings, which is
 *     trivial to inspect and cheap to write;
 *   - restoring is `JSON.parse` + `form.reset`, with no need to keep a
 *     live object graph that might be mutated later.
 *
 * ## Interaction with the server
 *
 * When the server hands the editor new data (the AI chat wrote a
 * revision, or a save came back), the form is reset and the watch
 * fires. Because the new state differs from the last one, it is pushed
 * as a normal snapshot — so the user can UNDO an AI rewrite, which is
 * the case that matters most. A reset that changes nothing is a no-op
 * and pushes nothing.
 */

const STORAGE_PREFIX = 'nexstepper:history:';

/**
 * How many snapshots each stack holds.
 *
 * A resume is a few KB of JSON, so 50 entries is a couple of hundred
 * KB against a 5MB local-storage budget. Deep enough that nobody runs
 * out of undo, shallow enough that a long session cannot fill the
 * quota.
 */
export const MAX_HISTORY_ENTRIES = 50;

interface Stacks {
  /** States we can undo INTO, oldest first. */
  past: string[];
  /** States we can redo INTO, in order. */
  future: string[];
}

export interface UndoHistoryState {
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  /** Throw the history away (e.g. a different resume). */
  clear: () => void;
}

function storageKey(resumeId: string): string {
  return `${STORAGE_PREFIX}${resumeId}`;
}

function readStored(resumeId: string): Stacks {
  if (typeof window === 'undefined') return { past: [], future: [] };
  try {
    const raw = window.localStorage.getItem(storageKey(resumeId));
    if (!raw) return { past: [], future: [] };
    const parsed = JSON.parse(raw) as Partial<Stacks> & { v?: number };
    if (!parsed || parsed.v !== 1) return { past: [], future: [] };
    const past = Array.isArray(parsed.past)
      ? parsed.past.filter((s) => typeof s === 'string')
      : [];
    const future = Array.isArray(parsed.future)
      ? parsed.future.filter((s) => typeof s === 'string')
      : [];
    return { past, future };
  } catch {
    // A corrupt entry must not take the editor down.
    return { past: [], future: [] };
  }
}

function writeStored(resumeId: string, stacks: Stacks): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      storageKey(resumeId),
      JSON.stringify({ v: 1, past: stacks.past, future: stacks.future })
    );
  } catch {
    // Quota exceeded, or storage is disabled (private mode, blocked
    // cookies). Undo/redo still works in memory for this session; it
    // just will not survive a reload. Losing the history is much better
    // than losing the user's edits.
  }
}

export function useUndoHistory({
  resumeId,
  control,
  reset,
  enabled = true
}: {
  resumeId: string;
  /**
   * Only `control` is needed for watching — the same `any` boundary
   * `useDebouncedAutosave` uses, and for the same reason (RHF's
   * `Control<T>` is invariant in practice, and the editor's form is
   * built with `useForm({ resolver } as never)`).
   */
  control: any;
  /**
   * Restores a snapshot into the form. The editor passes
   * `form.reset`.
   */
  reset: (values: unknown) => void;
  /** Turn off while SSR or while a modal owns the same fields. */
  enabled?: boolean;
}): UndoHistoryState {
  const values = useWatch({ control }) as unknown;

  const serialized = useMemo(() => {
    try {
      return JSON.stringify(values ?? {});
    } catch {
      return '';
    }
  }, [values]);

  const pastRef = useRef<string[]>([]);
  const futureRef = useRef<string[]>([]);
  /** The state the form is in as far as the history is concerned. */
  const currentRef = useRef<string>(serialized);

  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const syncFlags = useCallback(() => {
    setCanUndo(pastRef.current.length > 0);
    setCanRedo(futureRef.current.length > 0);
  }, []);

  const persist = useCallback(() => {
    writeStored(resumeId, {
      past: pastRef.current,
      future: futureRef.current
    });
  }, [resumeId]);

  // Load the stored history once, on mount.
  useEffect(() => {
    const stored = readStored(resumeId);
    pastRef.current = stored.past;
    futureRef.current = stored.future;
    syncFlags();
  }, [resumeId, syncFlags]);

  // Record a snapshot whenever the form state actually changes.
  useEffect(() => {
    if (!enabled) return;
    if (!serialized) return;
    // Equal to the current state: nothing happened. This is also the
    // path an undo/redo takes, because `currentRef` is updated BEFORE
    // the form is reset — so restoring never records a new snapshot.
    if (serialized === currentRef.current) return;

    pastRef.current = [...pastRef.current, currentRef.current].slice(
      -MAX_HISTORY_ENTRIES
    );
    // A new change invalidates the redo stack — that is what every
    // editor does, and it is what makes redo predictable.
    futureRef.current = [];
    currentRef.current = serialized;

    syncFlags();
    persist();
  }, [serialized, enabled, syncFlags, persist]);

  const undo = useCallback(() => {
    const previous = pastRef.current.pop();
    if (previous === undefined) return;
    futureRef.current.unshift(currentRef.current);
    currentRef.current = previous;
    try {
      reset(JSON.parse(previous));
    } catch {
      // Unparseable snapshot: put the stacks back the way they were
      // rather than leaving the history inconsistent.
      pastRef.current.push(previous);
      futureRef.current.shift();
    }
    syncFlags();
    persist();
  }, [reset, syncFlags, persist]);

  const redo = useCallback(() => {
    const next = futureRef.current.shift();
    if (next === undefined) return;
    pastRef.current.push(currentRef.current);
    currentRef.current = next;
    try {
      reset(JSON.parse(next));
    } catch {
      pastRef.current.pop();
      futureRef.current.unshift(next);
    }
    syncFlags();
    persist();
  }, [reset, syncFlags, persist]);

  const clear = useCallback(() => {
    pastRef.current = [];
    futureRef.current = [];
    syncFlags();
    persist();
  }, [syncFlags, persist]);

  return { canUndo, canRedo, undo, redo, clear };
}

/**
 * Is this keyboard event one the editor should handle, or one the browser
 * should?
 *
 * Inside a text field, Ctrl+Z is the field's own undo — the user is
 * editing one word and expects the browser's behaviour. The editor only
 * takes over when focus is NOT in an editable element.
 */
export function isDocumentUndoTarget(
  target: EventTarget | null
): boolean {
  if (!target || typeof (target as HTMLElement).tagName !== 'string') {
    return true;
  }
  const el = target as HTMLElement;
  const tag = el.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return false;
  if (el.isContentEditable) return false;
  return true;
}

/** Ctrl/Cmd + Z — undo. */
export function isUndoShortcut(event: KeyboardEvent): boolean {
  if (!(event.ctrlKey || event.metaKey)) return false;
  if (event.altKey) return false;
  if (event.key !== 'z' && event.key !== 'Z') return false;
  // Shift+Z is redo, not undo.
  return !event.shiftKey;
}

/** Ctrl/Cmd + Shift + Z, or Ctrl + Y — redo. */
export function isRedoShortcut(event: KeyboardEvent): boolean {
  if (event.altKey) return false;
  if (event.shiftKey) {
    // Cmd+Shift+Z on Mac, Ctrl+Shift+Z on Windows and Linux — both are
    // the platform's own redo gesture.
    if (!event.ctrlKey && !event.metaKey) return false;
    return event.key === 'z' || event.key === 'Z';
  }
  if (event.ctrlKey && !event.metaKey) {
    return event.key === 'y' || event.key === 'Y';
  }
  return false;
}

/**
 * Listen for the undo/redo gestures at the document level.
 *
 * The listener lives on `document` (not `window`) for the same reason
 * the save shortcut's does — some browsers do not fire `keydown` on
 * `window` for input focused inside shadow DOM.
 *
 * The gesture is ignored while focus is inside a text field, so the
 * browser's own field-level undo keeps working: the user editing one
 * bullet expects Ctrl+Z to undo their typing, not to jump the whole
 * document back.
 */
export function useUndoRedoShortcuts({
  onUndo,
  onRedo,
  disabled = false
}: {
  onUndo: (event: KeyboardEvent) => void;
  onRedo: (event: KeyboardEvent) => void;
  /** Turn off while a save is in flight. */
  disabled?: boolean;
}): void {
  const onUndoRef = useRef(onUndo);
  const onRedoRef = useRef(onRedo);
  useEffect(() => {
    onUndoRef.current = onUndo;
    onRedoRef.current = onRedo;
  }, [onUndo, onRedo]);

  useEffect(() => {
    if (disabled) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (!isDocumentUndoTarget(event.target)) return;
      if (isUndoShortcut(event)) {
        event.preventDefault();
        onUndoRef.current(event);
        return;
      }
      if (isRedoShortcut(event)) {
        event.preventDefault();
        onRedoRef.current(event);
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [disabled]);
}
