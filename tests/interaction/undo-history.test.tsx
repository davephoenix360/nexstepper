/**
 * @vitest-environment jsdom
 *
 * Tests for the editor's undo / redo history.
 *
 * ## What this pins
 *
 *   1. One committed change = one snapshot. The editor commits a field
 *      on blur, so the form state IS the right granularity; a
 *      half-typed field never reaches the form.
 *   2. Undo restores the previous state; redo goes forward; a NEW
 *      change clears the redo stack (what every editor does).
 *   3. The history lives in LOCAL STORAGE, not the database. It is a
 *      transient editing aid over a JSON document; the resume itself is
 *      still saved to Postgres exactly as before.
 *   4. The gesture is ignored inside a text field, so the browser's own
 *      field-level undo keeps working while the user is typing.
 *   5. A corrupt stored entry must not take the editor down.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useForm } from 'react-hook-form';

import {
  isDocumentUndoTarget,
  isRedoShortcut,
  isUndoShortcut,
  MAX_HISTORY_ENTRIES,
  useUndoHistory
} from '@/components/editable/use-undo-history';

type Doc = { summary: string; roles: number };

function makeDoc(summary: string, roles = 1): Doc {
  return { summary, roles };
}

function setup(initial: Doc) {
  const reset = vi.fn();
  const { result } = renderHook(
    () => {
      const form = useForm<Doc>({ defaultValues: initial, mode: 'onSubmit' });
      const history = useUndoHistory({
        resumeId: 'resume-1',
        control: form.control as never,
        reset: (values) => {
          reset(values);
          form.reset(values as Doc);
        }
      });
      return { form, history, reset };
    },
    { wrapper: ({ children }) => children }
  );
  return { result, reset };
}

describe('useUndoHistory', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it('starts with nothing to undo or redo', () => {
    const { result } = setup(makeDoc('one'));
    expect(result.current.history.canUndo).toBe(false);
    expect(result.current.history.canRedo).toBe(false);
  });

  it('records a snapshot when the document changes', async () => {
    const { result } = setup(makeDoc('one'));

    await act(async () => {
      result.current.form.setValue('summary', 'two', { shouldDirty: true });
    });

    expect(result.current.history.canUndo).toBe(true);
  });

  it('undo restores the previous state and redo goes forward', async () => {
    const { result, reset } = setup(makeDoc('one'));

    await act(async () => {
      result.current.form.setValue('summary', 'two', { shouldDirty: true });
    });
    await act(async () => {
      result.current.form.setValue('summary', 'three', { shouldDirty: true });
    });

    act(() => {
      result.current.history.undo();
    });
    expect(reset).toHaveBeenLastCalledWith(expect.objectContaining({ summary: 'two' }));
    expect(result.current.history.canRedo).toBe(true);

    act(() => {
      result.current.history.redo();
    });
    expect(
      reset
    ).toHaveBeenLastCalledWith(expect.objectContaining({ summary: 'three' }));
  });

  it('a new change clears the redo stack', async () => {
    const { result } = setup(makeDoc('one'));

    await act(async () => {
      result.current.form.setValue('summary', 'two', { shouldDirty: true });
    });
    act(() => {
      result.current.history.undo();
    });
    expect(result.current.history.canRedo).toBe(true);

    await act(async () => {
      result.current.form.setValue('summary', 'other', { shouldDirty: true });
    });
    expect(result.current.history.canRedo).toBe(false);
  });

  it('undo does not record a snapshot of its own', async () => {
    const { result } = setup(makeDoc('one'));

    await act(async () => {
      result.current.form.setValue('summary', 'two', { shouldDirty: true });
    });
    act(() => {
      result.current.history.undo();
    });
    // Undo consumed the one snapshot; it did not push another.
    expect(result.current.history.canUndo).toBe(false);
  });

  it('persists the history to local storage, not the database', async () => {
    const { result } = setup(makeDoc('one'));

    await act(async () => {
      result.current.form.setValue('summary', 'two', { shouldDirty: true });
    });

    const raw = window.localStorage.getItem('nexstepper:history:resume-1');
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!) as { v: number; past: string[] };
    expect(parsed.v).toBe(1);
    expect(parsed.past).toHaveLength(1);
    expect(JSON.parse(parsed.past[0]!).summary).toBe('one');
  });

  it('restores a stored history on mount', async () => {
    // Simulate a previous session: one snapshot of "one" in `past`.
    window.localStorage.setItem(
      'nexstepper:history:resume-1',
      JSON.stringify({
        v: 1,
        past: [JSON.stringify(makeDoc('one'))],
        future: []
      })
    );

    const { result, reset } = setup(makeDoc('two'));

    expect(result.current.history.canUndo).toBe(true);
    act(() => {
      result.current.history.undo();
    });
    expect(
      reset
    ).toHaveBeenLastCalledWith(expect.objectContaining({ summary: 'one' }));
  });

  it('ignores a corrupt stored entry instead of failing', () => {
    window.localStorage.setItem('nexstepper:history:resume-1', 'not json');
    const { result } = setup(makeDoc('one'));
    expect(result.current.history.canUndo).toBe(false);
  });

  it('ignores a stored entry from a different schema version', () => {
    window.localStorage.setItem(
      'nexstepper:history:resume-1',
      JSON.stringify({ v: 99, past: ['{}'], future: [] })
    );
    const { result } = setup(makeDoc('one'));
    expect(result.current.history.canUndo).toBe(false);
  });

  it('caps the history so a long session cannot fill the quota', async () => {
    const { result } = setup(makeDoc('start'));

    for (let i = 0; i < MAX_HISTORY_ENTRIES + 10; i++) {
      await act(async () => {
        result.current.form.setValue('summary', `v${i}`, { shouldDirty: true });
      });
    }

    const raw = window.localStorage.getItem('nexstepper:history:resume-1')!;
    const parsed = JSON.parse(raw) as { past: string[] };
    expect(parsed.past.length).toBe(MAX_HISTORY_ENTRIES);
  });
});

describe('the shortcut predicates', () => {
  const key = (init: Partial<KeyboardEventInit>) =>
    ({ key: 'z', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...init }) as KeyboardEvent;

  it('recognises undo', () => {
    expect(isUndoShortcut(key({ ctrlKey: true }))).toBe(true);
    expect(isUndoShortcut(key({ metaKey: true }))).toBe(true);
    expect(isUndoShortcut(key({ key: 'Z', ctrlKey: true }))).toBe(true);
  });

  it('does not treat redo as undo', () => {
    expect(isUndoShortcut(key({ ctrlKey: true, shiftKey: true }))).toBe(false);
    expect(isUndoShortcut(key({ ctrlKey: true, key: 'y' }))).toBe(false);
    expect(isUndoShortcut(key({ key: 'z' }))).toBe(false);
  });

  it('recognises redo', () => {
    expect(isRedoShortcut(key({ ctrlKey: true, shiftKey: true }))).toBe(true);
    expect(isRedoShortcut(key({ metaKey: true, shiftKey: true }))).toBe(true);
    expect(isRedoShortcut(key({ ctrlKey: true, key: 'y' }))).toBe(true);
    expect(isRedoShortcut(key({ ctrlKey: true }))).toBe(false);
  });

  it('leaves the gesture to the browser inside a text field', () => {
    const input = document.createElement('input');
    const textarea = document.createElement('textarea');
    const div = document.createElement('div');
    expect(isDocumentUndoTarget(input)).toBe(false);
    expect(isDocumentUndoTarget(textarea)).toBe(false);
    expect(isDocumentUndoTarget(div)).toBe(true);
    expect(isDocumentUndoTarget(null)).toBe(true);
  });
});
