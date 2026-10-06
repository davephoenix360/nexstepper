/**
 * Pin the print page-break behavior so the browser's print pipeline
 * (and our `?print=1` → `window.print()` → "Save as PDF" path) breaks
 * pages in the two locations users actually expect:
 *
 *   1. Between resume sections  — so a section header never orphans
 *      alone at the bottom of a page with its body on the next page.
 *   2. Between section entries — so a single work entry / education
 *      entry / project / etc. is never torn across pages.
 *
 * Background
 * ----------
 * Each template's section wrapper renders a `<section>` containing an
 * `<h2>` (the small-caps section title) and the section body. Before
 * this fix there was no CSS hint that "this title must stay with its
 * body" — only the per-entry `break-inside-avoid` on individual entries.
 * Result: a header could sit alone at the bottom of page 1 with its
 * first job on page 2.
 *
 * The fix: `print:break-after-avoid` on the section `<h2>`. Combined
 * with the existing per-entry `break-inside-avoid`, the printer has
 * both preferences it needs.
 *
 * Why source-level tests instead of running a headless print
 *   jsdom doesn't run the browser print engine; the print→PDF pipeline
 *   is a real Chrome / Edge renderer. So we pin the *source-level*
 *   invariants (the Tailwind utility classes that get shipped to the
 *   browser). If a future refactor drops one, this test fails.
 */

import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';

import { MinimalTemplate } from '@/components/resume-templates/minimal';
import { ModernTemplate } from '@/components/resume-templates/modern';
import { ExecutiveTemplate } from '@/components/resume-templates/executive';
import { CreativeTemplate } from '@/components/resume-templates/creative';
import { ClassicTemplate } from '@/components/resume-templates/classic';
import { ClassicReadOnly } from '@/components/resume-templates/classic-readonly';
import type { ResumeData } from '@/lib/resume-schema';

/**
 * A minimal-but-populated `ResumeData` so every section wrapper
 * renders. We start from `blankResumeData()` and populate just the
 * fields needed to make every section's `has(arr)` / `isSet(s)` /
 * truthiness guard pass — one entry per array section, non-empty
 * basics. This is enough to make every section's h2 + body appear in
 * the rendered HTML so the tests below have something to assert
 * against.
 */
function populatedResumeData(): ResumeData {
  return {
    name: 'Test User',
    note: '',
    status: 'completed',
    template: 'classic',
    jobContext: null,
    sections: {
      basics: {
        name: 'Test User',
        label: 'Software Engineer',
        email: 't@example.com',
        phone: '555-0100',
        url: 'example.com',
        summary: 'Test summary.',
        location: {
          address: '',
          postalCode: '',
          city: 'City',
          countryCode: 'US',
          region: ''
        },
        profiles: []
      },
      work: [
        {
          company: 'Co',
          location: 'Remote',
          description: '',
          url: '',
          positions: [
            {
              title: 'Eng',
              startDate: '2020-01',
              endDate: '2024-01',
              highlights: ['Did X']
            }
          ]
        }
      ],
      education: [
        {
          institution: 'Univ',
          url: '',
          location: '',
          degree: { degreeLevel: 'BS', majors: ['CS'], minors: [] },
          startDate: '2016-09',
          endDate: '2020-06',
          gpa: '',
          courses: []
        }
      ],
      projects: [
        {
          name: 'Proj',
          description: 'Desc',
          url: '',
          startDate: '',
          endDate: '',
          highlights: ['Did Y'],
          keywords: ['k1'],
          roles: []
        }
      ],
      skills: [
        { name: 'Cat', level: '', keywords: ['k1', 'k2'] }
      ],
      volunteer: [
        {
          organization: 'Org',
          position: 'Role',
          url: '',
          startDate: '',
          endDate: '',
          summary: '',
          highlights: ['Did Z']
        }
      ],
      awards: [
        { title: 'Award', date: '2024', awarder: '', summary: '' }
      ],
      certificates: [
        { name: 'Cert', date: '2024', issuer: '', url: '' }
      ],
      publications: [
        { name: 'Pub', publisher: 'Pub', releaseDate: '2024', url: '', summary: '' }
      ],
      languages: [{ language: 'En', fluency: 'Native' }],
      interests: [{ name: 'Hobby', keywords: ['tag'] }],
      references: [{ name: 'Ref', reference: 'Great.' }]
    }
  };
}

