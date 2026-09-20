import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { MissList } from '@/components/scorecard/miss-list';
import type { IntentCoverageBreakdown } from '@/lib/scoring/dimensions/intent-coverage';

/**
 * Locks the Phase 3 v2 per-skill miss list component.
 *
 * Coverage:
 *   - Empty state (no missed skills) renders the green "all clear" row.
 *   - Single-bucket (only must-have missed) renders just that bucket.
 *   - All three buckets render top-to-bottom by priority when populated.
 *   - Bucket count badge shows the truncated count.
 *   - Long lists (>20) get capped at the bucket limit per the
 *     dimension's `BUCKET_LIMIT` — the component itself slices, the
 *     dimension also slices; we test the component's slice.
 */

function makeBreakdown(
  overrides: Partial<IntentCoverageBreakdown> = {}
): IntentCoverageBreakdown {
  return {
    value: 70,
    penalty: 0,
    fallback: false,
    missed: {
      mustHave: [],
      niceToHave: [],
      implicit: [],
      ...(overrides.missed ?? {})
    },
    ...overrides
  };
}

describe('<MissList>', () => {
  it('renders the empty state when no buckets have entries', () => {
    const html = renderToStaticMarkup(
      <MissList breakdown={makeBreakdown()} />
    );
    expect(html).toContain('data-testid="miss-list-empty"');
    expect(html).toContain('All intent-extracted skills are covered');
  });

  it('renders only the must-have bucket when the other two are empty', () => {
    const html = renderToStaticMarkup(
      <MissList
        breakdown={makeBreakdown({
          missed: { mustHave: ['Terraform', 'Helm'], niceToHave: [], implicit: [] }
        })}
      />
    );
    expect(html).toContain('data-testid="miss-list"');
    expect(html).toContain('Must-have');
    expect(html).not.toContain('Nice-to-have');
    expect(html).not.toContain('Implicit');
    // 2 items rendered
    const itemMatches = html.match(/data-testid="miss-list-item"/g);
    expect(itemMatches?.length).toBe(2);
    expect(html).toContain('Terraform');
    expect(html).toContain('Helm');
  });

  it('renders all three buckets ordered by priority (must → nice → implicit)', () => {
    const html = renderToStaticMarkup(
      <MissList
        breakdown={makeBreakdown({
          missed: {
            mustHave: ['Kubernetes'],
            niceToHave: ['Docker'],
            implicit: ['Linux']
          }
        })}
      />
    );
    const mustIdx = html.indexOf('Must-have');
    const niceIdx = html.indexOf('Nice-to-have');
    const implIdx = html.indexOf('Implicit');
    expect(mustIdx).toBeGreaterThan(-1);
    expect(niceIdx).toBeGreaterThan(mustIdx);
    expect(implIdx).toBeGreaterThan(niceIdx);
  });

  it('caps the per-bucket render at 20 items (BucketSection slice)', () => {
    const oversized = Array.from({ length: 50 }, (_, i) => `Skill ${i}`);
    const html = renderToStaticMarkup(
      <MissList
        breakdown={makeBreakdown({
          missed: {
            mustHave: oversized,
            niceToHave: [],
            implicit: []
          }
        })}
      />
    );
    const itemMatches = html.match(/data-testid="miss-list-item"/g);
    expect(itemMatches?.length).toBe(20);
  });

  it('shows the truncated count in the bucket header', () => {
    const html = renderToStaticMarkup(
      <MissList
        breakdown={makeBreakdown({
          missed: {
            mustHave: ['A', 'B', 'C'],
            niceToHave: [],
            implicit: []
          }
        })}
      />
    );
    // Count badge next to "Must-have" header
    expect(html).toMatch(/Must-have[\s\S]*?>3</);
  });
});
