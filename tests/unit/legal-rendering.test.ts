/**
 * Regression guards for the legal pages' rendering (2026-10-08).
 *
 * These exist because of a bug that survived review, survived a full
 * redesign, and was only caught by opening the page in a browser:
 *
 * **`@tailwindcss/typography` was never installed.** The policy pages
 * have always carried `prose prose-neutral dark:prose-invert` on their
 * article wrapper. With the plugin absent, every one of those classes
 * was an inert string — no-ops. So <h2> rendered at body size, <ul>
 * had no bullets, tables had no header styling, and there was no
 * vertical rhythm between sections. The pages looked broken in a way
 * that no amount of reading the JSX would reveal, because the JSX was
 * correct; the stylesheet was empty.
 *
 * The second bug: the legal `<main>` was capped at `max-w-3xl`
 * (768px), which silently overrode the two-column shell inside it and
 * squeezed the article to ~408px no matter what measure it requested.
 *
 * Both are cheap to reintroduce and hard to notice, so both are pinned.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const GLOBALS = readFileSync(resolve(process.cwd(), 'app/globals.css'), 'utf8');
const PACKAGE_JSON = JSON.parse(
  readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')
);
const SHELL = readFileSync(
  resolve(process.cwd(), 'app/(legal)/_components/policy-shell.tsx'),
  'utf8'
);
const LAYOUT = readFileSync(
  resolve(process.cwd(), 'app/(legal)/layout.tsx'),
  'utf8'
);

describe('Tailwind Typography is installed AND registered', () => {
  it('is a devDependency', () => {
    const deps = {
      ...(PACKAGE_JSON.dependencies ?? {}),
      ...(PACKAGE_JSON.devDependencies ?? {})
    };
    expect(Object.keys(deps)).toContain('@tailwindcss/typography');
  });

  it('is registered via @plugin in globals.css', () => {
    // Installed-but-unregistered is the exact failure mode that caused
    // this: the package resolves, the classes still do nothing.
    expect(GLOBALS).toContain('@plugin "@tailwindcss/typography"');
  });

  it('warns in the stylesheet not to remove the prose classes', () => {
    expect(GLOBALS).toMatch(/do not "clean up" the prose classes/i);
  });
});

describe('policy shell measure', () => {
  it('constrains the article width in rem, not ch', () => {
    // `70ch` resolved to ~370px because Manrope's "0" glyph is narrow.
    // A ch-based measure here silently produces a cramped ribbon.
    expect(SHELL).not.toMatch(/max-w-\[\d+ch\]/);
    expect(SHELL).toMatch(/max-w-\[\d+rem\]/);
  });

  it('overrides the prose plugin default width', () => {
    // `.prose` sets max-width: 65ch, which beat a plain max-w utility
    // on specificity. The `!` suffix is what actually applies the
    // intended measure — without it the column stays ~390px.
    expect(SHELL).toMatch(/max-w-\[\d+rem\]!/);
  });
});

describe('legal layout is not width-starved', () => {
  it('does not cap <main> at max-w-3xl', () => {
    // The old cap silently defeated the sidebar + prose grid, whatever
    // measure the shell asked for.
    expect(LAYOUT).not.toMatch(/<main[^>]*max-w-3xl/);
  });

  it('lets the shell own the width and padding', () => {
    expect(LAYOUT).toMatch(/<main className="w-full">/);
  });

  it('header aligns to the same container as the shell', () => {
    expect(LAYOUT).toMatch(/max-w-6xl/);
  });
});

describe('policy prose behaviour', () => {
  it('gives anchor targets scroll margin', () => {
    // Without this, clicking "4. Subprocessors" scrolls the heading
    // under the sticky header.
    expect(GLOBALS).toMatch(/scroll-margin-top/);
  });
});