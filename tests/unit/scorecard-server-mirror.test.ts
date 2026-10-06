/**
 * Regression pin: when a job description is attached to a variant
 * resume (or replaced), `setVariantJobContextAction` calls
 * `revalidatePath` so the page Server Component re-renders with the
 * newly-computed `initialBreakdown` for `<ScorecardClient>`. The
 * client wrapper holds the breakdown in local `useState` so the
 * Recompute button can mutate it without a round-trip — but
 * `useState(prop)` only reads the prop on mount. If the wrapper does
 * not re-sync, the freshly-attached ATS score does not appear until
 * the user hard-refreshes the page.
 *
 * Same trap as `form.reset(initialData)` in
 * `components/editable/editable-resume.tsx` — see AGENTS.md
 * "Recurring traps" #1.
 *
 * Why source-level instead of behavioral
 *   The project's vitest config is `environment: 'node'` and uses
 *   `renderToStaticMarkup` for component tests (matches
 *   inline-rename.test.tsx, scorecard.test.tsx, jd-panel.test.tsx).
 *   Adding jsdom + @testing-library/react to assert the useEffect
 *   re-sync against a real DOM would be a much larger surface for one
 *   regression. We pin the structural invariant instead: the wrapper
 *   must have three useEffect calls whose setBreakdown / setDynamicTips /
 *   setMatchBreakdown bodies reference the right `initial*` prop.
 *   Drop one and this test fails.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SCORECARD_CLIENT_PATH = resolve(
  process.cwd(),
  'app/(dashboard)/dashboard/resumes/[id]/_components/scorecard-client.tsx'
);

function readScorecardClient(): string {
  return readFileSync(SCORECARD_CLIENT_PATH, 'utf8');
}

/**
 * Find every `useEffect(() => { ... }, [deps])` call in the file and
 * return the bodies + dep arrays. Tolerates arrow-form returns,
 * multi-line bodies, and trailing commas.
 *
 * We intentionally use a permissive regex — the goal is "did this
 * pattern exist", not "is this the prettiest possible form". A
 * future refactor that reformats the file shouldn't break the pin.
 */
type EffectMatch = { body: string; deps: string };

function findEffects(source: string): EffectMatch[] {
  const out: EffectMatch[] = [];
  const re = /useEffect\(\s*\(\)\s*=>\s*\{([\s\S]*?)\}\s*,\s*\[([^\]]*)\]\s*\)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    out.push({ body: match[1], deps: match[2] });
  }
  return out;
}

describe('ScorecardClient — server-rendered prop re-sync (useState trap #1)', () => {
  it('imports useEffect', () => {
    const src = readScorecardClient();
    expect(src, 'must import from react').toMatch(/from\s+['"]react['"]/);
    expect(src, 'must import useEffect from react').toMatch(
      /import\s*\{[^}]*\buseEffect\b[^}]*\}\s*from\s+['"]react['"]/
    );
  });

  it('re-syncs `breakdown` state when `initialBreakdown` prop changes', () => {
    const src = readScorecardClient();
    const effects = findEffects(src);
    const reSync = effects.find(
      (e) =>
        /setBreakdown\s*\(/.test(e.body) &&
        /initialBreakdown/.test(e.deps)
    );
    expect(
      reSync,
      'expected a useEffect that calls setBreakdown(initialBreakdown) ' +
        'with initialBreakdown in the dep array — without it, a freshly-' +
        'attached job description does not show the ATS score until the ' +
        'user hard-refreshes'
    ).toBeDefined();
  });

  it('re-syncs `dynamicTips` state when `initialDynamicTips` prop changes', () => {
    const src = readScorecardClient();
    const effects = findEffects(src);
    const reSync = effects.find(
      (e) =>
        /setDynamicTips\s*\(/.test(e.body) &&
        /initialDynamicTips/.test(e.deps)
    );
    expect(
      reSync,
      'expected a useEffect that calls setDynamicTips(initialDynamicTips) ' +
        'with initialDynamicTips in the dep array — paired with the score ' +
        'breakdown so the per-criterion improvement tips also refresh'
    ).toBeDefined();
  });

  it('re-syncs `matchBreakdown` state when `initialMatchBreakdown` prop changes', () => {
    const src = readScorecardClient();
    const effects = findEffects(src);
    const reSync = effects.find(
      (e) =>
        /setMatchBreakdown\s*\(/.test(e.body) &&
        /initialMatchBreakdown/.test(e.deps)
    );
    expect(
      reSync,
      'expected a useEffect that calls setMatchBreakdown(initialMatchBreakdown) ' +
        'with initialMatchBreakdown in the dep array — paired with the score ' +
        'breakdown so the inline-issue surface (Free vs Pro split) also refresh'
    ).toBeDefined();
  });
});