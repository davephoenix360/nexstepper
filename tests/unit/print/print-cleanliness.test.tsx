// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';

import { MinimalTemplate } from '@/components/resume-templates/minimal';
import { ModernTemplate } from '@/components/resume-templates/modern';
import { ExecutiveTemplate } from '@/components/resume-templates/executive';
import { CreativeTemplate } from '@/components/resume-templates/creative';
import { ClassicTemplate } from '@/components/resume-templates/classic';
import { JakeTemplate } from '@/components/resume-templates/jake';
import { PRINTABLE_PART_SLUGS } from '@/lib/print/print-slugs';
import { updatePrintHiddenSectionsArgsSchema } from '@/lib/chat/tools/types';
import type { ResumeData } from '@/lib/resume-schema';
import { sampleResumeData } from '@/lib/resume-schema';

/**
 * WHAT ACTUALLY PRINTS
 * =====================
 *
 * The printed resume is not a separate artefact — it is the SAME DOM
 * the browser prints, under `@media print`. So "what prints" is
 * decided by two things:
 *
 *   1. the markup (what text is in the document), and
 *   2. the print stylesheet (`print:hidden` → `display:none`,
 *      `.no-print` → `display:none !important`).
 *
 * This file simulates (2) with jsdom — remove every element whose
 * class carries `print:hidden` or `no-print` — and then asserts
 * about (1).
 *
 * ## Why the read-only render is the subject
 *
 * The read-only render (`editable={false}`) is the print path for
 * the PREVIEW page and the PUBLIC SHARE LINK. The editor prints its
 * own (editable) DOM, where `EditableText` already hid its
 * placeholder with `print:hidden`. The read-only branch of `Field`
 * did NOT — so a candidate who left their location blank got
 * "City, State" printed on their resume, and one who left their
 * summary blank got the entire placeholder sentence on the page
 * they sent to employers.
 *
 * These tests pin the fixed behaviour so it cannot come back.
 */

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                     */
/* -------------------------------------------------------------------------- */

const TEMPLATE_DIR = path.join(process.cwd(), 'components', 'resume-templates');

/**
 * The SECTION headings the templates render.
 *
 * They are excluded from the forbidden set because a heading is
 * template chrome, not a placeholder — and one of them ("Summary")
 * happens to be spelled the same as a placeholder elsewhere
 * (Classic's volunteer "Summary" field). A heading is checked by its
 * own rule (an empty section prints no heading), not by this one.
 */
const SECTION_TITLES = new Set([
  'Summary',
  'Experience',
  'Skills',
  'Education',
  'Projects',
  'Volunteer',
  'Awards',
  'Certificates',
  'Publications',
  'Languages',
  'Interests',
  'References',
  'Technical Skills',
  'Publications & Speaking',
  'Board & Advisory Roles'
]);

/**
 * Every placeholder literal the templates can render.
 *
 * Read from the template SOURCES rather than hard-coded, so a
 * template that grows a new placeholder is covered automatically —
 * the point of the test is to catch a NEW leak, and a hard-coded
 * list would only ever catch the leaks we already knew about.
 */
function collectPlaceholderLiterals(): string[] {
  const found = new Set<string>();
  for (const file of fs.readdirSync(TEMPLATE_DIR)) {
    if (!file.endsWith('.tsx')) continue;
    const src = fs.readFileSync(path.join(TEMPLATE_DIR, file), 'utf8');
    // `placeholder="City"` — the prop the Field primitives take.
    for (const m of src.matchAll(/placeholder="([^"]+)"/g)) {
      found.add(m[1]);
      // `FieldChips`' empty state renders "Add <placeholder>".
      found.add(`Add ${m[1]}`);
    }
    // `<Placeholder>Institution</Placeholder>` — the Classic
    // read-only fallback labels.
    for (const m of src.matchAll(/<Placeholder>([^<]+)<\/Placeholder>/g)) {
      found.add(m[1]);
    }
    // The label fallbacks that sit inside a `print:hidden` span
    // (Jake's "Degree" / "Language:" / "Category:").
    for (const m of src.matchAll(
      /className="[^"]*print:hidden[^"]*">([^<]+)</g
    )) {
      found.add(m[1]);
    }
  }
  return [...found]
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !SECTION_TITLES.has(s));
}

