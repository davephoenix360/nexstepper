import { renderToStaticMarkup } from 'react-dom/server';
import { useForm, FormProvider } from 'react-hook-form';
import { describe, expect, it } from 'vitest';

import { EditableSection } from '@/components/resume-templates/editable-section';

/**
 * The "+ Add" and "✕ Remove" affordances.
 *
 * The user reported that on Modern / Executive / Creative / Minimal
 * templates, they could edit existing fields but could not ADD a new
 * work item, project, education entry, skill category, language, or
 * interest — and could not remove one either. Classic was the only
 * template that had these affordances. These tests pin the
 * EditableSection helper, now wired into every non-Classic template,
 * so any future regression of "no add/remove" fails CI.
 *
 * Rendered with `renderToStaticMarkup` (the repo's standard pattern,
 * see `print-button.test.tsx`) because the runner is `environment:
 * 'node'` with no jsdom. The helper renders through `useFieldArray` and
 * `useFormContext`, both of which work in SSR as long as a
 * FormProvider is in scope, so we wrap in a minimal FormProvider
 * harness. The append/remove wiring is asserted at the source level
 * rather than via event simulation, which the node environment can't
 * host.
 */

interface Row { id: string; name: string }

function Harness({
  rows,
  addLabel,
  testIdPrefix,
  defaultRow
}: {
  rows: Row[];
  addLabel: string;
  testIdPrefix: string;
  defaultRow: Row;
}) {
  const methods = useForm<{ rows: Row[] }>({ defaultValues: { rows } });
  return (
    <FormProvider {...methods}>
      <EditableSection
        path="rows"
        addLabel={addLabel}
        testIdPrefix={testIdPrefix}
        defaultRow={defaultRow}
      >
        {(i) => (
          <span data-testid={`row-${i}-name`}>
            {methods.getValues(`rows.${i}.name`)}
          </span>
        )}
      </EditableSection>
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
    // minus the leading "+ ").
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

describe('EditableSection passes through to useFieldArray', () => {
  // Source-level: useFieldArray's `append` and `remove` are what
  // the user-visible "+ Add" and "✕" ultimately call. We don't need
  // to retest react-hook-form; the contract is that the helper
  // wires them up with the supplied defaultRow and the row index.
  const src = require('node:fs').readFileSync(
    require('node:path').resolve(
      process.cwd(),
      'components/resume-templates/editable-section.tsx'
    ),
    'utf8'
  ) as string;

  it('calls useFieldArray on the supplied path', () => {
    expect(src).toMatch(/useFieldArray\(\s*\{ control, name: path \}\)/);
  });

  it('appends with the supplied defaultRow', () => {
    expect(src).toMatch(/append\(defaultRow as never\)/);
  });

  it('removes the row at the clicked index', () => {
    expect(src).toMatch(/onClick=\{\(\) => remove\(i\)\}/);
  });

  it('does not pass editable/readonly — those are the parent\'s job', () => {
    // The helper is only useful in the editor. The parent decides
    // when to mount it. The helper itself has no `editable` prop.
    expect(src).not.toMatch(/editable\?:/);
  });
});