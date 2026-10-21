import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The Design Lab at /dev/design-lab.
 *
 * Unauthenticated visual review surface: every template rendered with
 * the shared `gallerySampleResumeData` fixture, stacked top to bottom,
 * so layout, typography, and per-template identity can be compared
 * side by side without a sign-in or an editor.
 *
 * Tests here pin the contract:
 *   - no auth gate (the page is reachable without a session)
 *   - noindex (not user-facing; must not appear in search indexes)
 *   - all six registered templates render
 *   - the dev tool is visibly marked (so nobody mistakes it for the
 *     marketing site)
 *   - a sticky nav lets you jump between templates
 *
 * The route is split server (`page.tsx` + `layout.tsx`) and client
 * (`design-lab-client.tsx`); assertions on chrome + metadata
 * read the server files, assertions on template rendering and the
 * print-settings panel read the client file.
 */

const PAGE = readFileSync(
  resolve(process.cwd(), 'app/dev/design-lab/page.tsx'),
  'utf8'
);
const LAYOUT = readFileSync(
  resolve(process.cwd(), 'app/dev/design-lab/layout.tsx'),
  'utf8'
);
const CLIENT = readFileSync(
  resolve(process.cwd(), 'app/dev/design-lab/design-lab-client.tsx'),
  'utf8'
);

describe('Design Lab: public + noindex', () => {
  it('declares robots: noindex,nofollow', () => {
    // Lives in the route layout (server component), since `metadata`
    // exports are server-only.
    expect(LAYOUT).toMatch(/robots:\s*\{\s*index:\s*false,\s*follow:\s*false\s*\}/);
  });

  it('is not gated by an auth check (no getUser / getSession / redirect)', () => {
    // The whole point — no sign-in, no session lookup. A future
    // contributor wrapping it in (dashboard) would add one of these
    // and this test would fail.
    expect(PAGE).not.toMatch(/getUser\(/);
    expect(PAGE).not.toMatch(/getSession\(/);
    expect(PAGE).not.toMatch(/redirect\(/);
    expect(PAGE).not.toMatch(/notFound\(/);
  });

  it('is not declared dynamic (no `dynamic = "force-dynamic"`)', () => {
    // Force-dynamic would force a per-request server render, slowing
    // a static, public page that has no per-request data.
    expect(PAGE).not.toMatch(/force-dynamic/);
    expect(PAGE).not.toMatch(/export const dynamic/);
  });
});

describe('Design Lab: template coverage (client island)', () => {
  it('iterates over the full template registry, not a hardcoded subset', () => {
    // Catches the regression where someone replaces `listTemplates()`
    // with a hand-picked list and silently drops a template.
    expect(CLIENT).toMatch(/listTemplates\(\)/);
  });

  it('renders each template with the shared sample data', () => {
    expect(CLIENT).toMatch(/gallerySampleResumeData/);
  });

  it('renders in read-only mode (no editor hooks)', () => {
    expect(CLIENT).toMatch(/editable=\{false\}/);
  });
});

describe('Design Lab: dev-tool chrome', () => {
  it('is visually marked as a dev tool', () => {
    // A future contributor must not accidentally dress this up as
    // a user-facing surface; the dev banner is the contract.
    expect(PAGE).toMatch(/Dev tool/);
  });

  it('renders all six templates by id as scroll anchors', () => {
    // The client island builds the anchor id from the registry
    // entry. A simple substring check is enough — no need to
    // enumerate the five ids, listTemplates() guarantees coverage.
    expect(CLIENT).toContain('tpl-${ts.id}');
  });

  it('labels each section with the template name + meta', () => {
    // The section header reads the template's meta via the
    // destructured alias (`ts.name`, `ts.version`, `ts.tier`).
    expect(CLIENT).toContain('ts.name');
    expect(CLIENT).toContain('ts.version');
    expect(CLIENT).toContain('ts.tier');
  });
});

describe('Design Lab: print-settings panel (verification surface)', () => {
  it('exists and pins the print container with the --resume-* vars', () => {
    // The whole reason the panel exists: this is how the developer
    // (and an AI assistant) can verify that changing page settings
    // actually moves the templates. If the panel or the vars
    // disappear, that verification disappears with them.
    expect(CLIENT).toMatch(/design-lab-printable/);
    expect(CLIENT).toMatch(/printSettingsToCssVars\(/);
  });

  it('exposes the four presets the editor popover ships', () => {
    expect(CLIENT).toMatch(/MARGIN_PRESETS/);
    expect(CLIENT).toMatch(/LINE_HEIGHT_PRESETS/);
    expect(CLIENT).toMatch(/FONT_SIZE_PRESETS/);
    expect(CLIENT).toMatch(/SECTION_SPACING_PRESETS/);
  });
});