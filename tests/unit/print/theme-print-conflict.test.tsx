// @vitest-environment jsdom
import { describe, expect, it, beforeAll } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import React from 'react';

import { ThemeProvider } from '@/components/theme-provider';

/**
 * jsdom does not implement `window.matchMedia`, and the theme
 * provider uses it to watch the OS preference. A stub is enough —
 * these tests exercise the EXPLICIT 'dark' path, which never consults
 * the media query.
 */
beforeAll(() => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false
  })) as unknown as typeof window.matchMedia;
});

/**
 * WHY THE PRINT RULE MUST BE `!important`
 * ========================================
 *
 * The theme provider applies the colour scheme to <html> as an
 * INLINE STYLE:
 *
 *   root.style.colorScheme = resolved;
 *
 * An inline style is an AUTHOR-origin declaration with NORMAL
 * importance. Under the CSS cascade it beats any NORMAL author
 * declaration in a stylesheet — including a rule inside
 * `@media print`.
 *
 * That is what broke the print: `app/globals.css` had
 *
 *   @media print { html { color-scheme: light; } }
 *
 * A normal declaration, which LOST to the inline
 * `style="color-scheme: dark"`. The UA kept the dark canvas and the
 * printed resume came out on a near-black sheet.
 *
 * The fix is `color-scheme: light !important` — an IMPORTANT author
 * declaration beats a NORMAL author declaration, inline styles
 * included (CSS Cascade 4).
 *
 * Verified in a real browser against the live site: with an inline
 * `color-scheme: dark` on the element, the computed value is "dark"
 * under a normal rule and "light" under an `!important` one.
 *
 * These tests pin the CAUSE, so that the fix in `globals.css` cannot
 * be "simplified" back into a plain declaration without anything
 * failing.
 */
describe('the theme provider writes color-scheme as an inline style', () => {
  it('sets documentElement.style.colorScheme when the theme is dark', async () => {
    localStorage.setItem('nexstepper-theme', 'dark');
    render(
      <ThemeProvider>
        <div>content</div>
      </ThemeProvider>
    );
    await waitFor(() => {
      expect(document.documentElement.style.colorScheme).toBe('dark');
    });
    // And it is the INLINE style — that is the whole point. A
    // stylesheet rule with normal importance cannot beat it.
    expect(document.documentElement.getAttribute('style')).toContain(
      'color-scheme: dark'
    );
  });

  it('sets the dark class on <html> as well', async () => {
    localStorage.setItem('nexstepper-theme', 'dark');
    render(
      <ThemeProvider>
        <div>content</div>
      </ThemeProvider>
    );
    await waitFor(() => {
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });
  });
});
