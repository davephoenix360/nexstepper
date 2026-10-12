import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { useForm, FormProvider } from 'react-hook-form';
import { describe, expect, it } from 'vitest';
import { DndContext } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';

import { EditableSection } from '@/components/resume-templates/editable-section';

/**
 * The "+ Add" / "✕ Remove" / drag-to-reorder affordances.
 *
 * The user reported that on Modern / Executive / Creative / Minimal
 * templates, they could edit existing fields but could not ADD a new
 * work item, project, education entry, skill category, language, or
 * interest — and could not remove one either. Classic was the only
 * template that had these affordances. These tests pin the
 * EditableSection helper, now wired into every non-Classic template,
 * so any future regression of "no add/remove" fails CI.
 *
 * The drag-to-reorder branch is also pinned here — at the markup
 * level (handle aria-label + no-print + section-level data-testid
 * preservation) and at the source level (useFieldArray.move is the
 * persistence call, NOT a separate write path).
 *
 * Rendered with `renderToStaticMarkup` (the repo's standard pattern,
 * see `print-button.test.tsx`) because the runner is `environment:
 * 'node'` with no jsdom. The helper renders through `useFieldArray`
 * and `useFormContext`, both of which work in SSR as long as a
 * FormProvider is in scope, so we wrap in a minimal FormProvider
 * harness. SortableRow needs a DndContext ancestor for `useSortable`
 * to resolve; we wrap the harness in one.
 *
 * The append/remove/move wiring is asserted at the source level
 * rather than via event simulation, which the node environment can't
 * host.
 */

interface Row { id: string; name: string }

function Harness({
  rows,
  addLabel,
  testIdPrefix,
  defaultRow,
  reorderable
}: {
  rows: Row[];
  addLabel: string;
  testIdPrefix: string;
  defaultRow: Row;
  reorderable?: boolean;
}) {
  const methods = useForm<{ rows: Row[] }>({ defaultValues: { rows } });
  return (
    <FormProvider {...methods}>
      <DndContext>
        <SortableContext items={rows.map((r) => r.id)}>
          <EditableSection
            path="rows"
            addLabel={addLabel}
            testIdPrefix={testIdPrefix}
            defaultRow={defaultRow}
            {...(reorderable !== undefined ? { reorderable } : {})}
          >
            {(i) => (
              <span data-testid={`row-${i}-name`}>
                {methods.getValues(`rows.${i}.name`)}
              </span>
            )}
          </EditableSection>
        </SortableContext>
      </DndContext>
    </FormProvider>
  );
}

const TWO_ROWS: Row[] = [
  { id: 'a', name: 'first' },
  { id: 'b', name: 'second' }
];

const EMPTY: Row = { id: '', name: '' };

describe('EditableSection renders one row per existing entry', () => {
  it('renders N rows for N initial entries', () => {
    const html = renderToStaticMarkup(
      <Harness
        rows={TWO_ROWS}
        addLabel="Add row"
        testIdPrefix="row"
        defaultRow={EMPTY}
      />
    );
    expect(html).toContain('row-0-name');
    expect(html).toContain('row-1-name');
    expect(html).toContain('first');
    expect(html).toContain('second');
    expect(html).not.toContain('row-2-name');
  });
});

describe('EditableSection chrome', () => {
  it('renders a "+ Add" button with the addLabel', () => {
    const html = renderToStaticMarkup(
      <Harness
        rows={TWO_ROWS}
        addLabel="Add experience"
        testIdPrefix="work-entry"
        defaultRow={EMPTY}
      />
    );
    // The Button primitive renders a <button> with the addLabel text
    // and a data-testid from the helper.
    expect(html).toContain('Add experience');
    expect(html).toContain('data-testid="add-work-entry"');
  });

  it('hides the "+ Add" button from print', () => {
    // The Add button is editor chrome; the PDF must not print it.
    const html = renderToStaticMarkup(
      <Harness
        rows={TWO_ROWS}
        addLabel="Add"
        testIdPrefix="row"
        defaultRow={EMPTY}
      />
    );
    // Find the button tag that owns data-testid="add-row" and check
    // its class attribute. (renderToStaticMarkup emits the attribute
    // list in implementation-defined order, so the safest shape is
    // to grab the whole opening tag and assert on it.)
    const idx = html.indexOf('data-testid="add-row"');
    expect(idx).toBeGreaterThan(0);
    const tagEnd = html.indexOf('>', idx);
    const tagStart = html.lastIndexOf('<button', tagEnd);
    const tag = html.slice(tagStart, tagEnd);
    expect(tag).toContain('no-print');
  });

  it('renders a ✕ remove button per row with a descriptive aria-label', () => {
    const html = renderToStaticMarkup(
      <Harness
        rows={TWO_ROWS}
        addLabel="Add experience"
        testIdPrefix="work-entry"
        defaultRow={EMPTY}
      />
    );
    // One button per row, labelled "Remove experience" (the addLabel
    // minus the leading "+ " or "Add ").
    const matches = html.match(/aria-label="Remove experience"/g) ?? [];
    expect(matches).toHaveLength(2);
  });

  it('hides the ✕ remove buttons from print', () => {
    const html = renderToStaticMarkup(
      <Harness
        rows={TWO_ROWS}
        addLabel="Add experience"
        testIdPrefix="work-entry"
        defaultRow={EMPTY}
      />
    );
    // Each ✕ button: slice its full opening tag, check it includes
    // no-print. The lastIndexOf trick picks up the most recent <button
    // before the tag's `>`, which is this button (none of them nest).
    for (const match of html.matchAll(/aria-label="Remove experience"/g)) {
      const idx = match.index!;
      const tagEnd = html.indexOf('>', idx);
      const tagStart = html.lastIndexOf('<button', tagEnd);
      const tag = html.slice(tagStart, tagEnd);
      expect(tag).toContain('no-print');
    }
  });
});

