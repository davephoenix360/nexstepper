import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The page-settings panel works (margin / line height / font size /
 * section spacing) — but only if the four CSS custom properties it
 * emits actually reach the on-screen editor AND the printed
 * `@page` rule.
 *
 * The custom properties are read by `:where(.printable)` and by
 * `@page { margin: var(--resume-margin) }` in globals.css. The mark
 * for "the vars are in scope" is therefore: the rendered template is
 * inside an element with class `printable` AND the four custom
 * properties are set on it as inline style.
 *
 * The user reported that "the page settings are not being applied"
 * — turned out the editor rendered the template bare, with no
 * `.printable` wrapper. The on-screen `:where(.printable)` rules
 * never matched, and the printed `@page` rule fell back to its
 * 0.4in default because the var was never set in the cascade.
 *
 * These are source-level assertions, not rendered output, because
 * the helper itself is fully tested in print-settings.test.ts and the
 * editor is a deep RHF-bound client component we can't drive in the
 * node test environment. What matters here is the wiring: the
 * editor's template is wrapped, the wrapper gets the vars, and the
 * page passes the settings through.
 */

const EDITOR = readFileSync(
  resolve(process.cwd(), 'components/editable/editable-resume.tsx'),
  'utf8'
);
const PAGE = readFileSync(
  resolve(
    process.cwd(),
    'app/(dashboard)/dashboard/resumes/[id]/page.tsx'
  ),
  'utf8'
);

describe('EditableResume: template is wrapped in .printable', () => {
  it('wraps the Template in a div with the printable class', () => {
    // The Template render is preceded by a div with class="printable"
    // so both the on-screen `:where(.printable)` rules and the
    // printed `@page` rule can find the CSS custom properties.
    expect(EDITOR).toMatch(/className="printable"/);
  });

  it('applies printSettingsToCssVars to that wrapper', () => {
    // The vars are set inline via the helper, not via a style
    // attribute that has to be hand-maintained.
    expect(EDITOR).toMatch(/printSettingsToCssVars\(/);
  });

  it('coerces the settings defensively before emitting vars', () => {
    // Missing / corrupt / stale-migrated JSONB must not crash the
    // editor; coercePrintSettings returns DEFAULT_PRINT_SETTINGS.
    expect(EDITOR).toMatch(/coercePrintSettings\(/);
  });

  it('reads printSettings from the new initialPrintSettings prop, not from inside the data blob', () => {
    // The actual code path is `coercePrintSettings(initialPrintSettings)`.
    // The buggy shape — `coercePrintSettings(initialData.printSettings)`
    // — must NOT appear. (We can't use `not.toMatch(/initialData\.printSettings/)`
    // because the source comment in this same file discusses that very
    // pattern as the bug; we anchor to the buggy call site instead.)
    expect(EDITOR).toMatch(/coercePrintSettings\(initialPrintSettings\)/);
    expect(EDITOR).not.toMatch(/coercePrintSettings\(initialData\.printSettings\)/);
  });
});

describe('page passes initialPrintSettings through', () => {
  it('forwards the coerced printSettings to EditableResume', () => {
    // The page already calls `coercePrintSettings(resume.printSettings)`
    // and passes it to PrintSettingsButton as initialSettings; it
    // must do the same for EditableResume.
    expect(PAGE).toMatch(/initialPrintSettings=\{printSettings\}/);
  });
});

describe('the regression is catchable', () => {
  it('re-introducing the bug (no .printable wrapper) fails this test', () => {
    // Pin the contract: removing `className="printable"` from the
    // wrapper would make the page-settings panel a UI dead-end
    // again. This is the "a test that encodes the bug" the repo
    // uses elsewhere (see tests/unit/favicon.test.ts).
    expect(EDITOR).toMatch(/className="printable"/);
    expect(EDITOR).toMatch(/style=\{printSettingsToCssVars\(/);
  });
});