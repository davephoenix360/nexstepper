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
import { sampleResumeData } from '@/lib/resume-schema';

/**
 * Pin the print-hide UX for all 5 templates. Each test renders a
 * template in read-only mode (the PDF / preview path), asserts
 * that the named section carries `print:hidden opacity-60`, and
 * verifies the OTHER sections stay un-hidden.
 *
 * Why "all 5 templates" rather than spot-checking one:
 *   The print-hide integration was added to the Section helper
 *   of each template in a separate edit (minimal uses
 *   SmartSection; executive/creative/modern have their own
 *   local Section helpers; classic has Section in two files —
 *   the editor-mode `classic.tsx` and the server-component
 *   `classic-readonly.tsx`). One test per template locks the
 *   contract for the template that future template authors
 *   will read first when adding a new one.
 *
 * The fixtures use `sampleResumeData` (real sections populated)
 * so the hidden-class assertion targets the SECTION wrapper,
 * not just any element.
 */

const HIDDEN_SLUG = 'skills';

function withHidden(data: ResumeData, slug: string): ResumeData {
  return {
    ...data,
    print: { hiddenSections: [slug] }
  };
}

function assertHiddenOn(html: string, sectionId: string, expectHidden: boolean) {
  // The hidden-class is set on the wrapping <section> of each
  // section helper. The id might be on the section tag itself
  // (classic-readonly.tsx) or on the inner <h2> (other templates).
  // Walk backwards from the id to find the enclosing <section>
  // opening tag, then forward to the matching </section>.
  const idRe = new RegExp(`id="${sectionId}"`);
  const idMatch = idRe.exec(html);
  expect(idMatch, `expected to find id="${sectionId}" in rendered HTML`).not.toBeNull();
  if (!idMatch) return;

  // Find the <section ...> opening tag that wraps the id. We walk
  // backwards, skipping over nested <section> openers that get
  // closed before our id (those are siblings, not ancestors).
  let depth = 1;
  let cursor = idMatch.index;
  while (depth > 0 && cursor > 0) {
    const before = html.substring(0, cursor);
    const lastOpen = before.lastIndexOf('<section');
    const lastClose = before.lastIndexOf('</section>');
    if (lastClose > lastOpen) {
      // The most recent tag boundary is a close — sibling section
      // closed, decrement our depth tracker.
      depth--;
      cursor = lastClose;
    } else if (lastOpen >= 0) {
      // The most recent boundary is an open. If we have outstanding
      // depth (depth > 1 in our counter), this is a nesting ancestor.
      // Otherwise, this is OUR enclosing section.
      depth--;
      if (depth === 0) {
        // `lastOpen` is our enclosing <section ...> tag.
        const openEnd = html.indexOf('>', lastOpen);
        const closeEnd = html.indexOf('</section>', openEnd);
        const tag = html.substring(lastOpen, closeEnd + '</section>'.length);
        if (expectHidden) {
          expect(tag, `section ${sectionId} should be hidden`).toContain(
            'print:hidden'
          );
          expect(tag).toContain('opacity-60');
        } else {
          expect(
            tag,
            `section ${sectionId} should NOT be hidden`
          ).not.toContain('print:hidden');
          expect(tag).not.toContain('opacity-60');
        }
        return;
      }
      cursor = lastOpen;
    } else {
      break;
    }
  }
  throw new Error(`could not find enclosing <section> for id="${sectionId}"`);
}

describe('MinimalTemplate — print-hide', () => {
  it('applies print:hidden opacity-60 to a hidden section', () => {
    const data = withHidden(sampleResumeData, HIDDEN_SLUG);
    const html = renderToStaticMarkup(
      React.createElement(MinimalTemplate, { data, editable: false })
    );
    assertHiddenOn(html, 'section-skills', true);
  });

  it('does NOT apply print:hidden to sections not in the array', () => {
    const data = withHidden(sampleResumeData, HIDDEN_SLUG);
    const html = renderToStaticMarkup(
      React.createElement(MinimalTemplate, { data, editable: false })
    );
    assertHiddenOn(html, 'section-experience', false);
  });
});

describe('ModernTemplate — print-hide', () => {
  it('applies print:hidden opacity-60 to a hidden section', () => {
    const data = withHidden(sampleResumeData, HIDDEN_SLUG);
    const html = renderToStaticMarkup(
      React.createElement(ModernTemplate, { data, editable: false })
    );
    assertHiddenOn(html, 'section-skills', true);
  });

  it('does NOT apply print:hidden to sections not in the array', () => {
    const data = withHidden(sampleResumeData, HIDDEN_SLUG);
    const html = renderToStaticMarkup(
      React.createElement(ModernTemplate, { data, editable: false })
    );
    assertHiddenOn(html, 'section-experience', false);
  });
});