/**
 * Find the opening tag of the section header that matches the given
 * id. Templates differ on where they put the id:
 *   - classic.tsx (editor), SmartSection, Executive, Creative, Modern
 *     put `id="section-..."` on the <h2>.
 *   - classic-readonly.tsx puts `id="section-..."` on the <section>.
 *
 * Returns the opening tag of whichever element carries the id, or
 * `null` if neither is found. The caller asserts that *the section
 * header* (either the h2 with the id, or the h2 inside the section
 * with the id) carries `print:break-after-avoid`.
 */
function sectionHeaderById(html: string, id: string): string | null {
  // h2 carries the id (most templates)
  const h2Re = new RegExp(`<h2[^>]*id="${id}"[^>]*>`);
  const h2Match = h2Re.exec(html)?.[0] ?? null;
  if (h2Match) return h2Match;

  // <section> carries the id (classic-readonly.tsx) — return the
  // full <section ...> opening so the caller can scan its attributes
  // for the print class. The class lives on the inner h2 inside this
  // section, not on the section itself.
  const sectionRe = new RegExp(`<section[^>]*id="${id}"[^>]*>`);
  return sectionRe.exec(html)?.[0] ?? null;
}

/**
 * Check that the section header for a given id carries
 * `print:break-after-avoid`. Handles both placement styles.
 */
function expectHeaderHasBreakAfterAvoid(html: string, id: string): void {
  const tag = sectionHeaderById(html, id);
  expect(tag, `<section|header id="${id}"> must exist in rendered HTML`).not.toBeNull();

  // Case 1: id is on the h2 — the class is on this same tag.
  if (tag!.startsWith('<h2')) {
    expect(tag).toContain('print:break-after-avoid');
    return;
  }

  // Case 2: id is on the <section> — walk the section's body and
  // assert the inner <h2> carries the class.
  const sectionStart = html.indexOf(tag!);
  const sectionEnd = html.indexOf('</section>', sectionStart);
  expect(sectionEnd).toBeGreaterThan(sectionStart);
  const sectionBody = html.substring(sectionStart, sectionEnd);
  expect(
    sectionBody,
    `<section id="${id}"> must contain <h2 ...> with print:break-after-avoid`
  ).toMatch(/<h2[^>]*print:break-after-avoid/);
}

/**
 * Section ids that exist for a fully-populated resume in Classic /
 * Modern. Executive omits Summary (summary is part of the inline
 * header block) and Creative's Portfolio section is always empty
 * (the body returns null, so SmartSection collapses it).
 */
const CLASSIC_SECTIONS = [
  'section-summary',
  'section-experience',
  'section-projects',
  'section-skills',
  'section-education',
  'section-volunteer',
  'section-awards',
  'section-certificates',
  'section-publications',
  'section-languages',
  'section-interests',
  'section-references'
];

const MINIMAL_SECTIONS = [
  'section-summary',
  'section-experience',
  'section-skills',
  'section-education',
  'section-projects',
  'section-volunteer'
];

const EXECUTIVE_SECTIONS = [
  'section-experience',
  'section-education',
  'section-skills',
  'section-projects',
  'section-publications',
  'section-volunteer'
];

const CREATIVE_SECTIONS = [
  'section-summary',
  'section-experience',
  'section-skills',
  'section-education',
  'section-projects',
  'section-volunteer'
];

/* --------------------------------------------------------------------------
 * Section header: print:break-after-avoid
 *
 * Each section's <h2> must carry the class so the section title can't
 * orphan at the bottom of a page. Without this, a "EXPERIENCE" header
 * can sit alone at the bottom of page 1 with the first job entry on
 * page 2 — exactly the "random and bad" page break users reported.
 * ------------------------------------------------------------------------ */

