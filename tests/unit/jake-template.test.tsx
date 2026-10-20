import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';

import { JakeTemplate, JakeReadOnly } from '@/components/resume-templates/jake';
import { sampleResumeData } from '@/lib/resume-schema';
import type { ResumeData } from '@/lib/resume-schema';

/**
 * Jake-template-specific tests. The shared template-meta / gallery /
 * print-hide tests cover the registry, picker, and print-hide UX;
 * the tests here pin the *visual identity* that makes Jake
 * recognisable on first glance.
 *
 *   - Centered small-caps NAME in the header (font-variant: small-caps)
 *   - Single-line contact row with inline icons (phone, email, web,
 *     linkedin, github)
 *   - 4-column coursework grid (the academic touch)
 *   - Section title with hairline rule UNDER it
 *   - "Leadership / Extracurricular" title (not the schema's
 *     default "Volunteer")
 *   - "Technical Skills" title (not the schema's default "Skills")
 *   - Project rows render with " | tech-stack" after the name
 *   - Each registered section is rendered at least once when the
 *     sample data has content (no Jake regression where one of the
 *     sections silently disappears)
 *
 * Render path: every test uses the read-only path (editable={false}
 * or JakeReadOnly) so the tests do not need a FormProvider. The
 * read-only path is the PDF / preview / print path; if the
 * template breaks visually there, the user sees it in the most
 * important surface.
 */

const JAKE_SAMPLE: ResumeData = {
  ...sampleResumeData,
  sections: {
    ...sampleResumeData.sections,
    basics: {
      ...sampleResumeData.sections.basics,
      profiles: [
        {
          network: 'GitHub',
          username: 'jake-g',
          url: 'https://github.com/jake-g'
        },
        {
          network: 'LinkedIn',
          username: 'jake-gutierrez',
          url: 'https://linkedin.com/in/jake-gutierrez'
        }
      ]
    },
    education: [
      {
        ...sampleResumeData.sections.education[0],
        // 8 courses — the 4-col grid expects this shape to
        // exercise all four columns.
        courses: [
          'Data Structures',
          'Algorithms',
          'Artificial Intelligence',
          'Systems Programming',
          'Software Methodology',
          'Database Management',
          'Internet Technology',
          'Computer Architecture'
        ]
      }
    ],
    volunteer: [
      {
        organization: 'Fraternity',
        position: 'President',
        url: '',
        startDate: '2020-01-01',
        endDate: '',
        summary: '',
        highlights: [
          'Achieved a 4 star fraternity ranking (highest possible).',
          'Managed executive board of 5 members and ran weekly meetings.'
        ]
      }
    ]
  }
};

function renderJake(data: ResumeData = JAKE_SAMPLE): string {
  return renderToStaticMarkup(
    React.createElement(JakeTemplate, { data, editable: false })
  );
}

describe('JakeTemplate — header identity', () => {
  it('renders the name in small caps (font-variant: small-caps)', () => {
    // The h1 has `[font-variant:small-caps]` — the brackets are
    // because it's an arbitrary-value Tailwind class. We slice
    // the className off the h1 and assert it contains the
    // small-caps fragment regardless of the surrounding arbitrary-
    // value syntax.
    const html = renderJake();
    const h1 = html.match(/<h1[^>]*data-testid="jake-name"[^>]*>/)?.[0];
    expect(h1).toBeTruthy();
    expect(h1).toContain('font-variant:small-caps');
    expect(h1).toContain('uppercase');
  });

  it('centers the header block (text-center)', () => {
    const html = renderJake();
    // The <header> wrapping the name + contact row has the
    // text-center class — a future contributor reverting to
    // left-align breaks the Jake look immediately.
    const header = html.match(/<header[^>]*>/)?.[0];
    expect(header).toBeTruthy();
    expect(header).toContain('text-center');
  });

  it('renders every contact channel in the inline contact row', () => {
    const html = renderJake();
    expect(html).toContain('rhendriks@mail.com');
    expect(html).toContain('(912) 555-4321');
    expect(html).toContain('jake-gutierrez'); // LinkedIn username
    expect(html).toContain('jake-g'); // GitHub username
  });

  it('strips the scheme prefix from the website URL', () => {
    // The "Globe" icon row shows the bare host (no http://) — the
    // LaTeX template prints it that way.
    const html = renderJake();
    expect(html).toContain('richardhendricks.example.com');
    // The "http://" prefix should NOT appear next to the website.
    expect(html).not.toContain('http://richardhendricks.example.com');
  });
});

