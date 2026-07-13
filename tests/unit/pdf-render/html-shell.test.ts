import { describe, expect, it } from 'vitest';

import { wrapHtml, DEFAULT_PRINT_CSS } from '@/lib/pdf-render/html-shell';

/**
 * `wrapHtml` is a string builder — keep its tests about structure, not
 * style. The Tailwind compilation pipeline (Phase 2.3) will produce
 * `cssText`; for now we just verify the seam.
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

  it('embeds the page-break utility classes the templates use', () => {
    const out = wrapHtml('<p/>', '', opts);
    expect(out).toContain('.page-break-before { break-before: page; }');
    expect(out).toContain('.page-break-after { break-after: page; }');
    expect(out).toContain('.avoid-break { break-inside: avoid; }');
  });

  it('inlines the body fragment as-is (the caller pre-escaped it)', () => {
    const out = wrapHtml('<h1>Hello</h1>', '', opts);
    expect(out).toContain('<h1>Hello</h1>');
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
});