describe('Section header — print:break-after-avoid on every section h2', () => {
  type Fixture = {
    name: string;
    Render: React.ComponentType<{ data: ResumeData; editable?: boolean }>;
    sections: readonly string[];
  };

  const fixtures: Fixture[] = [
    { name: 'classic', Render: ClassicTemplate, sections: CLASSIC_SECTIONS },
    { name: 'modern', Render: ModernTemplate, sections: CLASSIC_SECTIONS },
    { name: 'minimal', Render: MinimalTemplate, sections: MINIMAL_SECTIONS },
    { name: 'executive', Render: ExecutiveTemplate, sections: EXECUTIVE_SECTIONS },
    { name: 'creative', Render: CreativeTemplate, sections: CREATIVE_SECTIONS }
  ];

  for (const { name, Render, sections } of fixtures) {
    for (const sectionId of sections) {
      it(`${name}: section header for "${sectionId}" carries print:break-after-avoid`, () => {
        const html = renderToStaticMarkup(
          React.createElement(Render, {
            data: populatedResumeData(),
            editable: false
          })
        );
        expectHeaderHasBreakAfterAvoid(html, sectionId);
      });
    }
  }
});

/**
 * Classic's read-only path is a separate file (no RHF / no editor
 * hooks) and ships its own Section helper. Pin it explicitly so a
 * refactor that only touches one of the two Classic renderers
 * doesn't silently drop the class on the other.
 */
describe('ClassicReadOnly — print:break-after-avoid on every section header', () => {
  for (const sectionId of CLASSIC_SECTIONS) {
    it(`section header for "${sectionId}" carries print:break-after-avoid`, () => {
      const html = renderToStaticMarkup(
        React.createElement(ClassicReadOnly, { data: populatedResumeData() })
      );
      expectHeaderHasBreakAfterAvoid(html, sectionId);
    });
  }
});

/* --------------------------------------------------------------------------
 * Per-entry wrapper: print:break-inside-avoid
 *
 * Each individual work / education / project / volunteer entry must
 * already carry `print:break-inside-avoid` so the printer prefers to
 * break between entries rather than mid-entry. This test pins the
 * existing behavior so a future refactor doesn't silently drop it.
 * ------------------------------------------------------------------------ */

describe('Per-entry wrapper — print:break-inside-avoid (existing, regression test)', () => {
  type Fixture = {
    name: string;
    Render: React.ComponentType<{ data: ResumeData; editable?: boolean }>;
    // data-testids we expect to find in the entry outer wrapper
    expectedTestIds: readonly string[];
  };

  const fixtures: Fixture[] = [
    // Minimal / Executive / Creative expose per-entry data-testids; the
    // Classic renderers don't (they're the read-only fixtures used for
    // PDF + preview), so we check those separately via a substring scan.
    { name: 'minimal', Render: MinimalTemplate, expectedTestIds: ['work-entry-0', 'edu-entry-0', 'proj-entry-0'] },
    { name: 'executive', Render: ExecutiveTemplate, expectedTestIds: ['work-entry-0', 'edu-entry-0', 'proj-entry-0'] },
    { name: 'creative', Render: CreativeTemplate, expectedTestIds: ['work-entry-0', 'edu-entry-0', 'proj-entry-0'] }
  ];

  for (const { name, Render, expectedTestIds } of fixtures) {
    for (const testId of expectedTestIds) {
      it(`${name}: outer wrapper of [${testId}] carries print:break-inside-avoid`, () => {
        const html = renderToStaticMarkup(
          React.createElement(Render, {
            data: populatedResumeData(),
            editable: false
          })
        );
        // Find the wrapper opening tag that carries the data-testid.
        const wrapperRe = new RegExp(`<div[^>]*data-testid="${testId}"[^>]*>`);
        const wrapper = wrapperRe.exec(html)?.[0] ?? null;
        expect(wrapper, `wrapper for [${testId}] must exist`).not.toBeNull();
        // The break-inside-avoid class may live on the wrapper itself
        // or on an ancestor of the wrapper. The simplest correct check
        // is "the class string appears in the rendered HTML between
        // the wrapper's <div ...> and its matching </div>" — i.e. the
        // class is inside the entry subtree. This catches both
        // "wrapper has it directly" and "an ancestor has it that
        // contains the wrapper".
        const wrapperStart = html.indexOf(wrapper!);
        // Walk forward through the HTML to find the closing </div>
        // that ends the testid wrapper. We track <div> / </div>
        // balance because nested wrappers can be inside.
        let depth = 1;
        let cursor = html.indexOf('>', wrapperStart) + 1;
        while (depth > 0 && cursor < html.length) {
          const nextOpen = html.indexOf('<div', cursor);
          const nextClose = html.indexOf('</div>', cursor);
          if (nextClose === -1) break;
          if (nextOpen !== -1 && nextOpen < nextClose) {
            depth++;
            cursor = html.indexOf('>', nextOpen) + 1;
          } else {
            depth--;
            cursor = nextClose + '</div>'.length;
          }
        }
        const block = html.substring(wrapperStart, cursor);
        expect(
          block,
          `[${testId}] should contain print:break-inside-avoid`
        ).toContain('print:break-inside-avoid');
      });
    }
  }
});

