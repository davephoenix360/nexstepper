/**
 * Tests for the Field* read-only-aware primitives. The contract is:
 *   - editable=true  → forwards to the editor's Editable* (RHF-bound)
 *   - editable=false → renders plain JSX directly from `data`, walking
 *                       the dotted path.
 *
 * We only test the read-only path here because the editable path is
 * covered by editable-text / keyword-chips / bullet-list tests. The
 * read-only path is the new code and the one most likely to drift.
 *
 * Renders via `renderToStaticMarkup` so we don't need a DOM. The
 * output HTML is asserted directly — same approach as
 * editable-text.test.tsx.
 */

import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import * as React from 'react';

import { Field, FieldArea, FieldBullets, FieldChips, read } from '@/components/resume-templates/field';
import type { ResumeData } from '@/lib/resume-schema';

const data = {
  template: 'modern',
  sections: {
    basics: {
      name: 'Alex Rivera',
      label: 'Staff Engineer',
      email: 'alex@example.com',
      phone: '',
      url: 'alex.dev',
      summary: 'A short summary.',
      location: {
        address: '',
        postalCode: '',
        city: 'SF',
        region: 'CA',
        countryCode: 'US'
      },
      profiles: []
    },
    work: [
      {
        company: 'Lumen Cloud',
        location: 'Remote',
        positions: [
          {
            title: 'Staff Engineer',
            startDate: '2022-04',
            endDate: '',
            highlights: ['Shipped X.', 'Owned Y.']
          }
        ]
      }
    ],
    skills: [{ name: 'Languages', keywords: ['TS', 'JS'] }],
    education: [],
    projects: [],
    volunteer: [],
    awards: [],
    certificates: [],
    publications: [],
    languages: [{ language: 'English', fluency: 'Native' }],
    interests: [],
    references: []
  }
} as unknown as ResumeData;

describe('read()', () => {
  it('walks dotted object paths', () => {
    expect(read(data, 'sections.basics.name')).toBe('Alex Rivera');
    expect(read(data, 'sections.basics.location.city')).toBe('SF');
  });

  it('resolves numeric segments as array indices', () => {
    expect(read(data, 'sections.work.0.company')).toBe('Lumen Cloud');
    expect(read(data, 'sections.work.0.positions.0.title')).toBe('Staff Engineer');
  });

  it('returns undefined for missing keys', () => {
    expect(read(data, 'sections.work.99.company')).toBeUndefined();
    expect(read(data, 'sections.basics.nope')).toBeUndefined();
  });

  it('returns undefined for null / undefined parents', () => {
    expect(read(null, 'x')).toBeUndefined();
    expect(read(data, 'sections.work.0.positions.99.highlights')).toBeUndefined();
  });
});

describe('<Field> read-only', () => {
  it('renders the value as a plain element when present', () => {
    const html = renderToStaticMarkup(
      React.createElement(Field, {
        mode: { editable: false, data },
        path: 'sections.basics.name'
      })
    );
    expect(html).toContain('Alex Rivera');
    // No placeholder styling class because there's a value.
    expect(html).not.toContain('text-zinc-400');
  });

  it('renders the placeholder (muted) when the value is empty', () => {
    const html = renderToStaticMarkup(
      React.createElement(Field, {
        mode: { editable: false, data },
        path: 'sections.basics.phone',
        placeholder: 'Phone'
      })
    );
    // Empty value → placeholder shown, plus the muted text class.
    expect(html).toContain('Phone');
    expect(html).toContain('text-zinc-400');
  });

  it('respects the `as` prop', () => {
    const html = renderToStaticMarkup(
      React.createElement(Field, {
        mode: { editable: false, data },
        path: 'sections.basics.name',
        as: 'h2'
      })
    );
    expect(html).toMatch(/<h2[^>]*>Alex Rivera<\/h2>/);
  });
});

describe('<FieldArea> read-only', () => {
  it('renders summary as a paragraph by default', () => {
    const html = renderToStaticMarkup(
      React.createElement(FieldArea, {
        mode: { editable: false, data },
        path: 'sections.basics.summary'
      })
    );
    expect(html).toMatch(/<p[^>]*>A short summary\.<\/p>/);
  });

  it('can render as a div when readOnlyAs is overridden', () => {
    const html = renderToStaticMarkup(
      React.createElement(FieldArea, {
        mode: { editable: false, data },
        path: 'sections.basics.summary',
        readOnlyAs: 'div'
      })
    );
    expect(html).toMatch(/<div[^>]*>A short summary\.<\/div>/);
  });
});

describe('<FieldBullets> read-only', () => {
  it('renders an array of highlights as <ul> / <li>', () => {
    const html = renderToStaticMarkup(
      React.createElement(FieldBullets, {
        mode: { editable: false, data },
        path: 'sections.work.0.positions.0.highlights'
      })
    );
    expect(html.match(/<li/g)?.length).toBe(2);
    expect(html).toContain('Shipped X.');
    expect(html).toContain('Owned Y.');
  });

  it('filters out empty / whitespace entries', () => {
    const dirty = {
      ...data,
      sections: {
        ...data.sections,
        work: [
          {
            ...data.sections.work[0],
            positions: [
              {
                ...data.sections.work[0].positions[0],
                highlights: ['Real one.', '', '   ', 'Second real one.']
              }
            ]
          }
        ]
      }
    } as unknown as ResumeData;
    const html = renderToStaticMarkup(
      React.createElement(FieldBullets, {
        mode: { editable: false, data: dirty },
        path: 'sections.work.0.positions.0.highlights'
      })
    );
    expect(html.match(/<li/g)?.length).toBe(2);
  });

  it('renders nothing when the array is empty', () => {
    const empty = {
      ...data,
      sections: {
        ...data.sections,
        work: [
          {
            ...data.sections.work[0],
            positions: [{ ...data.sections.work[0].positions[0], highlights: [] }]
          }
        ]
      }
    } as unknown as ResumeData;
    const html = renderToStaticMarkup(
      React.createElement(FieldBullets, {
        mode: { editable: false, data: empty },
        path: 'sections.work.0.positions.0.highlights'
      })
    );
    expect(html).toBe('');
  });
});

describe('<FieldChips> read-only', () => {
  it('renders an array of keywords as plain chips', () => {
    const html = renderToStaticMarkup(
      React.createElement(FieldChips, {
        mode: { editable: false, data },
        path: 'sections.skills.0.keywords'
      })
    );
    expect(html).toContain('TS');
    expect(html).toContain('JS');
    // No buttons in read-only mode — that's the editor's
    // add/remove affordance.
    expect(html).not.toMatch(/<button/);
  });

  it('shows an "Add keyword" placeholder when the array is empty', () => {
    const empty = {
      ...data,
      sections: {
        ...data.sections,
        skills: [{ name: 'Empty', keywords: [] }]
      }
    } as unknown as ResumeData;
    const html = renderToStaticMarkup(
      React.createElement(FieldChips, {
        mode: { editable: false, data: empty },
        path: 'sections.skills.0.keywords',
        placeholder: 'keyword'
      })
    );
    expect(html).toContain('Add keyword');
  });
});
