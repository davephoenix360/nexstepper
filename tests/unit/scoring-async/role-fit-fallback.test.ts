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
    getSemanticError.mockReset();
    getSemanticError.mockReturnValue(null);
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
        // The headline is cleared too — a headline IS a title signal now
        // (see "compares against the headline" below), so leaving it in
        // would give this resume a title to match.
        basics: { ...RESUME.sections.basics, label: '' },
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

  it('compares against the headline as well as the work titles', async () => {
    // ## The bug this pins
    //
    // Role Fit collected **work position titles only**. The headline
    // (`basics.label`) — the line the candidate edited for THIS
    // application — was ignored by the one dimension that measures title
    // fit, even though it was in the ATS keyword blob.
    //
    // Measured against a JD titled "Senior Backend Engineer":
    //
    //   headline "Senior Backend Engineer", work titles "Data Analyst" → 65
    //   headline "Data Analyst", work titles "Senior Backend Engineer" → 100
    //
    // The candidate whose headline matched exactly scored LOWER.
    const headlineOnly = resumeDataSchema.parse({
      sections: {
        basics: { ...RESUME.sections.basics, label: 'Staff Platform Engineer' },
        work: [
          {
            company: 'Acme',
            location: '',
            url: '',
            description: '',
            positions: [
              {
                title: 'Data Analyst',
                startDate: '',
                endDate: '',
                highlights: []
              }
            ]
          }
        ]
      }
    });

    const result = await roleFitSimilarity(
      headlineOnly,
      job({ title: 'Staff Platform Engineer', roleFamily: 'Backend Engineer' })
    );

    expect(semanticSimilarity).toHaveBeenCalledWith(
      'Staff Platform Engineer',
      'Staff Platform Engineer'
    );
    expect(result.bestMatchingTitle).toBe('Staff Platform Engineer');
    expect(result.fallback).toBe(false);
  });

  it('does not compare the headline twice when it repeats a work title', async () => {
    // `RESUME` has the same string in both places. One embedding, not two.
    await roleFitSimilarity(
      RESUME,
      job({ title: 'Staff Platform Engineer', roleFamily: 'Backend Engineer' })
    );

    const calls = semanticSimilarity.mock.calls.filter(
      (call) => call[0] === 'Senior Software Engineer'
    );
    expect(calls).toHaveLength(1);
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

  it('reads the neutral score — not zero — when the model was unavailable', async () => {
    // `semanticSimilarity` swallows its own errors and returns 0. A
    // zero there means "could not measure", NOT "measured zero".
    //
    // This is not academic: when the embedding model was dead in
    // production, Role Fit read **0** — a flat, damning bar and a
    // silent 5-point penalty on every resume, for a dimension nobody
    // had measured. The neutral 50 is the honest answer, and the
    // scorecard's "keyword-only score" notice says why.
    semanticSimilarity.mockResolvedValue(0);
    getSemanticError.mockReturnValue(
      'Could not load the "sharp" module using the linux-x64 runtime'
    );

    const result = await roleFitSimilarity(
      RESUME,
      job({ title: '', roleFamily: 'Software Engineer' })
    );

    expect(result.value).toBe(NEUTRAL_ROLE_FIT_SCORE);
    expect(result.fallback).toBe(true);
  });

  it('keeps a genuine zero when the model worked and the titles are unrelated', async () => {
    // A real measurement of zero is still a real measurement.
    semanticSimilarity.mockResolvedValue(0);
    getSemanticError.mockReturnValue(null);

    const result = await roleFitSimilarity(
      RESUME,
      job({ title: '', roleFamily: 'Software Engineer' })
    );

    expect(result.value).toBe(0);
    expect(result.fallback).toBe(false);
  });
});
