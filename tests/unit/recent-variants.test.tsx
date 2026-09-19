import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { RecentVariants } from '@/app/(dashboard)/dashboard/_components/recent-variants';
import type { Resume } from '@/lib/db/schema';

/**
 * Locks the dashboard home "Recent variants" panel shape (plan:
 * docs/plans/variant-first-ux.md §"Slice 4").
 *
 *   - The empty state appears when the user has no variants,
 *     pointing at the master library where the JD-based CTA lives.
 *   - Variants render as rows with name + status + updated-ago.
 *   - We cap the visible rows but show "X of Y recent variants"
 *     when the list overflows.
 *   - Each row links to the variant editor.
 */

const T0 = new Date('2026-09-18T10:00:00Z');
const T1 = new Date('2026-09-18T11:00:00Z');
const T2 = new Date('2026-09-17T09:00:00Z');

function makeVariant(overrides: Partial<Resume>): Resume {
  return {
    id: 'variant-id',
    userId: 'user-id',
    name: 'Variant',
    note: '',
    status: 'draft',
    template: 'classic',
    isMaster: false,
    parentResumeId: 'master-id',
    currentRevisionId: 'rev-id',
    shareTokenHash: null,
    shareEnabled: false,
    shareViewCount: 0,
    shareLastViewedAt: null,
    shareCreatedAt: null,
    createdAt: T0,
    updatedAt: T0,
    ...overrides
  } as Resume;
}

describe('RecentVariants', () => {
  it('shows an empty-state CTA when the user has no variants', () => {
    const html = renderToStaticMarkup(<RecentVariants variants={[]} />);
    expect(html).toContain('No variants yet');
    expect(html).toContain('Open resume library');
    expect(html).not.toContain('Showing');
  });

  it('renders up to 4 variants with no overflow hint', () => {
    const variants = [
      makeVariant({ id: 'v1', name: 'Stripe — Backend SWE', updatedAt: T0 }),
      makeVariant({ id: 'v2', name: 'Anthropic — ML Infra', updatedAt: T1 }),
      makeVariant({ id: 'v3', name: 'Vercel — DX', updatedAt: T2 })
    ];
    const html = renderToStaticMarkup(<RecentVariants variants={variants} />);
    expect(html).toContain('recent-variant-v1');
    expect(html).toContain('recent-variant-v2');
    expect(html).toContain('recent-variant-v3');
    expect(html).toContain('href="/dashboard/resumes/v1"');
    expect(html).not.toContain('Showing');
  });

  it('caps the list at 4 and shows the overflow hint', () => {
    const variants = Array.from({ length: 7 }, (_, i) =>
      makeVariant({
        id: `v-${i}`,
        name: `Variant ${i}`,
        updatedAt: new Date(T0.getTime() - i * 1_000)
      })
    );
    const html = renderToStaticMarkup(<RecentVariants variants={variants} />);
    // Visible rows
    expect(html).toContain('recent-variant-v-0');
    expect(html).toContain('recent-variant-v-3');
    expect(html).not.toContain('recent-variant-v-4');
    // Overflow hint
    expect(html).toContain('Showing 4 of 7 recent variants.');
  });

  it('surfaces the variant status badge', () => {
    const variants = [
      makeVariant({ id: 'v1', status: 'completed' }),
      makeVariant({ id: 'v2', status: 'draft' })
    ];
    const html = renderToStaticMarkup(<RecentVariants variants={variants} />);
    expect(html).toContain('Completed');
    expect(html).toContain('Draft');
  });
});