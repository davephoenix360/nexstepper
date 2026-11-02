/**
 * The READ-ONLY render path must show the marks.
 *
 * The editor renders a marked field through `<RichText>`; the preview
 * page, the public share link and the printed PDF render the SAME
 * resume through the `Field*` helpers and `ClassicReadOnly`. If those
 * two surfaces disagree about what a marked line looks like, the user
 * bolds a skill in the editor and the PDF shows plain text — the exact
 * "two surfaces, two numbers" failure this codebase keeps fixing.
 *
 * So the contract pinned here is:
 *
 *   1. A field WITH a span renders the mark (`<strong>` / `<em>` /
 *      `<u>`) around EXACTLY the marked text.
 *   2. A field WITHOUT a span renders the pre-feature shape: the
 *      value is a plain text node, with no wrapper element and no
 *      extra span. The DOM of an unmarked resume is unchanged by the
 *      formatting feature.
 *   3. A list item's path is the list path plus its index, so a mark
 *      on bullet 2 lands on bullet 2 — even when an earlier bullet is
 *      empty and filtered out of the render.
 *   4. Punctuation the TEMPLATE adds around a value (", ", "GPA: ",
 *      "Minor: ", the quotes around a reference) is not part of the
 *      stored value, so it stays outside the marked run — otherwise
 *      every offset shifts and the wrong words get bolded.
 *
 * Rendered with `renderToStaticMarkup` (no DOM needed), the same
 * approach `tests/unit/field.test.tsx` uses.
 */

import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import * as React from 'react';

import {
  Field,
  FieldBullets,
  FieldChips
} from '@/components/resume-templates/field';
import { ClassicReadOnly } from '@/components/resume-templates/classic-readonly';
import { blankResumeData } from '@/lib/resume-schema';
import type { ResumeData } from '@/lib/resume-schema';
import type { RichSpan, RichTextMap } from '@/lib/resume-schema/rich-text';

