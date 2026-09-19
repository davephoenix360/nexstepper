import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import * as React from 'react';

import { ResumeList } from '@/app/(dashboard)/dashboard/resumes/_components/resume-list';
import type { ResumeFamily } from '@/lib/db/queries';
import type { Resume } from '@/lib/db/schema';

/**
 * Locks the shape of the variant-first UX list view (plan:
 * docs/plans/variant-first-ux.md §"First slice").
 *
 *   - Masters render as "library cards" with name + variant count.
 *   - Variants render as rows nested under their master, each linking
 *     to the variant editor at /dashboard/resumes/<id>.
 *   - Empty families (no children) hide the variant list.
 *   - Masters and variants get distinct data-testid hooks so
 *     Playwright / future browser tests can target them.
 *
 * SSR (no jsdom) is enough — we only assert markup shape. We inject
 * a plain `<a>` Link and a stub actions render prop so the test
 * never has to mount Next's app router or import the real
 * `useRouter`-based CreateVariantButton.
 */

const T0 = new Date('2026-09-18T10:00:00Z');
const T1 = new Date('2026-09-18T11:00:00Z');
const T2 = new Date('2026-09-17T09:00:00Z');

function makeResume(overrides: Partial<Resume>): Resume {
  return {
    id: 'resume-id',
    userId: 'user-id',
    name: 'Untitled',
    note: '',
    status: 'draft',
    template: 'classic',
    isMaster: false,
    parentResumeId: null,
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

/** Plain <a> stub that satisfies the Link render-prop signature. */
const StubLink = (
  props: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    children?: React.ReactNode;
  }
) => <a {...props} />;

function render(families: ResumeFamily[]): string {
  return renderToStaticMarkup(
    <ResumeList
      families={families}
      renderLink={StubLink as never}
      renderVariantActions={(masterId) => (
        <span data-testid={`actions-${masterId}`}>actions</span>
      )}
    />
  );
}

describe('ResumeList', () => {
  it('returns null when there are no families', () => {
    expect(render([])).toBe('');
  });

  it('renders masters as library cards and omits the variant list when empty', () => {
    const html = render([
      {
        master: makeResume({
          id: 'master-1',
          name: 'Senior Engineer — General',
          isMaster: true,
          updatedAt: T0
        }),
        variants: []
      }
    ]);

    expect(html).toContain('data-testid="master-card-master-1"');
    expect(html).toContain('Senior Engineer — General');
    expect(html).toContain('No variants yet');
    // The master card itself stays, but no variant rows.
    expect(html).not.toContain('variant-row-');
    // The injected actions slot is rendered for every master.
    expect(html).toContain('data-testid="actions-master-1"');
  });

  it('renders each variant as a row nested under its master', () => {
    const html = render([
      {
        master: makeResume({
          id: 'master-1',
          name: 'Master Resume',
          isMaster: true,
          updatedAt: T0
        }),
        variants: [
          makeResume({
            id: 'variant-1',
            name: 'Stripe — Backend SWE',
            isMaster: false,
            parentResumeId: 'master-1',
            status: 'completed',
            updatedAt: T1
          }),
          makeResume({
            id: 'variant-2',
            name: 'Anthropic — ML Infra',
            isMaster: false,
            parentResumeId: 'master-1',
            status: 'draft',
            updatedAt: T2
          })
        ]
      }
    ]);

    // Variant count uses plural.
    expect(html).toContain('2 variants');

    // Variant rows link to the variant editor (via the stub <a>).
    expect(html).toContain('data-testid="variant-row-variant-1"');
    expect(html).toContain('href="/dashboard/resumes/variant-1"');
    expect(html).toContain('Stripe — Backend SWE');

    expect(html).toContain('data-testid="variant-row-variant-2"');
    expect(html).toContain('href="/dashboard/resumes/variant-2"');
    expect(html).toContain('Anthropic — ML Infra');

    // Each variant surfaces its status badge.
    expect(html).toContain('Completed');
    expect(html).toContain('Draft');
  });

  it('groups variants under the right master when there are multiple families', () => {
    const html = render([
      {
        master: makeResume({ id: 'master-a', name: 'Resume A', isMaster: true }),
        variants: [
          makeResume({
            id: 'variant-a1',
            name: 'A1',
            parentResumeId: 'master-a'
          })
        ]
      },
      {
        master: makeResume({ id: 'master-b', name: 'Resume B', isMaster: true }),
        variants: [
          makeResume({
            id: 'variant-b1',
            name: 'B1',
            parentResumeId: 'master-b'
          }),
          makeResume({
            id: 'variant-b2',
            name: 'B2',
            parentResumeId: 'master-b'
          })
        ]
      }
    ]);

    // master-a should only have variant-a1.
    const cardAStart = html.indexOf('data-testid="master-card-master-a"');
    const cardAEnd = html.indexOf('data-testid="master-card-master-b"');
    const cardA = html.slice(cardAStart, cardAEnd);

    expect(cardA).toContain('variant-row-variant-a1');
    expect(cardA).not.toContain('variant-row-variant-b1');

    // master-b should have b1 + b2, but not a1.
    const cardB = html.slice(cardAEnd);
    expect(cardB).toContain('variant-row-variant-b1');
    expect(cardB).toContain('variant-row-variant-b2');
    expect(cardB).not.toContain('variant-row-variant-a1');
  });

  it('uses singular "variant" when the master has exactly one', () => {
    const html = render([
      {
        master: makeResume({ id: 'master-1', name: 'Solo', isMaster: true }),
        variants: [
          makeResume({ id: 'variant-1', parentResumeId: 'master-1' })
        ]
      }
    ]);
    expect(html).toContain('1 variant');
    expect(html).not.toContain('1 variants');
  });
});