describe('EditableSection drag-to-reorder affordances', () => {
  it('renders a drag handle per row with a descriptive aria-label', () => {
    const html = renderToStaticMarkup(
      <Harness
        rows={TWO_ROWS}
        addLabel="Add experience"
        testIdPrefix="work-entry"
        defaultRow={EMPTY}
      />
    );
    // One handle per row, labelled "Drag to reorder experience".
    const matches =
      html.match(/aria-label="Drag to reorder experience"/g) ?? [];
    expect(matches).toHaveLength(2);
  });

  it('hides the drag handles from print via no-print on the handle button', () => {
    const html = renderToStaticMarkup(
      <Harness
        rows={TWO_ROWS}
        addLabel="Add experience"
        testIdPrefix="work-entry"
        defaultRow={EMPTY}
      />
    );
    for (const match of html.matchAll(
      /aria-label="Drag to reorder experience"/g
    )) {
      const idx = match.index!;
      const tagEnd = html.indexOf('>', idx);
      const tagStart = html.lastIndexOf('<button', tagEnd);
      const tag = html.slice(tagStart, tagEnd);
      expect(tag).toContain('no-print');
    }
  });

  it('preserves the existing per-row data-testid', () => {
    // The row-level data-testid is the same one tests have always
    // asserted on (`work-entry-0`, `work-entry-1`). Reordering
    // would break any external test that slices markup by this id
    // if we changed it. We pin that we kept it.
    const html = renderToStaticMarkup(
      <Harness
        rows={TWO_ROWS}
        addLabel="Add experience"
        testIdPrefix="work-entry"
        defaultRow={EMPTY}
      />
    );
    expect(html).toContain('data-testid="work-entry-0"');
    expect(html).toContain('data-testid="work-entry-1"');
  });
});

describe('EditableSection reorderable={false} opt-out', () => {
  it('renders NO drag handles when reorderable is false', () => {
    const html = renderToStaticMarkup(
      <Harness
        rows={TWO_ROWS}
        addLabel="Add experience"
        testIdPrefix="work-entry"
        defaultRow={EMPTY}
        reorderable={false}
      />
    );
    expect(html).not.toMatch(/aria-label="Drag to reorder/);
    // No sortable handle data-testid either.
    expect(html).not.toMatch(/data-testid="sortable-handle-/);
  });

  it('still renders the + Add and ✕ Remove affordances when reorderable is false', () => {
    const html = renderToStaticMarkup(
      <Harness
        rows={TWO_ROWS}
        addLabel="Add experience"
        testIdPrefix="work-entry"
        defaultRow={EMPTY}
        reorderable={false}
      />
    );
    expect(html).toContain('Add experience');
    expect(html).toContain('aria-label="Remove experience"');
  });

  it('preserves per-row data-testid even when reorderable is false', () => {
    const html = renderToStaticMarkup(
      <Harness
        rows={TWO_ROWS}
        addLabel="Add experience"
        testIdPrefix="work-entry"
        defaultRow={EMPTY}
        reorderable={false}
      />
    );
    expect(html).toContain('data-testid="work-entry-0"');
    expect(html).toContain('data-testid="work-entry-1"');
  });
});

describe('EditableSection passes through to useFieldArray', () => {
  // Source-level: useFieldArray's `append`, `remove`, and `move` are
  // what the user-visible "+ Add" / "✕" / drag-to-reorder ultimately
  // call. We don't need to retest react-hook-form; the contract is
  // that the helper wires them up with the supplied defaultRow and
  // the row index.
  const src = require('node:fs').readFileSync(
    require('node:path').resolve(
      process.cwd(),
      'components/resume-templates/editable-section.tsx'
    ),
    'utf8'
  ) as string;

  it('calls useFieldArray with the supplied control + path', () => {
    // The destructuring contract is `const { ... } = useFieldArray(...)`.
    // The exact whitespace inside the argument object varies with
    // prettier config, so the contract is checked by extracting the
    // argument and asserting on its two named fields.
    const call = src.match(/useFieldArray\([\s\S]*?\)\s*;/);
    expect(call, 'useFieldArray(...) call exists').toBeTruthy();
    expect(call![0]).toMatch(/control/);
    expect(call![0]).toMatch(/name:\s*path/);
  });

  it('appends with the supplied defaultRow', () => {
    expect(src).toMatch(/append\(defaultRow as never\)/);
  });

  it('removes the row at the clicked index', () => {
    expect(src).toMatch(/onClick=\{\(\) => remove\(i\)\}/);
  });

  it('persists reorders via useFieldArray.move on drag-end', () => {
    // The persisted action is `move(oldIndex, newIndex)` — the same
    // call dnd-kit's official React Hook Form example recommends,
    // because RHF keeps per-row `id` stable across moves.
    expect(src).toMatch(/move\(oldIndex, newIndex\)/);
  });

  it('short-circuits when active and over ids match (drop on same row)', () => {
    // A no-op drop still fires onDragEnd; without the guard we'd
    // call move(x, x), which RHF silently accepts but is wasteful.
    expect(src).toMatch(/active\.id === over\.id/);
  });

  it('does not pass editable/readonly — those are the parent\'s job', () => {
    // The helper is only useful in the editor. The parent decides
    // when to mount it. The helper itself has no `editable` prop.
    expect(src).not.toMatch(/editable\?:/);
  });
});
