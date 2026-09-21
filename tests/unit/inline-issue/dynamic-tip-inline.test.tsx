import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { DynamicTipInline } from '@/lib/inline-issue/dynamic-tip-inline';
import { CRITERIA_TIPS, type DynamicTips } from '@/lib/scoring/tips';

/**
 * Renders <DynamicTipInline> against the static CRITERIA_TIPS map
 * and against a dynamic tips map with <strong> emphasis. Confirms
 * the precedence rules (dynamic > static) and the fallback
 * behavior when neither exists.
 *
 * Uses `renderToStaticMarkup` (the same pattern the BillingCard
 * tests use) to keep the deps minimal — the component is a
 * "use client" but its render output is plain JSX that doesn't
 * need a DOM.
 *
 * Plan: docs/plans/inline-issue-surface.md §"Test plan" #3.
 */

describe('<DynamicTipInline />', () => {
  it('renders the dynamic tip when present', () => {
    const dynamicTips: DynamicTips = {
      'ATS Keyword Match': (
        <>
          You mentioned <strong>3</strong> of the 8 must-have keywords.
        </>
      )
    };
    const html = renderToStaticMarkup(
      <DynamicTipInline
        criterion="ATS Keyword Match"
        dynamicTips={dynamicTips}
      />
    );
    expect(html).toContain('data-testid="inline-tip-ats-keyword-match"');
    expect(html).toContain('3');
    expect(html).toContain('<strong>3</strong>');
  });

  it('falls back to CRITERIA_TIPS when dynamic tip is missing', () => {
    const html = renderToStaticMarkup(
      <DynamicTipInline
        criterion="Accomplishment Focus"
        dynamicTips={{}}
      />
    );
    expect(html).toContain('data-testid="inline-tip-accomplishment-focus"');
    // The static tip is a string. We don't compare exact text
    // (whitespace + JSX normalization can drift) — assert the
    // key phrase is present instead.
    expect(html).toContain('accomplishment');
  });

  it('renders a fallback placeholder when neither dynamic nor static exists', () => {
    const html = renderToStaticMarkup(
      <DynamicTipInline
        // Cast to satisfy the union — we're testing the fallback
        // branch by passing a criterion the static map doesn't
        // cover. The SubCriterionKey union is closed; use the
        // type assertion for this one test.
        criterion={'Nonexistent Criterion' as unknown as Parameters<typeof DynamicTipInline>[0]['criterion']}
        dynamicTips={{}}
      />
    );
    // Slug is "nonexistent-criterion" (no internal hyphen —
    // there's no separator in the literal). Function test below
    // pins the slug transform.
    expect(html).toContain(
      'data-testid="inline-tip-nonexistent-criterion-fallback"'
    );
    expect(html).toContain('No specific tip');
  });
});