/**
 * Classic (read-only) doesn't expose per-entry data-testids. Walk the
 * Experience section and assert each work-entry wrapper carries the
 * class.
 */
describe('Classic (read-only path) — per-entry print:break-inside-avoid', () => {
  it('every work entry wrapper inside Experience carries print:break-inside-avoid', () => {
    const html = renderToStaticMarkup(
      React.createElement(ClassicReadOnly, { data: populatedResumeData() })
    );
    const expStart = html.indexOf('id="section-experience"');
    expect(expStart, 'Experience section must render').toBeGreaterThan(-1);
    const expEnd = html.indexOf('</section>', expStart);
    const section = html.substring(expStart, expEnd);
    const matches = section.match(/print:break-inside-avoid/g) ?? [];
    expect(
      matches.length,
      'at least one break-inside-avoid per work entry'
    ).toBeGreaterThanOrEqual(1);
  });
});

/* --------------------------------------------------------------------------
 * Section wrapper must NOT carry break-inside-avoid
 *
 * Earlier (Oct 2026), Modern's <section> wrapper had
 * `break-inside-avoid print:break-inside-avoid`. Combined with the
 * new `print:break-after-avoid` on the <h2>, this forced the ENTIRE
 * Experience section onto one page — pushing it to the next page
 * whenever it didn't fit at the bottom of the previous one, leaving
 * ~half a page of blank space. Pin: none of the five template
 * section wrappers (or ClassicReadOnly's) may carry break-inside-avoid
 * at the section level. Per-entry wrappers carry it (already pinned
 * above); the section itself must not.
 *
 * The check walks every rendered <section> element and asserts none
 * of them carry `break-inside-avoid` or `print:break-inside-avoid`
 * on the wrapper itself. The Experience section in particular must
 * not have it — that's the one that reproduced the user-visible bug.
 * ------------------------------------------------------------------------ */

function countBreakInsideAvoidOnSectionWrapper(html: string): number {
  // Match every <section ...> opening tag and count those that carry
  // either screen or print break-inside-avoid. We count openings (not
  // matches) so a bug that adds the class twice in one tag still
  // surfaces as "at least one".
  const re = /<section\b[^>]*>/g;
  let count = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    if (
      /\bbreak-inside-avoid\b/.test(match[0]) ||
      /\bprint:break-inside-avoid\b/.test(match[0])
    ) {
      count++;
    }
  }
  return count;
}

describe('Section wrapper — must NOT carry break-inside-avoid (giant-blank-page guard)', () => {
  type Fixture = {
    name: string;
    Render: React.ComponentType<{ data: ResumeData; editable?: boolean }>;
  };

  const fixtures: Fixture[] = [
    { name: 'classic', Render: ClassicTemplate },
    { name: 'modern', Render: ModernTemplate },
    { name: 'minimal', Render: MinimalTemplate },
    { name: 'executive', Render: ExecutiveTemplate },
    { name: 'creative', Render: CreativeTemplate },
    { name: 'classic-readonly', Render: ClassicReadOnly as Fixture['Render'] }
  ];

  for (const { name, Render } of fixtures) {
    it(`${name}: no <section> wrapper carries break-inside-avoid`, () => {
      const html = renderToStaticMarkup(
        React.createElement(Render, { data: populatedResumeData() })
      );
      const offenders = countBreakInsideAvoidOnSectionWrapper(html);
      expect(
        offenders,
        `${name}: no <section> may carry break-inside-avoid / ` +
          'print:break-inside-avoid — that pushes the whole section ' +
          'onto a single page and wastes blank space when it does not ' +
          'fit (verified 2026-10 in Modern template, fixed in ' +
          'fix/print-page-break-quality follow-up).'
      ).toBe(0);
    });
  }
});