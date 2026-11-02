/**
 * @vitest-environment jsdom
 *
 * The formatting toolbar, and the gesture it collides with.
 *
 * ## The interaction under test
 *
 * The user drags across "Postgres" in a bullet. The toolbar appears.
 * They click **B**. The mark lands on exactly the dragged range — and
 * the text editor does NOT open, because a drag-selection ends with a
 * click event and the naive implementation would treat that click as
 * "the user wants to edit this field".
 *
 * That collision is the whole risk of this feature: get it wrong and
 * every selection immediately opens an editor, which feels broken on
 * first use.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FormProvider, useForm } from 'react-hook-form';

import { EditableText } from '@/components/editable/editable-text';
import { RichTextToolbar } from '@/components/rich-text/rich-text-toolbar';
import type { RichTextMap } from '@/lib/resume-schema';

const FIELD_PATH = 'sections.basics.summary';
const VALUE = 'Led the migration to Postgres';
/** Where 'Postgres' starts in VALUE. */
const START = 21;
const END = 29;

let lastFormatting: RichTextMap | undefined;

/**
 * The real editor field, inside a real form, with the real toolbar
 * mounted — so this exercises the whole path: the field renders its
 * value through RichText, carries `data-rich-path`, and the toolbar
 * writes the overlay back into the form.
 */
function Harness({ onFormat }: { onFormat: (map: RichTextMap) => void }) {
  const form = useForm({
    defaultValues: {
      sections: { basics: { summary: VALUE } },
      formatting: {}
    }
  });

  const formatting = (form.watch('formatting') ?? {}) as RichTextMap;
  onFormat(formatting);

  return (
    <FormProvider {...form}>
      <EditableText path={FIELD_PATH} />
      <RichTextToolbar />
    </FormProvider>
  );
}

/**
 * Drag-select "Postgres" inside the field, the way a mouse does.
 *
 * The text node is found by CONTENT, not by position: once the range is
 * bolded the field's DOM changes shape (the marked run becomes a
 * `<strong>` element), so "the first text node" is not a stable way to
 * find the word.
 */
function selectRange() {
  const field = screen.getByTestId(`editable-${FIELD_PATH}`);
  const walker = document.createTreeWalker(field, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode() as Text | null;
  let target: Text | null = null;
  while (node) {
    if (node.textContent?.includes('Postgres')) {
      target = node;
      break;
    }
    node = walker.nextNode() as Text | null;
  }
  if (!target) throw new Error('no text node containing "Postgres"');

  const offset = target.textContent?.indexOf('Postgres') ?? 0;
  const range = document.createRange();
  range.setStart(target, offset);
  range.setEnd(target, offset + 'Postgres'.length);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  fireEvent.mouseUp(document);
}

describe('the formatting toolbar', () => {
  beforeEach(() => {
    lastFormatting = undefined;
  });

  afterEach(() => {
    window.getSelection()?.removeAllRanges();
  });

  it('does not appear without a selection', () => {
    render(<Harness onFormat={(map) => (lastFormatting = map)} />);
    expect(screen.queryByTestId('rich-text-toolbar')).toBeNull();
  });

  it('appears when text is selected', async () => {
    render(<Harness onFormat={(map) => (lastFormatting = map)} />);
    selectRange();
    await waitFor(() => {
      expect(screen.getByTestId('rich-text-toolbar')).toBeTruthy();
    });
  });

  it('is never printed', async () => {
    render(<Harness onFormat={(map) => (lastFormatting = map)} />);
    selectRange();
    await waitFor(() => {
      expect(screen.getByTestId('rich-text-toolbar')).toBeTruthy();
    });
    expect(screen.getByTestId('rich-text-toolbar').className).toContain(
      'no-print'
    );
  });

  it('says that formatting does not change the score', async () => {
    render(<Harness onFormat={(map) => (lastFormatting = map)} />);
    selectRange();
    await waitFor(() => {
      expect(screen.getByTestId('rich-text-hint')).toBeTruthy();
    });
    expect(screen.getByTestId('rich-text-hint').textContent).toMatch(
      /change your ATS score/i
    );
  });

  it('applies bold to exactly the selected range', async () => {
    render(<Harness onFormat={(map) => (lastFormatting = map)} />);
    selectRange();
    await waitFor(() => {
      expect(screen.getByTestId('rich-text-toolbar')).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId('rich-text-bold'));

    await waitFor(() => {
      expect(lastFormatting?.[FIELD_PATH]).toHaveLength(1);
    });
    const span = lastFormatting?.[FIELD_PATH]?.[0];
    expect(span?.text).toBe('Postgres');
    expect(span?.start).toBe(START);
    expect(span?.marks).toEqual(['bold']);

    // And the rendered field now wraps exactly that range.
    const field = screen.getByTestId(`editable-${FIELD_PATH}`);
    const strong = field.querySelector('strong');
    expect(strong?.textContent).toBe('Postgres');
    expect(field.textContent).toBe(VALUE);
  });

  it('does NOT open the text editor when a selection is made', async () => {
    render(<Harness onFormat={(map) => (lastFormatting = map)} />);
    selectRange();
    await waitFor(() => {
      expect(screen.getByTestId('rich-text-toolbar')).toBeTruthy();
    });
    // The field is still in its idle render — no <input> appeared.
    expect(
      screen.queryByTestId(`editable-${FIELD_PATH}`)
    ).toBeTruthy();
    expect(
      document.querySelector(`input[data-testid="editable-${FIELD_PATH}"]`)
    ).toBeNull();
  });

  it('still opens the text editor on a plain click', async () => {
    render(<Harness onFormat={(map) => (lastFormatting = map)} />);
    const field = screen.getByTestId(`editable-${FIELD_PATH}`);
    // A plain click leaves the selection collapsed.
    fireEvent.click(field);
    await waitFor(() => {
      expect(
        document.querySelector(`input[data-testid="editable-${FIELD_PATH}"]`)
      ).toBeTruthy();
    });
  });

  it('removes the bold when the same range is marked again', async () => {
    render(<Harness onFormat={(map) => (lastFormatting = map)} />);
    selectRange();
    await waitFor(() => {
      expect(screen.getByTestId('rich-text-toolbar')).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId('rich-text-bold'));
    await waitFor(() => {
      expect(lastFormatting?.[FIELD_PATH]).toHaveLength(1);
    });

    // Re-select the same range and toggle it off.
    selectRange();
    await waitFor(() => {
      expect(screen.getByTestId('rich-text-toolbar')).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId('rich-text-bold'));

    await waitFor(() => {
      expect(lastFormatting?.[FIELD_PATH]).toBeUndefined();
    });
  });
});
