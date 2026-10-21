// @vitest-environment jsdom
/**
 * Interaction tests for the shared `EditableSection` /
 * `EditableNestedSection` helper — the add / remove / drag
 * affordances that **every** template uses.
 *
 * This is the highest-value place to spend a DOM harness: a single
 * helper backs Work, Projects, Education, Awards, Certificates,
 * Publications, Volunteer, References, and the nested `positions[]`
 * inside a Work entry, across all six templates. A regression here is
 * a regression everywhere.
 *
 * Why these live in `tests/interaction/` and not `tests/unit/`: see
 * the header in `./harness.tsx`. The bug that motivated the harness
 * was a remove button that rendered correctly and did nothing when
 * clicked — which `renderToStaticMarkup` cannot detect.
 */

import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import * as React from 'react';

import { EditableSection } from '@/components/resume-templates/editable-section';
import type { ResumeData } from '@/lib/resume-schema';
import { formValue, renderWithForm, user, type FormCapture } from './harness';

interface Row {
  label: string;
}

const SEED: Row[] = [{ label: 'first' }, { label: 'second' }, { label: 'third' }];

/** `reorderable={false}` keeps these focused on add/remove rather than
 *  dnd-kit's pointer-sensor drag, which needs its own simulation. */
function Section({ path = 'items' }: { path?: string }) {
  return (
    <EditableSection<Row>
      path={path}
      addLabel="Add item"
      testIdPrefix="items"
      defaultRow={{ label: '' }}
      reorderable={false}
    >
      {(i) => <span data-testid={`item-label-${i}`}>row-{i}</span>}
    </EditableSection>
  );
}

function mount(values: Record<string, unknown> = { items: SEED }) {
  return renderWithForm(values as unknown as ResumeData, <Section />);
}

const len = (c: FormCapture, path = 'items') => {
  const v = formValue(c, path);
  return Array.isArray(v) ? v.length : -1;
};

/**
 * The remove button lives INSIDE the row wrapper, and the wrapper
 * carries the `items-N` testid — so clicking `items-N` clicks the
 * wrapper, not the button. Scope to the row and pick the button by
 * its accessible name instead, which also pins the screen-reader
 * label (`aria-label="Remove item"`) rather than a private hook.
 */
const removeButtonIn = (rowIndex: number) =>
  within(screen.getByTestId(`items-${rowIndex}`)).getByRole('button', {
    name: 'Remove item'
  });

describe('EditableSection — add', () => {
  it('appends a row and grows the underlying array', async () => {
    const userSession = user();
    const { form } = mount();

    expect(len(form)).toBe(3);

    await userSession.click(screen.getByTestId('add-items'));

    expect(screen.queryAllByTestId('items-3')).toHaveLength(1);
    // The array RHF manages actually grew — the half a markup-only
    // assertion can never prove.
    expect(len(form)).toBe(4);
  });
});

describe('EditableSection — remove', () => {
  it('removes the clicked row and shrinks the array', async () => {
    const userSession = user();
    const { form } = mount();

    expect(screen.queryAllByTestId('items-2')).toHaveLength(1);

    await userSession.click(removeButtonIn(1));

    // Both halves matter. A remove that empties values without
    // shrinking the array — exactly the per-row `useFieldArray` bug
    // that shipped in Jake Round 5 — passes the DOM check and fails
    // the form check.
    expect(screen.queryAllByTestId('items-2')).toHaveLength(0);
    expect(len(form)).toBe(2);
    expect(formValue(form, 'items.0.label')).toBe('first');
    expect(formValue(form, 'items.1.label')).toBe('third');
  });

  it('removes the FIRST row without leaving a gap', async () => {
    const userSession = user();
    const { form } = mount();

    await userSession.click(removeButtonIn(0));

    expect(len(form)).toBe(2);
    // Index 0 must hold the old survivor, not a hole.
    expect(formValue(form, 'items.0.label')).toBe('second');
  });

  it('removes the LAST remaining row, leaving an empty array', async () => {
    const userSession = user();
    const { form } = mount({ items: [{ label: 'only' }] });

    await userSession.click(removeButtonIn(0));

    expect(len(form)).toBe(0);
    expect(screen.queryAllByTestId('items-0')).toHaveLength(0);
  });

  it('removes every row in sequence without leaking values', async () => {
    const userSession = user();
    const { form } = mount();

    await userSession.click(removeButtonIn(0));
    expect(len(form)).toBe(2);
    await userSession.click(removeButtonIn(0));
    expect(len(form)).toBe(1);
    await userSession.click(removeButtonIn(0));

    expect(len(form)).toBe(0);
    expect(screen.queryAllByTestId(/^items-\d+$/)).toHaveLength(0);
  });
});

describe('EditableSection — add then remove round-trips', () => {
  it('returns the array to its original contents', async () => {
    const userSession = user();
    const { form } = mount();

    await userSession.click(screen.getByTestId('add-items'));
    expect(len(form)).toBe(4);

    // Remove the row we just appended.
    await userSession.click(removeButtonIn(3));

    expect(len(form)).toBe(3);
    expect(formValue(form, 'items.0.label')).toBe('first');
    expect(formValue(form, 'items.1.label')).toBe('second');
    expect(formValue(form, 'items.2.label')).toBe('third');
  });
});