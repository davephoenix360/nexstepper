/**
 * Source-pin regression test for the dashboard layout auth gate
 * (Oct 2026).
 *
 * Before the gate, an unauthed visitor to `/dashboard` saw the
 * dashboard chrome (sidebar + user menu) for a moment while the
 * page RSC re-rendered the redirect. The layout now calls
 * `getUser()` and `redirect('/sign-in')` BEFORE rendering the
 * shell, so the chrome never paints for an anonymous visitor.
 *
 * Source-pin rather than render-test: `redirect()` throws a
 * special `NEXT_REDIRECT` error to drive the navigation, which
 * is hard to capture cleanly without spinning up a real Next
 * runtime. The contract is "the gate is there" — the visible
 * bug is "the gate is missing", and the only way to verify it's
 * not missing is to confirm the source contains the check.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const LAYOUT_SOURCE = readFileSync(
  join(process.cwd(), 'app/(dashboard)/layout.tsx'),
  'utf8'
);

describe('Dashboard layout — auth gate', () => {
  it('imports getUser from the queries module', () => {
    expect(LAYOUT_SOURCE).toMatch(
      /import\s*\{[^}]*\bgetUser\b[^}]*\}\s*from\s*['"]@\/lib\/db\/queries['"]/
    );
  });

  it('imports redirect from next/navigation', () => {
    expect(LAYOUT_SOURCE).toMatch(
      /import\s*\{[^}]*\bredirect\b[^}]*\}\s*from\s*['"]next\/navigation['"]/
    );
  });

  it('calls getUser() and redirects to /sign-in when there is no user', () => {
    // The check + redirect must be UNCONDITIONAL (not gated on
    // some other condition) and must happen BEFORE the shell
    // renders, so the dashboard chrome (sidebar + user menu)
    // never paints for an anonymous visitor.
    expect(LAYOUT_SOURCE).toMatch(/await\s+getUser\s*\(\s*\)/);
    expect(LAYOUT_SOURCE).toMatch(
      /if\s*\(\s*!user\s*\)\s*\{[\s\S]*?redirect\s*\(\s*['"]\/sign-in['"]\s*\)/
    );
  });

  it('does not render the shell for unauthed visitors (gate precedes the shell)', () => {
    // The redirect call must come textually BEFORE the
    // `<DashboardShell>` JSX so an exception in `redirect()`
    // (the way Next.js implements redirects) aborts the render
    // before the shell paints. We anchor on the JSX rendering
    // site (`return (` followed by `<DashboardShell`) to avoid
    // matching the same string inside the JSDoc comment that
    // documents this contract.
    const redirectIdx = LAYOUT_SOURCE.search(
      /if\s*\(\s*!user\s*\)\s*\{[\s\S]*?redirect\s*\(\s*['"]\/sign-in['"]\s*\)/
    );
    const shellIdx = LAYOUT_SOURCE.search(/return\s*\(\s*<DashboardShell/);
    expect(redirectIdx).toBeGreaterThan(-1);
    expect(shellIdx).toBeGreaterThan(-1);
    expect(redirectIdx).toBeLessThan(shellIdx);
  });
});
