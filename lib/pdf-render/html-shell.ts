/**
 * HTML doc wrapper.
 *
 * The provider takes a full HTML document (not a fragment). This module
 * wraps a body fragment in a printable document with:
 *   - the @page rules from `app/globals.css` (so margin / page size
 *     stay in sync with the on-screen preview)
 *   - inlined CSS (the compiled Tailwind + any custom rules)
 *   - the basics meta tags (charset, viewport, no-cache)
 *
 * Tailwind compile path (Phase 2.3) lives elsewhere — this module just
 * accepts a `cssText` string and inlines it. Keeping the seam here means
 * the "how do we get CSS" decision doesn't leak into the orchestrator.
 */

import 'server-only';

import type { RenderOptions } from './types';

/**
 * Wrap an HTML body fragment in a full document suitable for the PDF API.
 *
 * @param body  - the rendered template HTML (already-rendered React output)
 * @param cssText - compiled CSS to inline in a <style> block
 * @param options - render options; the page size and margins land in @page
 */
export function wrapHtml(
  body: string,
  cssText: string,
  options: Required<RenderOptions>
): string {
  // Note: we keep this template literal tight to avoid accidentally
  // injecting user-controlled content into the doc head. The only
  // interpolated values are cssText (caller-controlled, no user data)
  // and body (caller-controlled, but escaped by React before it gets
  // here).
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Resume</title>
<style>
  /* Page setup — mirrors app/globals.css. Kept in sync by convention. */
  @page { size: ${options.format === 'a4' ? 'A4' : 'letter'}; margin: ${options.marginMm}mm; }
  @media print {
    html, body { margin: 0; padding: 0; }
    /* Page-break hints the templates set via the .page-break utility. */
    .page-break-before { break-before: page; }
    .page-break-after { break-after: page; }
    .avoid-break { break-inside: avoid; }
  }
  html, body { background: #fff; color: #111; }
  ${cssText}
</style>
</head>
<body>
${body}
</body>
</html>`;
}

/**
 * Default @page + body CSS. Used when the caller has no compiled CSS
 * yet (e.g., smoke test, or a one-off print view). Templates that use
 * Tailwind utilities should pass their compiled CSS in `cssText` instead.
 */
export const DEFAULT_PRINT_CSS = `
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; font-size: 11pt; line-height: 1.4; }
  h1, h2, h3, h4 { margin: 0; }
  h1 { font-size: 20pt; font-weight: 700; }
  h2 { font-size: 13pt; font-weight: 600; margin-top: 12pt; }
  h3 { font-size: 11pt; font-weight: 600; }
  p { margin: 0 0 6pt; }
  ul { margin: 0 0 6pt 18pt; padding: 0; }
`;
