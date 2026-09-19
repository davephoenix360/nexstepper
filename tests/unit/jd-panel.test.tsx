import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { AtsScorecard } from '@/app/(dashboard)/dashboard/resumes/[id]/_components/ats-scorecard';
import type { JobPosting } from '@/lib/resume-schema';

/**
 * Locks the right-rail slot shape for Slice 2 of the variant-first
 * UX (plan: docs/plans/variant-first-ux.md §"Slice 2").
 *
 *   - The scorecard renders even with no JD so the right rail
 *     doesn't shift when the AI lands.
 *   - The four ATS dimensions are always listed in the same order
 *     (the future scoring algorithm slots in here).
 *   - When a JD IS attached, the panel hints that scoring is
 *     "next slice" instead of asking for one.
 */

const EMPTY_JD: JobPosting = {
  id: 'job-1',
  url: '',
  title: '',
  company: '',
  location: '',
  description: '',
  requirements: [],
  niceToHaves: [],
  benefits: [],
  keywords: [],
  seniority: '',
  employmentType: '',
  source: 'paste'
};

const ATTACHED_JD: JobPosting = {
  ...EMPTY_JD,
  title: 'Senior Backend Engineer',
  company: 'Stripe',
  location: 'Remote',
  description: 'Build the next generation of payment APIs.',
  keywords: ['typescript', 'rust', 'distributed systems']
};

describe('AtsScorecard', () => {
  it('renders the placeholder score of —', () => {
    const html = renderToStaticMarkup(
      <AtsScorecard jobContext={null} />
    );
    expect(html).toContain('ATS score');
    expect(html).toContain('Coming soon');
    expect(html).toContain('—');
  });

  it('lists the four ATS dimensions in locked order', () => {
    const html = renderToStaticMarkup(
      <AtsScorecard jobContext={null} />
    );
    const dims = [
      'Keywords',
      'Format',
      'Impact',
      'Experience match'
    ];
    let lastIdx = -1;
    for (const label of dims) {
      const idx = html.indexOf(label);
      expect(idx, `expected ${label} to appear`).toBeGreaterThan(-1);
      expect(idx).toBeGreaterThan(lastIdx);
      lastIdx = idx;
    }
  });

  it('asks the user to attach a JD when none is present', () => {
    const html = renderToStaticMarkup(
      <AtsScorecard jobContext={null} />
    );
    expect(html).toContain('Attach a job description');
  });

  it('hints at the next-slice scoring when a JD is attached', () => {
    const html = renderToStaticMarkup(
      <AtsScorecard jobContext={ATTACHED_JD} />
    );
    expect(html).toContain('Scoring lands in the next slice');
    expect(html).not.toContain('Attach a job description');
  });

  it('does not crash on an empty JobPosting (defaults-filled shape)', () => {
    const html = renderToStaticMarkup(
      <AtsScorecard jobContext={EMPTY_JD} />
    );
    expect(html).toContain('ATS score');
  });
});