/* -------------------------------------------------------------------------- */
/*  Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

/** A resume with one work entry, one skill group and one project. */
function fixture(): ResumeData {
  const base = blankResumeData();
  return {
    ...base,
    sections: {
      ...base.sections,
      basics: {
        ...base.sections.basics,
        name: 'Alex Rivera',
        label: 'Staff Engineer',
        email: 'alex@example.com',
        phone: '',
        url: 'alex.dev',
        summary: 'Builds things that ship.'
      },
      work: [
        {
          company: 'Lumen Cloud',
          location: 'Remote',
          description: 'Platform team.',
          url: '',
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
      projects: [
        {
          name: 'Nextep',
          description: 'A resume builder.',
          highlights: ['Broke the build.'],
          keywords: ['React', 'TypeScript'],
          startDate: '',
          endDate: '',
          url: '',
          roles: []
        }
      ],
      skills: [{ name: 'Languages', level: '', keywords: ['TS', 'JS'] }],
      education: [
        {
          institution: 'MIT',
          url: '',
          location: 'Cambridge, MA',
          degree: {
            degreeLevel: 'BS',
            majors: ['Computer Science'],
            minors: ['Mathematics']
          },
          startDate: '2016-09',
          endDate: '2020-06',
          gpa: '3.9',
          courses: []
        }
      ],
      volunteer: [],
      awards: [],
      certificates: [],
      publications: [],
      languages: [],
      interests: [],
      references: [{ name: 'Ref', reference: 'Great work.' }]
    }
  };
}

/** The same resume plus a formatting overlay. */
function withFormatting(
  data: ResumeData,
  formatting: RichTextMap
): ResumeData {
  return { ...data, formatting };
}

/** One bold span covering `text` at `start`. */
function bold(text: string, start: number): RichSpan {
  return { text, start, marks: ['bold'] };
}

const mode = (data: ResumeData) => ({ editable: false, data });

/* -------------------------------------------------------------------------- */
/*  Field — a single string                                                    */
/* -------------------------------------------------------------------------- */

describe('<Field> read-only — the marks show', () => {
  it('wraps exactly the marked text in <strong>', () => {
    const data = withFormatting(fixture(), {
      'sections.basics.name': [bold('Alex', 0)]
    });
    const html = renderToStaticMarkup(
      React.createElement(Field, {
        mode: mode(data),
        path: 'sections.basics.name'
      })
    );
    expect(html).toContain('<strong>Alex</strong>');
    // The unmarked tail is still there, and still plain text.
    expect(html).toContain(' Rivera');
    expect(html).not.toContain('<strong>Alex Rivera</strong>');
  });

  it('renders the pre-feature shape when the field has no spans', () => {
    const data = fixture();
    const html = renderToStaticMarkup(
      React.createElement(Field, {
        mode: mode(data),
        path: 'sections.basics.name'
      })
    );
    // Byte-identical to the pre-feature output, modulo the
    // `data-rich-path` attribute (the editor's selection hook).
    expect(html.replace(/ data-rich-path="[^"]*"/, '')).toBe(
      '<span>Alex Rivera</span>'
    );
    // No wrapper element, no mark element.
    expect(html).not.toMatch(/<(strong|em|u)/);
  });

  it('renders the pre-feature shape when the overlay has no entry for the field', () => {
    // A resume whose overlay marks a DIFFERENT field must still render
    // this field exactly as before.
    const data = withFormatting(fixture(), {
      'sections.basics.summary': [bold('Builds', 0)]
    });
    const html = renderToStaticMarkup(
      React.createElement(Field, {
        mode: mode(data),
        path: 'sections.basics.name'
      })
    );
    expect(html.replace(/ data-rich-path="[^"]*"/, '')).toBe(
      '<span>Alex Rivera</span>'
    );
  });

  it('carries data-rich-path so the editor can find the field', () => {
    const data = fixture();
    const html = renderToStaticMarkup(
      React.createElement(Field, {
        mode: mode(data),
        path: 'sections.basics.name'
      })
    );
    expect(html).toContain('data-rich-path="sections.basics.name"');
  });
});

/* -------------------------------------------------------------------------- */
/*  FieldBullets — a string[] rendered as <ul>                                */
/* -------------------------------------------------------------------------- */

describe('<FieldBullets> read-only — the per-item path', () => {
  const path = 'sections.work.0.positions.0.highlights';

  it('marks the bullet whose path says so', () => {
    const data = withFormatting(fixture(), {
      [`${path}.1`]: [bold('Owned', 0)]
    });
    const html = renderToStaticMarkup(
      React.createElement(FieldBullets, { mode: mode(data), path })
    );
    // Bullet 1 is untouched, bullet 2 carries the mark.
    expect(html).toContain(
      '<li class="print:break-inside-avoid">Shipped X.</li>'
    );
    expect(html).toContain(
      '<li class="print:break-inside-avoid"><strong>Owned</strong> Y.</li>'
    );
  });

  it('keeps the original index when an earlier bullet is empty', () => {
    // The read-only render drops empty bullets, but the overlay is
    // keyed by the ORIGINAL index — the same index the editor's
    // BulletList addresses. A filtered bullet must not shift the
    // marks onto the wrong bullet.
    const base = fixture();
    const withEmptyBullet: ResumeData = {
      ...base,
      sections: {
        ...base.sections,
        work: [
          {
            ...base.sections.work[0],
            positions: [
              {
                ...base.sections.work[0].positions[0],
                highlights: ['', 'Second bullet.']
              }
            ]
          }
        ]
      }
    };
    const data = withFormatting(withEmptyBullet, {
      [`${path}.1`]: [bold('Second', 0)]
    });
    const html = renderToStaticMarkup(
      React.createElement(FieldBullets, { mode: mode(data), path })
    );
    expect(html.match(/<li/g)?.length).toBe(1);
    expect(html).toContain(
      '<li class="print:break-inside-avoid"><strong>Second</strong> bullet.</li>'
    );
  });

  it('renders plain text nodes when no bullet is marked', () => {
    const data = fixture();
    const html = renderToStaticMarkup(
      React.createElement(FieldBullets, { mode: mode(data), path })
    );
    expect(html).toBe(
      '<ul class="list-outside list-disc space-y-1 pl-5">' +
        '<li class="print:break-inside-avoid">Shipped X.</li>' +
        '<li class="print:break-inside-avoid">Owned Y.</li>' +
        '</ul>'
    );
  });
});

/* -------------------------------------------------------------------------- */
/*  FieldChips — a string[] rendered as a comma-separated run                 */
/* -------------------------------------------------------------------------- */

describe('<FieldChips> read-only — the per-item path', () => {
  const path = 'sections.skills.0.keywords';

  it('keeps the marked chip marked and the others plain', () => {
    const data = withFormatting(fixture(), {
      [`${path}.1`]: [bold('JS', 0)]
    });
    const html = renderToStaticMarkup(
      React.createElement(FieldChips, { mode: mode(data), path })
    );
    expect(html).toBe('<span>TS, <strong>JS</strong></span>');
  });

  it('renders the joined string unchanged when no chip is marked', () => {
    const data = fixture();
    const html = renderToStaticMarkup(
      React.createElement(FieldChips, { mode: mode(data), path })
    );
    // Byte-identical to the pre-feature output: ONE text node, no
    // wrapper element per chip.
    expect(html).toBe('<span>TS, JS</span>');
  });

  it('marks a chip in the boxed variant too', () => {
    const data = withFormatting(fixture(), {
      [`${path}.0`]: [bold('TS', 0)]
    });
    const html = renderToStaticMarkup(
      React.createElement(FieldChips, {
        mode: mode(data),
        path,
        variant: 'chips'
      })
    );
    expect(html).toContain('<strong>TS</strong>');
    expect(html).toContain('JS');
  });
});

/* -------------------------------------------------------------------------- */
/*  ClassicReadOnly — the server-rendered read-only view                       */
/* -------------------------------------------------------------------------- */

describe('<ClassicReadOnly> — the marks show', () => {
  it('renders no mark elements for an unmarked resume', () => {
    const html = renderToStaticMarkup(
      React.createElement(ClassicReadOnly, { data: fixture() })
    );
    expect(html).not.toMatch(/<(strong|em|u)[\s>]/);
  });

  it('marks the name, the company and a bullet', () => {
    const data = withFormatting(fixture(), {
      'sections.basics.name': [bold('Alex', 0)],
      'sections.work.0.company': [bold('Lumen', 0)],
      'sections.work.0.positions.0.highlights.1': [bold('Owned', 0)]
    });
    const html = renderToStaticMarkup(
      React.createElement(ClassicReadOnly, { data })
    );
    expect(html).toContain('<strong>Alex</strong> Rivera');
    expect(html).toContain('<strong>Lumen</strong> Cloud');
    expect(html).toContain('<strong>Owned</strong> Y.');
  });

  it('marks a skill keyword at its per-item path', () => {
    const data = withFormatting(fixture(), {
      'sections.skills.0.keywords.1': [bold('JS', 0)]
    });
    const html = renderToStaticMarkup(
      React.createElement(ClassicReadOnly, { data })
    );
    // The keyword run is a JOIN, so the separator stays outside the
    // marked run.
    expect(html).toContain('— TS, <strong>JS</strong>');
  });

  it('keeps the template chrome outside the marked run', () => {
    // The degree line, the GPA label and the quotes around a
    // reference are TEMPLATE punctuation — not part of the stored
    // value. A span's offsets are relative to the leaf it was stored
    // against, so folding the chrome into the marked run would shift
    // every offset and bold the wrong words.
    const data = withFormatting(fixture(), {
      'sections.education.0.degree.majors.0': [bold('Computer', 0)],
      'sections.education.0.gpa': [bold('3.9', 0)],
      'sections.references.0.reference': [bold('Great', 0)]
    });
    const html = renderToStaticMarkup(
      React.createElement(ClassicReadOnly, { data })
    );
    expect(html).toContain(
      'BS, <strong>Computer</strong> Science, Minor: Mathematics'
    );
    expect(html).toContain('GPA: <strong>3.9</strong>');
    // React escapes the quote characters in text nodes.
    expect(html).toContain('&quot;<strong>Great</strong> work.&quot;');
  });
});