describe('ExecutiveTemplate — print-hide', () => {
  it('applies print:hidden opacity-60 to a hidden section', () => {
    const data = withHidden(sampleResumeData, HIDDEN_SLUG);
    const html = renderToStaticMarkup(
      React.createElement(ExecutiveTemplate, { data, editable: false })
    );
    assertHiddenOn(html, 'section-skills', true);
  });

  it('does NOT apply print:hidden to sections not in the array', () => {
    const data = withHidden(sampleResumeData, HIDDEN_SLUG);
    const html = renderToStaticMarkup(
      React.createElement(ExecutiveTemplate, { data, editable: false })
    );
    assertHiddenOn(html, 'section-experience', false);
  });
});

describe('CreativeTemplate — print-hide', () => {
  it('applies print:hidden opacity-60 to a hidden section', () => {
    const data = withHidden(sampleResumeData, HIDDEN_SLUG);
    const html = renderToStaticMarkup(
      React.createElement(CreativeTemplate, { data, editable: false })
    );
    assertHiddenOn(html, 'section-skills', true);
  });

  it('does NOT apply print:hidden to sections not in the array', () => {
    const data = withHidden(sampleResumeData, HIDDEN_SLUG);
    const html = renderToStaticMarkup(
      React.createElement(CreativeTemplate, { data, editable: false })
    );
    assertHiddenOn(html, 'section-experience', false);
  });
});

describe('ClassicTemplate — print-hide', () => {
  it('applies print:hidden opacity-60 to a hidden section (read-only path)', () => {
    // ClassicTemplate dispatches editable -> ClassicWithForm;
    // editable=false -> ClassicReadOnly. The read-only path is
    // the PDF / preview render and uses the
    // `isSectionHiddenFromPrint` predicate directly (no RHF).
    const data = withHidden(sampleResumeData, HIDDEN_SLUG);
    const html = renderToStaticMarkup(
      React.createElement(ClassicTemplate, { data, editable: false })
    );
    assertHiddenOn(html, 'section-skills', true);
  });

  it('does NOT apply print:hidden to sections not in the array', () => {
    const data = withHidden(sampleResumeData, HIDDEN_SLUG);
    const html = renderToStaticMarkup(
      React.createElement(ClassicTemplate, { data, editable: false })
    );
    assertHiddenOn(html, 'section-experience', false);
  });

  it('ClassicReadOnly applies the same hidden class for the read-only path', () => {
    // Pin the server-component path explicitly — it uses the
    // synchronous `isSectionHiddenFromPrint()` predicate.
    const data = withHidden(sampleResumeData, HIDDEN_SLUG);
    const html = renderToStaticMarkup(
      React.createElement(ClassicReadOnly, { data })
    );
    assertHiddenOn(html, 'section-skills', true);
  });
});

describe('All 5 templates — back-compat with no `print` envelope', () => {
  // Every existing resume in the DB predates the `print` field.
  // Each template must render without errors and without
  // applying `print:hidden` to anything.
  const fixtures: Array<{ name: string; Render: React.ComponentType<{ data: ResumeData; editable?: boolean }> }> = [
    { name: 'minimal', Render: MinimalTemplate as React.ComponentType<{ data: ResumeData; editable?: boolean }> },
    { name: 'modern', Render: ModernTemplate as React.ComponentType<{ data: ResumeData; editable?: boolean }> },
    { name: 'executive', Render: ExecutiveTemplate as React.ComponentType<{ data: ResumeData; editable?: boolean }> },
    { name: 'creative', Render: CreativeTemplate as React.ComponentType<{ data: ResumeData; editable?: boolean }> },
    { name: 'classic', Render: ClassicTemplate as React.ComponentType<{ data: ResumeData; editable?: boolean }> }
  ];

  for (const { name, Render } of fixtures) {
    it(`${name}: renders without the print envelope and hides nothing`, () => {
      const legacy: ResumeData = {
        ...sampleResumeData
      };
      delete (legacy as Record<string, unknown>).print;
      const html = renderToStaticMarkup(
        React.createElement(Render, { data: legacy, editable: false })
      );
      // No section should be print-hidden — `hiddenSections` is
      // undefined, so the predicate always returns false.
      expect(html).not.toContain('print:hidden opacity-60');
    });
  }
});