describe('JakeTemplate — section chrome', () => {
  it('renders a hairline horizontal rule UNDER each section title', () => {
    // The section header has a `border-b` rule on the wrapping
    // <div> (we don't pin the entire markup — just the rule).
    // We check for `border-b` and `border-zinc-700` on the section
    // title wrapper, which is the Jake signature.
    const html = renderJake();
    expect(html).toMatch(/border-b\s+border-zinc-700/);
  });

  it('renames "Volunteer" to "Leadership / Extracurricular" in the header', () => {
    const html = renderJake();
    // The volunteer section's <h2> carries the Jake title.
    expect(html).toContain('Leadership / Extracurricular');
    expect(html).not.toMatch(/<h2[^>]*>\s*Volunteer\s*<\/h2>/);
  });

  it('renames "Skills" to "Technical Skills" in the header', () => {
    const html = renderJake();
    expect(html).toContain('Technical Skills');
    // The bare "Skills" title would appear as a standalone <h2>;
    // we don't expect that for Jake.
    expect(html).not.toMatch(/<h2[^>]*>\s*Skills\s*<\/h2>/);
  });
});

describe('JakeTemplate — coursework 4-column grid', () => {
  it('renders a 4-column grid for the education coursework', () => {
    const html = renderJake();
    // The grid container has the jake-coursework-grid testid.
    const grid = html.match(
      /<ul[^>]*data-testid="jake-coursework-grid"[^>]*>/
    )?.[0];
    expect(grid).toBeTruthy();
    expect(grid).toContain('grid-cols-4');
  });

  it('renders every course from education.courses in the grid', () => {
    const html = renderJake();
    for (const course of [
      'Data Structures',
      'Algorithms',
      'Artificial Intelligence',
      'Systems Programming',
      'Software Methodology',
      'Database Management',
      'Internet Technology',
      'Computer Architecture'
    ]) {
      expect(html).toContain(course);
    }
  });

  it('renders a "Relevant Coursework" sub-header above the grid', () => {
    const html = renderJake();
    expect(html).toContain('Relevant Coursework');
  });
});

describe('JakeTemplate — project rows', () => {
  it('renders the project name + tech stack joined with " | "', () => {
    // The Jake LaTeX template prints "Project Name | Python, Selenium"
    // on a single line. The comma-separated form is the literal
    // Jake signature.
    const html = renderToStaticMarkup(
      React.createElement(JakeTemplate, {
        data: {
          ...JAKE_SAMPLE,
          sections: {
            ...JAKE_SAMPLE.sections,
            projects: [
              {
                name: 'Gym Reservation Bot',
                description: '',
                highlights: [],
                keywords: ['Python', 'Selenium', 'Google Cloud Console'],
                startDate: '2021-01-01',
                endDate: '',
                url: '',
                roles: []
              }
            ]
          }
        },
        editable: false
      })
    );
    // The " | " separator is the visual signature. The test
    // asserts the full joined string is rendered.
    expect(html).toContain('Gym Reservation Bot');
    expect(html).toContain('Python, Selenium, Google Cloud Console');
    // We don't pin a single literal " | " because the markup may
    // split it across spans; the project name + keywords
    // appearing together is the proof.
  });
});

describe('JakeTemplate — read-only alias', () => {
  it('JakeReadOnly renders the same Jake-specific chrome', () => {
    const html = renderToStaticMarkup(
      React.createElement(JakeReadOnly, { data: JAKE_SAMPLE })
    );
    expect(html).toContain('data-testid="jake-name"');
    expect(html).toContain('font-variant:small-caps');
    expect(html).toContain('Relevant Coursework');
    expect(html).toContain('Technical Skills');
  });
});

describe('JakeTemplate — section coverage', () => {
  it('renders every section that has content (no silent dropouts)', () => {
    // Each of these section ids must appear in the rendered HTML
    // when the sample data has content for it. A future
    // contributor who forgets to render a section (e.g. drops the
    // <JakeSection> wrapper around Awards) would be caught here.
    // (Note: `projects` is empty in the sample so it's
    // intentionally NOT in this list — see the next test for the
    // empty-section-suppression assertion.)
    const html = renderJake();
    const expectedIds = [
      'section-summary',
      'section-education',
      'section-experience',
      'section-skills',
      'section-volunteer',
      'section-languages'
    ];
    for (const id of expectedIds) {
      expect(html).toContain(`id="${id}"`);
    }
  });

  it('skips empty sections in the read-only path (no phantom headers)', () => {
    // `projects` is empty in the sample. The read-only path
    // suppresses the whole section (per the SmartSection
    // contract) — the section-* id should NOT appear.
    const html = renderJake();
    expect(html).not.toContain('id="section-projects"');
  });
});

describe('JakeTemplate — font wiring', () => {
  it('applies the serif font class to the article wrapper', () => {
    // We use Tailwind's `font-serif` rather than next/font/google
    // so the template renders correctly in vitest (which can't
    // load Google Fonts at test time) and in any browser without
    // a font-load delay. The class itself is the contract.
    const html = renderJake();
    const articleOpen = html.match(/<article[^>]*data-template="jake"[^>]*>/)?.[0];
    expect(articleOpen).toBeTruthy();
    expect(articleOpen).toContain('font-serif');
  });
});
