/**
 * Role Fit has to have something to measure.
 *
 * ## The bug this pins
 *
 * Role Fit is the dimension that compares the JD's title with the
 * candidate's work titles. It scored the neutral 50 for **every resume
 * in production** — not because the titles didn't match, but because
 * **the JD had no title to compare with**.
 *
 * The chain:
 *
 *   1. `createVariantFromJdAction` builds the `JobPosting` envelope
 *      from the raw JD text plus the intent extractor's output. The
 *      comment said "the future parser will overwrite title/company/
 *      keywords" — the future never arrived.
 *   2. The JD panel's save action (`setVariantJobContextAction`) set
 *      `title: existingJobContext?.title ?? ''` — which is also empty,
 *      because nothing ever wrote one.
 *   3. `roleFitSimilarity` returns the neutral 50 when
 *      `job.title` is empty.
 *
 * So the dimension was a flat bar for every user, forever, and the
 * scorecard showed it as a dimension. Verified against production:
 * every JD on the account had `jobContext.title = ''`.
 *
 * `job.roleFamily` — "Full Stack Engineer", "Software Engineer" — was
 * extracted and stored all along, and the storage schema has always
 * documented it as the Role Fit fallback. It was never wired up.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

const semanticSimilarity = vi.hoisted(() => vi.fn());
const resetSemanticError = vi.hoisted(() => vi.fn());
const getSemanticError = vi.hoisted(() => vi.fn(() => null as string | null));

vi.mock('@/lib/scoring-async/semantic-similarity', () => ({
  semanticSimilarity,
  resetSemanticError,
  getSemanticError
}));

import {
  roleFitSimilarity,
  NEUTRAL_ROLE_FIT_SCORE
} from '@/lib/scoring-async/role-fit';
import { jobPostingSchema, resumeDataSchema } from '@/lib/resume-schema';

const RESUME = resumeDataSchema.parse({
  sections: {
    basics: {
      name: 'Jordan Ellis',
      label: 'Senior Software Engineer',
      email: 'jordan@example.com',
      phone: '',
      url: '',
      summary: 'Software engineer.',
      location: {
        address: '',
        postalCode: '',
        city: '',
        region: '',
        country: ''
      }
    },
    work: [
      {
        company: 'Halcyon Systems',
        location: 'Seattle',
        url: '',
        description: '',
        positions: [
          {
            title: 'Senior Software Engineer',
            startDate: '2022-03-01',
            endDate: '',
            highlights: ['Built things.']
          }
        ]
      }
    ]
  }
});

function job(overrides: Record<string, unknown> = {}) {
  return jobPostingSchema.parse({
    id: 'job-1',
    description: 'A job posting.',
    source: 'paste',
    ...overrides
  });
}

describe('roleFitSimilarity', () => {
  beforeEach(() => {
    semanticSimilarity.mockReset();
    semanticSimilarity.mockResolvedValue(0.72);
  });

  it('measures against the JD title when there is one', async () => {
    const result = await roleFitSimilarity(
      RESUME,
      job({ title: 'Staff Platform Engineer', roleFamily: 'Backend Engineer' })
    );

    expect(semanticSimilarity).toHaveBeenCalledWith(
      'Senior Software Engineer',
      'Staff Platform Engineer'
    );
    expect(result.value).toBe(72);
    expect(result.fallback).toBe(false);
  });

  it('falls back to the role family when the JD has no title', async () => {
    // The production case: `title` is empty for every JD attached
    // through the product, but `roleFamily` is always extracted.
    const result = await roleFitSimilarity(
      RESUME,
      job({ title: '', roleFamily: 'Software Engineer' })
    );

    expect(semanticSimilarity).toHaveBeenCalledWith(
      'Senior Software Engineer',
      'Software Engineer'
    );
    expect(result.value).toBe(72);
    expect(result.fallback).toBe(false);
    expect(result.bestMatchingTitle).toBe('Senior Software Engineer');
  });

  it('still returns the neutral score when neither a title nor a role family exists', async () => {
    const result = await roleFitSimilarity(
      RESUME,
      job({ title: '', roleFamily: null })
    );

    expect(semanticSimilarity).not.toHaveBeenCalled();
    expect(result.value).toBe(NEUTRAL_ROLE_FIT_SCORE);
    expect(result.fallback).toBe(true);
  });

  it('returns the neutral score when the resume has no work titles', async () => {
    const noTitles = resumeDataSchema.parse({
      sections: {
        basics: RESUME.sections.basics,
        work: [
          {
            company: 'Acme',
            location: '',
            url: '',
            description: '',
            positions: [
              { title: '', startDate: '', endDate: '', highlights: [] }
            ]
          }
        ]
      }
    });

    const result = await roleFitSimilarity(
      noTitles,
      job({ title: '', roleFamily: 'Software Engineer' })
    );

    expect(result.value).toBe(NEUTRAL_ROLE_FIT_SCORE);
    expect(result.fallback).toBe(true);
  });

  it('degrades to the neutral score when the model call throws', async () => {
    semanticSimilarity.mockRejectedValue(new Error('model offline'));

    const result = await roleFitSimilarity(
      RESUME,
      job({ title: '', roleFamily: 'Software Engineer' })
    );

    expect(result.value).toBe(NEUTRAL_ROLE_FIT_SCORE);
    expect(result.fallback).toBe(true);
  });
});
