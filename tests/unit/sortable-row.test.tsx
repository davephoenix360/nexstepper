import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DndContext } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';

import { SortableRow } from '@/components/resume-templates/sortable-row';

/**
 * SortableRow tests.
 *
 * `useSortable` requires a `DndContext` + `SortableContext` ancestor
 * (the same setup EditableSection wraps it in). Each test renders
 * exactly one row and slices the resulting markup.
 *
 * The runner is `environment: 'node'` with no jsdom
 * (see `print-button.test.tsx` for the discipline), so we don't
 * simulate a drag — the contract is verified at the markup level:
 * aria, no-print, dnd-kit's own a11y signal, data-testid, and the
 * wrapper's allow-or-deny-no-print placement.
 */

function WithContext({
  id,
  ariaLabel,
  className,
  dataTestId
}: {
  id: string;
  ariaLabel: string;
  className?: string;
  dataTestId?: string;
}) {
  return (
    <DndContext>
      <SortableContext items={[id]}>
        <SortableRow
          id={id}
          ariaLabel={ariaLabel}
          {...(className !== undefined ? { className } : {})}
          {...(dataTestId !== undefined ? { dataTestId } : {})}
        >
          <span data-testid="row-content">hello</span>
        </SortableRow>
      </SortableContext>
    </DndContext>
  );
}

describe('SortableRow — drag handle', () => {
  it('renders a button with the supplied aria-label', () => {
    const html = renderToStaticMarkup(
      <WithContext
        id="row-1"
        ariaLabel="Drag to reorder experience"
      />
    );
    expect(html).toContain('aria-label="Drag to reorder experience"');
    expect(html).toContain('data-testid="sortable-handle-row-1"');
  });

  it('hides the drag handle from print via no-print on the button', () => {
    const html = renderToStaticMarkup(
      <WithContext id="row-1" ariaLabel="Drag to reorder" />
    );
    // Slice the handle button opening tag and confirm `no-print`.
    const idx = html.indexOf('data-testid="sortable-handle-row-1"');
    expect(idx).toBeGreaterThan(0);
    const tagEnd = html.indexOf('>', idx);
    const tagStart = html.lastIndexOf('<button', tagEnd);
    const tag = html.slice(tagStart, tagEnd);
    expect(tag).toContain('no-print');
  });

  it('renders the lucide GripVertical icon glyph in the handle', () => {
    const html = renderToStaticMarkup(
      <WithContext id="row-1" ariaLabel="Drag to reorder" />
    );
    // lucide-react's GripVertical renders an SVG carrying the
    // `lucide-grip-vertical` class on the inner element (the
    // exact name has been stable across recent versions).
    expect(html).toMatch(/lucide-grip-vertical|class="lucide[^"]*grip[^"]*"/);
  });
});

describe('SortableRow — wrapper div', () => {
  it('sets the default data-testid to sortable-row-{id}', () => {
    const html = renderToStaticMarkup(
      <WithContext id="abc-123" ariaLabel="Drag" />
    );
    expect(html).toContain('data-testid="sortable-row-abc-123"');
  });

  it('accepts a custom dataTestId when supplied', () => {
    const html = renderToStaticMarkup(
      <WithContext
        id="abc-123"
        ariaLabel="Drag"
        dataTestId="custom-row-test"
      />
    );
    expect(html).toContain('data-testid="custom-row-test"');
    // Default data-testid does NOT appear when a custom one is supplied.
    expect(html).not.toContain('data-testid="sortable-row-abc-123"');
  });

  it('does NOT carry no-print on the wrapper div', () => {
    const html = renderToStaticMarkup(
      <WithContext id="row-1" ariaLabel="Drag" />
    );
    const idx = html.indexOf('data-testid="sortable-row-row-1"');
    expect(idx).toBeGreaterThan(0);
    const tagEnd = html.indexOf('>', idx);
    const tagStart = html.lastIndexOf('<div', tagEnd);
    const tag = html.slice(tagStart, tagEnd);
    // The wrapper itself must print as a normal resume row — only
    // the handle is editor chrome.
    expect(tag).not.toContain('no-print');
  });

  it('renders children inside the wrapper', () => {
    const html = renderToStaticMarkup(
      <WithContext id="row-1" ariaLabel="Drag" />
    );
    expect(html).toContain('data-testid="row-content"');
    expect(html).toContain('hello');
  });

  it('forwards className to the wrapper', () => {
    const html = renderToStaticMarkup(
      <WithContext
        id="row-1"
        ariaLabel="Drag"
        className="my-row my-row--decorated"
      />
    );
    expect(html).toContain('class="my-row my-row--decorated');
  });
});

describe('SortableRow — dnd-kit a11y wiring', () => {
  it('sets aria-roledescription="sortable" on the wrapper', () => {
    // dnd-kit's useSortable.attributes injects this attribute on the
    // wrapper. Screen readers announce it as "sortable" rather than
    // guessing from the element type. We verify it's wired so a
    // future dnd-kit major doesn't silently drop it.
    const html = renderToStaticMarkup(
      <WithContext id="row-1" ariaLabel="Drag" />
    );
    const idx = html.indexOf('data-testid="sortable-row-row-1"');
    expect(idx).toBeGreaterThan(0);
    const tagEnd = html.indexOf('>', idx);
    const tagStart = html.lastIndexOf('<div', tagEnd);
    const tag = html.slice(tagStart, tagEnd);
    expect(tag).toMatch(/aria-roledescription="sortable"/);
  });
});
