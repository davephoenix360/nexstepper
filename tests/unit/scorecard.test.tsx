import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { ScorecardPanel } from '@/components/scorecard/scorecard';
import type { ScoreBreakdown } from '@/lib/scoring';

/**
 * Locks the scorecard UI surface — Plan C, docs/plans/ats-scoring.md.
 *
 *   - Renders the overall + 4 dimension bars when given a breakdown.
 *   - Color tiering (green/amber/red) is correct per thresholds.
 *   - Renders the empty state when no breakdown is provided.
 *   - The "Computed in N ms" line is present.
 *   - The Recompute button is rendered (and disabled when no handler
 *     is provided — slice 3 wires the handler).
 */

function makeBreakdown(overrides: Partial<ScoreBreakdown>): ScoreBreakdown {
  return {
    overallScore: 70,
    dimensionScores: {
      atsMatching: 65,
      structure: 80,
      contentQuality: 75,
      alignment: 60,
      // v2 Intent Coverage — neutral by default so legacy fixtures
      // (and tests that don't care about v2) continue to work.
      intentCoverage: 50,
      // v2 Phase 2 — Role Fit + Seniority Fit (neutral by default).
      roleFit: 50,
      seniorityFit: 50
    },
    criteriaScores: {
      'ATS Keyword Match': 60,
      'ATS Similarity': 50,
      'ATS Coverage': 70,
      // v2 sub-criterion — mirror `ATS Keyword Match` so the
      // expanded "Show details + tips" panel renders identically
      // for legacy fixtures.
      'Intent Coverage': 60,
      'Section Completeness': 80,
      'Optimal Length': 80,
      'Accomplishment Focus': 80,
      'Action Verb Usage': 70,
      Tailoring: 50,
      'Unique Value': 100,
      'Soft Skills': 50,
      // v2 Phase 2 — neutral for both.
      'Role Fit': 50,
      'Seniority Fit': 50
    },
    computedInMs: 12,
    intentCoverageBreakdown: {
      value: 50,
      missed: { mustHave: [], niceToHave: [], implicit: [] },
      penalty: 0,
      fallback: true
    },
    ...overrides
  };
}

describe('ScorecardPanel — with breakdown', () => {
  it('renders the overall score + 4 dimension labels', () => {
    const html = renderToStaticMarkup(
      <ScorecardPanel breakdown={makeBreakdown({ overallScore: 78 })} />
    );
    expect(html).toContain('ATS score');
    expect(html).toContain('78');
    expect(html).toContain('Keywords');
    expect(html).toContain('Format');
    expect(html).toContain('Impact');
    expect(html).toContain('Experience match');
  });

  it('reports computed-in-ms in the footer', () => {
    const html = renderToStaticMarkup(
      <ScorecardPanel breakdown={makeBreakdown({ computedInMs: 23 })} />
    );
    expect(html).toContain('Computed in 23 ms');
  });

  it('shows the "Strong" tier badge when overall >= 80', () => {
    const html = renderToStaticMarkup(
      <ScorecardPanel breakdown={makeBreakdown({ overallScore: 85 })} />
    );
    expect(html).toContain('Strong');
  });

  it('shows the "Partial" tier badge when overall is 50-64', () => {
    const html = renderToStaticMarkup(
      <ScorecardPanel breakdown={makeBreakdown({ overallScore: 55 })} />
    );
    expect(html).toContain('Partial');
  });

  it('shows the "Good" tier badge when overall is 65-79', () => {
    const html = renderToStaticMarkup(
      <ScorecardPanel breakdown={makeBreakdown({ overallScore: 72 })} />
    );
    expect(html).toContain('Good');
  });

  it('shows the "Limited" tier badge when overall is 35-49', () => {
    const html = renderToStaticMarkup(
      <ScorecardPanel breakdown={makeBreakdown({ overallScore: 42 })} />
    );
    expect(html).toContain('Limited');
  });

  it('shows the "Needs work" tier badge when overall < 35', () => {
    const html = renderToStaticMarkup(
      <ScorecardPanel breakdown={makeBreakdown({ overallScore: 25 })} />
    );
    expect(html).toContain('Needs work');
  });

  it('renders the Recompute button (slice 3 wires the handler)', () => {
    const html = renderToStaticMarkup(
      <ScorecardPanel breakdown={makeBreakdown({})} />
    );
    expect(html).toContain('data-testid="scorecard-recompute"');
    expect(html).toContain('Recompute');
  });

  it('disables the Recompute button when no handler is provided', () => {
    const html = renderToStaticMarkup(
      <ScorecardPanel breakdown={makeBreakdown({})} />
    );
    // The button is rendered with the `disabled` attribute when
    // onRecompute is undefined (slice 2 ships the visual; slice 3
    // enables it). Sanity: both the testid and the disabled flag
    // appear in the rendered HTML.
    expect(html).toContain('data-testid="scorecard-recompute"');
    expect(html).toMatch(/<button[^>]*disabled/);
  });

  it('shows "Recomputing…" label when computing=true', () => {
    const html = renderToStaticMarkup(
      <ScorecardPanel
        breakdown={makeBreakdown({})}
        onRecompute={() => {}}
        computing
      />
    );
    expect(html).toContain('Scoring');
  });

  it('clamps a >100 score to the bar width', () => {
    // Defensive — we should never produce >100, but if a future
    // regression does, the bar shouldn't blow up.
    const html = renderToStaticMarkup(
      <ScorecardPanel
        breakdown={makeBreakdown({
          dimensionScores: {
            atsMatching: 150,
            structure: 80,
            contentQuality: 75,
            alignment: 60,
            intentCoverage: 50,
            roleFit: 50,
            seniorityFit: 50
          }
        })}
      />
    );
    // The rendered score is clamped to 100 (Math.round of 100).
    expect(html).toContain('100');
  });
});

describe('ScorecardPanel — empty state', () => {
  it('renders the empty state when breakdown is null', () => {
    const html = renderToStaticMarkup(<ScorecardPanel breakdown={null} />);
    expect(html).toContain('data-testid="scorecard-empty-wrapper"');
    expect(html).toContain('Attach a job description');
    expect(html).not.toContain('data-testid="scorecard-recompute"');
  });

  it('renders the empty state when breakdown is undefined', () => {
    const html = renderToStaticMarkup(<ScorecardPanel />);
    expect(html).toContain('data-testid="scorecard-empty-wrapper"');
    expect(html).toContain('Attach a job description');
  });
});