/**
 * Simulate the print stylesheet and return the visible TEXT NODES.
 *
 * Text nodes rather than one flattened string: the templates render
 * adjacent elements with no whitespace between them ("ExperienceEducation"),
 * so a substring test would both miss a leak and false-positive on a
 * real value that merely CONTAINS a placeholder ("Languages" contains
 * "Language"). A placeholder is rendered as its OWN text node, so
 * equality is the right comparison.
 */
function printedTextNodes(html: string): { text: string; parentClass: string }[] {
  document.body.innerHTML = html;
  document
    .querySelectorAll('[class*="print:hidden"], [class*="no-print"]')
    .forEach((el) => el.remove());
  const walker = document.createTreeWalker(
    document.body,
    window.NodeFilter.SHOW_TEXT
  );
  const out: { text: string; parentClass: string }[] = [];
  let node = walker.nextNode();
  while (node) {
    const text = (node.textContent ?? '').trim();
    if (text) {
      const parent = node.parentElement;
      out.push({
        text,
        parentClass: parent?.getAttribute('class') ?? ''
      });
    }
    node = walker.nextNode();
  }
  return out;
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

/**
 * A realistic resume with the fields candidates actually leave blank
 * cleared: no phone, no URL, no location, no summary, no GPA, and a
 * few half-filled list entries.
 */
function sparseResume(): ResumeData {
  const data = clone(sampleResumeData);
  data.sections.basics.phone = '';
  data.sections.basics.url = '';
  data.sections.basics.location.city = '';
  data.sections.basics.location.region = '';
  data.sections.basics.location.countryCode = '';
  data.sections.basics.summary = '';
  data.sections.education.forEach((e) => {
    e.gpa = '';
    e.degree.minors = [''];
    e.courses = [''];
  });
  data.sections.skills.forEach((s) => {
    s.keywords = ['', 'React'];
  });
  return data;
}

const TEMPLATES: Array<{
  name: string;
  Render: React.ComponentType<{ data: ResumeData; editable?: boolean }>;
}> = [
  { name: 'minimal', Render: MinimalTemplate as never },
  { name: 'modern', Render: ModernTemplate as never },
  { name: 'executive', Render: ExecutiveTemplate as never },
  { name: 'creative', Render: CreativeTemplate as never },
  { name: 'classic', Render: ClassicTemplate as never },
  { name: 'jake', Render: JakeTemplate as never }
];

/* -------------------------------------------------------------------------- */
/*  Tests                                                                       */
/* -------------------------------------------------------------------------- */

describe('the printed resume contains no placeholder text', () => {
  const forbidden = collectPlaceholderLiterals();

  it('collects a non-trivial set of placeholder literals', () => {
    // Guard against the collector silently matching nothing — a test
    // that asserts "no placeholder printed" over an EMPTY forbidden
    // set always passes, and would be worse than no test.
    expect(forbidden.length).toBeGreaterThan(20);
    expect(forbidden).toContain('Institution');
    expect(forbidden).toContain('Company');
  });

  for (const { name, Render } of TEMPLATES) {
    it(`${name}: prints no placeholder literal (sparse resume)`, () => {
      const html = renderToStaticMarkup(
        React.createElement(Render, { data: sparseResume(), editable: false })
      );
      const nodes = printedTextNodes(html);
      const hits = nodes
        .filter((n) => forbidden.includes(n.text))
        .map((n) => n.text);
      expect(
        hits,
        `${name} printed placeholder text: ${[...new Set(hits)].join(', ')}`
      ).toEqual([]);
    });

    it(`${name}: prints no placeholder literal (fully populated resume)`, () => {
      const html = renderToStaticMarkup(
        React.createElement(Render, {
          data: clone(sampleResumeData),
          editable: false
        })
      );
      // The fully-populated sample has no empty fields, so this
      // asserts the baseline: the populated resume prints its
      // content and nothing else.
      const nodes = printedTextNodes(html);
      const hits = nodes
        .filter((n) => forbidden.includes(n.text))
        .map((n) => n.text);
      expect(hits).toEqual([]);
    });
  }
});

describe('an empty section prints no heading', () => {
  for (const { name, Render } of TEMPLATES) {
    it(`${name}: the Volunteer heading is absent when the section is empty`, () => {
      const data = clone(sampleResumeData);
      data.sections.volunteer = [];
      const html = renderToStaticMarkup(
        React.createElement(Render, { data, editable: false })
      );
      const texts = printedTextNodes(html).map((n) => n.text);
      expect(texts).not.toContain('Volunteer');
    });

    it(`${name}: a section holding only a blank entry prints no heading`, () => {
      // Stricter than "the array is empty": an entry the candidate
      // added but never filled in is also empty, because nothing in
      // it would print.
      const data = clone(sampleResumeData);
      data.sections.volunteer = [
        {
          organization: '',
          role: '',
          startDate: '',
          endDate: '',
          highlights: [],
          url: ''
        } as never
      ];
      const html = renderToStaticMarkup(
        React.createElement(Render, { data, editable: false })
      );
      const texts = printedTextNodes(html).map((n) => n.text);
      expect(texts).not.toContain('Volunteer');
    });
  }
});

describe('the contact strip prints no leading separator', () => {
  /**
   * The separator immediately BEFORE the phone must be absent when
   * the email is blank — otherwise the strip opens with a stray "·".
   *
   * (The separators later in the strip are legitimate: the URL and
   * the city still have content in front of them.)
   */
  function separatorBefore(html: string, value: string): string | null {
    document.body.innerHTML = html;
    const el = [...document.querySelectorAll('span')].find(
      (s) => s.textContent === value
    );
    return el?.previousElementSibling?.textContent ?? null;
  }

  it('creative: no "·" before the phone when the email is blank', () => {
    const data = clone(sampleResumeData);
    data.sections.basics.email = '';
    const html = renderToStaticMarkup(
      React.createElement(CreativeTemplate, { data, editable: false })
    );
    expect(separatorBefore(html, data.sections.basics.phone)).not.toBe('·');
  });

  it('executive: no "·" before the phone when the email is blank', () => {
    const data = clone(sampleResumeData);
    data.sections.basics.email = '';
    const html = renderToStaticMarkup(
      React.createElement(ExecutiveTemplate, { data, editable: false })
    );
    expect(separatorBefore(html, data.sections.basics.phone)).not.toBe('·');
  });

  it('creative: the separator IS there when the email is filled in', () => {
    // The rule is not "never render a separator" — it is "never
    // render a separator that has nothing in front of it".
    const data = clone(sampleResumeData);
    const html = renderToStaticMarkup(
      React.createElement(CreativeTemplate, { data, editable: false })
    );
    expect(separatorBefore(html, data.sections.basics.phone)).toBe('·');
  });
});

describe("Jake's Relevant Coursework", () => {
  function renderJake(data: ResumeData) {
    return renderToStaticMarkup(
      React.createElement(JakeTemplate, { data, editable: false })
    );
  }

  it('prints the coursework when there are courses', () => {
    const data = clone(sampleResumeData);
    data.sections.education.forEach((e) => {
      e.courses = ['Data Structures', 'Algorithms'];
    });
    const html = renderJake(data);
    expect(html).toContain('Relevant Coursework');
    expect(html).toContain('Data Structures');
  });

  it('prints NO coursework heading when the courses are empty', () => {
    const data = clone(sampleResumeData);
    data.sections.education.forEach((e) => {
      e.courses = [];
    });
    const html = renderJake(data);
    expect(html).not.toContain('Relevant Coursework');
  });

  it('can be hidden by the user through the print-hide list', () => {
    const data = clone(sampleResumeData);
    data.sections.education.forEach((e) => {
      e.courses = ['Data Structures'];
    });
    data.print = { hiddenSections: [PRINTABLE_PART_SLUGS.coursework] };
    const html = renderJake(data);
    // The block is still in the DOM (the user can see it in the
    // editor) but it carries `print:hidden`, so it does not print.
    const block = html.match(
      /<div[^>]*data-testid="jake-coursework"[^>]*>/
    );
    expect(block).not.toBeNull();
    expect(block?.[0]).toContain('print:hidden');
    // And nothing of it survives the print stylesheet.
    const texts = printedTextNodes(html).map((n) => n.text);
    expect(texts).not.toContain('Relevant Coursework');
  });

  it('renders the courses in a 4-column grid', () => {
    const data = clone(sampleResumeData);
    data.sections.education.forEach((e) => {
      e.courses = ['Data Structures'];
    });
    const html = renderJake(data);
    expect(html).toContain('grid-cols-4');
  });
});

describe('the printed paper is always white', () => {
  /**
   * The dark-mode print leak.
   *
   * The app's dark variant is a CLASS variant
   * (`@custom-variant dark (&:is(.dark *))`), so the compiled
   * selector is `.dark\:bg-zinc-950:is(.dark *)` — specificity
   * (0,2,0) — while `print:bg-white` compiles to (0,1,0). In dark
   * mode the dark background won, and the preview page and the
   * share link printed on a near-black sheet.
   *
   * The fix is an UNLAYERED `!important` rule in the print block:
   * an important declaration beats a normal one regardless of
   * layers, so it also beats anything Tailwind emits inside
   * `@layer utilities`.
   *
   * This cannot be caught by a DOM test — it is a cascade
   * question — so the rule is pinned here as source.
   */
  const css = fs.readFileSync(
    path.join(process.cwd(), 'app', 'globals.css'),
    'utf8'
  );

  it('forces a white background on the printed surfaces', () => {
    expect(css).toMatch(
      /@media print[\s\S]*?\.print-paper[\s\S]*?background:\s*white\s*!important/
    );
  });

  it('tells the UA the printed page is a light page', () => {
    expect(css).toMatch(/@media print[\s\S]*?color-scheme:\s*light/);
  });

  it('makes that colour-scheme rule IMPORTANT — the app sets it inline', () => {
    // The theme provider writes `color-scheme` onto <html> as an
    // INLINE STYLE (`root.style.colorScheme = resolved`). An inline
    // style beats a NORMAL stylesheet declaration, so a plain
    // `html { color-scheme: light }` inside @media print LOSES and the
    // printed sheet comes out dark.
    //
    // Verified in a real browser: with an inline `color-scheme: dark`
    // on the element, the computed value is "dark" under a normal
    // rule and "light" under an `!important` one. So this rule MUST
    // carry `!important` — a plain declaration is not enough, and
    // nothing else in the test suite would notice.
    expect(css).toMatch(
      /@media print[\s\S]*?color-scheme:\s*light\s*!important/
    );
  });

  it('marks the preview and share wrappers as print paper', () => {
    for (const file of [
      'app/(dashboard)/dashboard/resumes/[id]/preview/page.tsx',
      'app/r/[token]/page.tsx'
    ]) {
      const src = fs.readFileSync(path.join(process.cwd(), file), 'utf8');
      expect(src, `${file} must carry the print-paper class`).toContain(
        'print-paper'
      );
    }
  });
});

describe('the print-hide vocabulary', () => {
  it('accepts the part slugs in the chat tool schema', () => {
    const parsed = updatePrintHiddenSectionsArgsSchema.parse({
      hide: [PRINTABLE_PART_SLUGS.coursework]
    });
    expect(parsed.hide).toEqual(['coursework']);
  });

  it('every part slug is actually rendered by a template', () => {
    // A part slug the templates do not render would be a promise the
    // product cannot keep: the agent could hide it and nothing would
    // happen.
    const sources = fs
      .readdirSync(TEMPLATE_DIR)
      .filter((f) => f.endsWith('.tsx'))
      .map((f) => fs.readFileSync(path.join(TEMPLATE_DIR, f), 'utf8'))
      .join('\n');
    for (const slug of Object.keys(PRINTABLE_PART_SLUGS)) {
      expect(
        sources,
        `no template renders the part slug "${slug}"`
      ).toContain(`PRINTABLE_PART_SLUGS.${slug}`);
    }
  });
});
