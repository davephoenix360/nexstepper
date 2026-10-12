import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { FieldChips } from '@/components/resume-templates/field';
import type { ResumeData } from '@/lib/resume-schema';

/**
 * Skills rendering: the comma-list fix.
 *
 * ## What the user reported
 *
 * In the shared/preview view the Skills section wrapped badly — a long
 * category ("Technologies/Frameworks", "Relevant Coursework") wrapped
 * inside its own flex item while the keyword run wrapped independently,
 * so the em-dash ended up sitting on the same line as the tail of the
 * label. The rows looked ragged and misaligned.
 *
 * Two independent defects:
 *
 *  1. `flex gap-2` per ROW meant every row sized its own columns, so
 *     columns could never line up across rows. Fixed by making the
 *     whole list ONE two-column grid.
 *  2. The read-only `FieldChips` rendered boxed pills. A resume is not
 *     a UI; pills read as chrome and waste vertical space. Now a plain
 *     comma-separated run, with Creative opting back in because its
 *     accent chips are part of that template's identity.
 */

const CLASSIC = readFileSync(
  resolve(process.cwd(), 'components/resume-templates/classic.tsx'),
  'utf8'
);
const CHIPS = readFileSync(
  resolve(process.cwd(), 'components/editable/keyword-chips.tsx'),
  'utf8'
);
const CREATIVE = readFileSync(
  resolve(process.cwd(), 'components/resume-templates/creative.tsx'),
  'utf8'
);

/** The exact shape from the reported screenshot. */
const DATA = {
  sections: {
    skills: [
      {
        name: 'Languages',
        level: '',
        keywords: ['HTML', 'CSS', 'JavaScript', 'Typescript', 'Python']
      },
      {
        name: 'Technologies/Frameworks',
        level: '',
        keywords: ['React', 'Next.js', 'Flask', 'WordPress']
      },
      {
        name: 'Relevant Coursework',
        level: '',
        keywords: ['Android Development', 'Operating Systems']
      }
    ]
  }
} as unknown as ResumeData;

describe('Classic read-only skill rows align', () => {
  it('uses a single grid for the whole list, not a flex row per entry', () => {
    // A per-row flex gave every row independent column widths — the
    // direct cause of the ragged wrapping the user screenshotted.
    expect(CLASSIC).not.toMatch(/className="flex gap-2 text-\[11pt\]"/);
    expect(CLASSIC).toMatch(
      /grid grid-cols-\[minmax\(0,9\.5rem\)_1fr\] items-baseline/
    );
  });

  it('applies the grid to skills, languages AND interests', () => {
    // Same defect existed in all three; fixing only the one the user
    // happened to screenshot would leave the others looking wrong.
    const gridCount = (
      CLASSIC.match(/grid grid-cols-\[minmax\(0,9\.5rem\)_1fr\]/g) ?? []
    ).length;
    expect(gridCount).toBe(3);
  });

  it('keeps the em-dash inside the value cell only', () => {
    // The em-dash lives in the second grid cell, so it can never ride
    // up next to the tail of a wrapped label.
    expect(CLASSIC).toMatch(/`— \$\{s\.keywords\.join\(", "\)\}`/);
  });

  it('emits an empty value cell rather than dropping the column', () => {
    // Dropping the span entirely would shift every later row's columns.
    expect(CLASSIC).toMatch(/\?\s*`— \$\{s\.keywords\.join\(", "\)\}`\s*:\s*""/);
  });
});

describe('FieldChips read-only defaults to a comma list', () => {
  const mode = { editable: false, data: DATA };
  const html = renderToStaticMarkup(
    <FieldChips mode={mode} path="sections.skills.0.keywords" />
  );

  it('renders comma-separated text', () => {
    expect(html).toContain('HTML, CSS, JavaScript, Typescript, Python');
  });

  it('does not render pill chrome', () => {
    expect(html).not.toContain('rounded-md');
    expect(html).not.toContain('border-zinc-200');
    expect(html).not.toContain('bg-zinc-50');
    expect(html).not.toContain('inline-flex flex-wrap');
  });

  it('emits no per-item wrappers at all', () => {
    // One <span>, plain text inside — nothing for print CSS to strip.
    expect((html.match(/<span/g) ?? []).length).toBeLessThanOrEqual(2);
  });
});

describe('FieldChips chips variant is opt-in', () => {
  const mode = { editable: false, data: DATA };
  const html = renderToStaticMarkup(
    <FieldChips
      mode={mode}
      path="sections.skills.0.keywords"
      variant="chips"
    />
  );

  it('still renders boxed pills when a template asks for them', () => {
    expect(html).toContain('rounded-md');
    expect(html).toContain('inline-flex flex-wrap');
  });

  it('Creative opts in, keeping its accent-coloured identity', () => {
    const optIns = (CREATIVE.match(/variant="chips"/g) ?? []).length;
    expect(optIns).toBe(2);
    expect(CREATIVE).toMatch(/var\(--accent-/);
  });
});

describe('editor chips read as the resume they print', () => {
  it('drops the box, border and background', () => {
    expect(CHIPS).not.toMatch(/rounded-md border border-zinc-300 bg-zinc-100/);
  });

  it('separates entries with a real comma', () => {
    expect(CHIPS).toMatch(/\{!isLast && <span aria-hidden="true">,<\/span>\}/);
  });

  it('never emits a trailing comma', () => {
    expect(CHIPS).toMatch(/isLast/);
    expect(CHIPS).toMatch(/isLast=\{i === fields\.length - 1\}/);
  });

  it('keeps click-to-edit and hover-to-remove', () => {
    // The whole point of not flattening these to static text: the box
    // was cosmetic, the affordance is functional.
    expect(CHIPS).toMatch(/onClick=\{onRemove\}/);
    expect(CHIPS).toMatch(/aria-label="Remove"/);
    expect(CHIPS).toMatch(/<EditableText/);
  });

  it('keeps a discoverable hover target now the box is gone', () => {
    expect(CHIPS).toMatch(/hover:bg-zinc-100/);
  });

  it('hides only the remove button from print, never the comma', () => {
    const comma = CHIPS.match(
      /\{!isLast && <span[^>]*>,\s*<\/span>\}/
    )?.[0];
    expect(comma).toBeDefined();
    // The ✕ is an editing affordance and disappears in the PDF...
    expect(comma).not.toContain('no-print');
    // ...but the comma has to survive into the PDF, which is the entire
    // point of the change. Losing it would silently rejoin the keywords.
    expect(CHIPS).toMatch(/no-print[\s\S]{0,400}<X\b/);
  });
});