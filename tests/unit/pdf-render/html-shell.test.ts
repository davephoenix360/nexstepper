import { describe, expect, it } from 'vitest';

import { wrapHtml, DEFAULT_PRINT_CSS } from '@/lib/pdf-render/html-shell';

/**
 * `wrapHtml` is a string builder — keep its tests about structure, not
 * style. The Tailwind compilation pipeline (app/print.css →
 * lib/pdf-render/print.css) produces the default cssText; we just
 * verify the seam and the override path.
 */

const opts = {
  format: 'letter' as const,
  landscape: false,
  printBackground: true,
  marginMm: 10
};

describe('wrapHtml', () => {
  it('produces a full HTML5 document', () => {
    const out = wrapHtml('<h1>Hello</h1>', '', opts);
    expect(out).toMatch(/^<!doctype html>/i);
    expect(out).toContain('<html lang="en">');
    expect(out).toContain('<meta charset="utf-8">');
    expect(out).toContain('<body>');
    expect(out).toContain('</body>');
    expect(out).toContain('</html>');
  });

  it('inlines the provided CSS in a <style> block', () => {
    const out = wrapHtml('<p/>', '.x { color: red; }', opts);
    expect(out).toContain('<style>');
    expect(out).toContain('.x { color: red; }');
    expect(out).toMatch(/<\/style>/);
  });

  it('embeds @page size + margin from the options', () => {
    const letter = wrapHtml('<p/>', '', { ...opts, format: 'letter', marginMm: 12 });
    const a4 = wrapHtml('<p/>', '', { ...opts, format: 'a4', marginMm: 5 });
    expect(letter).toContain('@page { size: letter; margin: 12mm; }');
    expect(a4).toContain('@page { size: A4; margin: 5mm; }');
  });

  it('embeds the page-break utility classes when the caller provides them via cssText', () => {
    // Page-break classes live in the caller's cssText (typically the
    // compiled print.css, or DEFAULT_PRINT_CSS as a fallback). The
    // wrapHtml inline <style> block only contains the @page rule + the
    // body reset — to keep the two paths in sync without duplicating
    // rules across files.
    const out = wrapHtml('<p/>', DEFAULT_PRINT_CSS, opts);
    expect(out).toContain('.page-break-before { break-before: page; }');
    expect(out).toContain('.page-break-after { break-after: page; }');
    expect(out).toContain('.avoid-break { break-inside: avoid; }');
  });

  it('inlines the body fragment as-is (the caller pre-escaped it)', () => {
    const out = wrapHtml('<h1>Hello</h1>', '', opts);
    expect(out).toContain('<h1>Hello</h1>');
  });

  it('defaults cssText to the compiled print.css (Tailwind utilities available)', () => {
    // When the caller doesn't pass a cssText, wrapHtml falls through
    // to the module-level COMPILED_PRINT_CSS (loaded from
    // lib/pdf-render/print.css at module init). The compiled file
    // is part of the repo; we just check the output references
    // Tailwind utility classes — proves the load + inline worked.
    const out = wrapHtml('<p class="text-red-500 bg-white">x</p>', undefined as unknown as string, opts);
    // The compiled CSS uses CSS variable indirection; just check that
    // the Tailwind reset + color tokens made it in.
    expect(out).toContain('--color-red-500');
    // And that the @page rule from app/print.css is in the compiled output.
    expect(out).toContain('size: letter');
  });
});

describe('DEFAULT_PRINT_CSS', () => {
  it('is a non-empty stylesheet', () => {
    expect(DEFAULT_PRINT_CSS.length).toBeGreaterThan(0);
  });

  it('includes body font + size hints', () => {
    expect(DEFAULT_PRINT_CSS).toContain('body {');
    expect(DEFAULT_PRINT_CSS).toContain('font-size:');
  });

  it('includes the page-break utility classes as a fallback', () => {
    expect(DEFAULT_PRINT_CSS).toContain('.page-break-before');
    expect(DEFAULT_PRINT_CSS).toContain('.avoid-break');
  });
});
