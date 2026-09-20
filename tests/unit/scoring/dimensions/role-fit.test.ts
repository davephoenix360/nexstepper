import { describe, expect, it, vi } from 'vitest';

import {
  scoreRoleFitParams,
  NEUTRAL_ROLE_FIT_SCORE
} from '@/lib/scoring/dimensions/role-fit';

/**
 * Locks the v2 Role Fit scoring dimension (sync surface).
 *
 * The async wrapper (`roleFitSimilarity` in `lib/scoring-async/`)
 * calls `@huggingface/transformers` — that's covered by
 * integration tests for the hybrid scorer + the smoke test in
 * `scripts/`. This file locks the pure-logic helper that turns a
 * pre-computed cosine similarity (in [0, 1]) into a 0-100 score.
 *
 * We also exercise the `roleFitSimilarity` async function with the
 * `semanticSimilarity` dependency mocked — keeps the test suite
 * fast (no model load) and deterministic (no network).
 */

import * as semanticSimilarityModule from '@/lib/scoring-async/semantic-similarity';
import { roleFitSimilarity } from '@/lib/scoring-async/role-fit';
import type { JobPosting, ResumeData } from '@/lib/resume-schema';

// ---------------------------------------------------------------------------
// scoreRoleFitParams — sync surface (canonical entry point)
// ---------------------------------------------------------------------------

describe('scoreRoleFitParams — sync scoring', () => {
  it('returns NEUTRAL when similarity is null (no JD title OR no resume titles)', () => {
    const result = scoreRoleFitParams({ similarity: null });
    expect(result.value).toBe(NEUTRAL_ROLE_FIT_SCORE);
    expect(result.fallback).toBe(true);
    expect(result.similarity).toBeNull();
  });

  it('maps similarity 0 to 0', () => {
    const result = scoreRoleFitParams({ similarity: 0 });
    expect(result.value).toBe(0);
    expect(result.fallback).toBe(false);
  });

  it('maps similarity 1 to 100', () => {
    const result = scoreRoleFitParams({ similarity: 1 });
    expect(result.value).toBe(100);
  });

  it('rounds cosine similarity in [0, 1] to nearest integer percent', () => {
    expect(scoreRoleFitParams({ similarity: 0.567 }).value).toBe(57);
    expect(scoreRoleFitParams({ similarity: 0.873 }).value).toBe(87);
  });

  it('does not clamp out-of-range values (those are caller errors)', () => {
    // 1.2 × 100 = 120. We don't guard against this — the pipeline
    // already maps cosine to [0, 1] upstream.
    expect(scoreRoleFitParams({ similarity: 1.2 }).value).toBe(120);
  });
});

// ---------------------------------------------------------------------------
// roleFitSimilarity — async wrapper (mocks the model)
// ---------------------------------------------------------------------------

function makeResume(overrides: Partial<ResumeData> = {}): ResumeData {
  return {
    name: 'Test Resume',
    note: '',
    status: 'draft',
    template: 'classic',
    jobContext: null,
    sections: {
      basics: {
        name: 'Jane Doe',
        label: 'Senior Engineer',
        email: '',
        phone: '',
        url: '',
        summary: '',
        location: {
          address: '',
          postalCode: '',
          city: '',
          countryCode: '',
          region: ''
        },
        profiles: []
      },
      work: [
        {
          company: 'Acme',
          location: '',
          url: '',
          description: '',
          positions: [
            { title: 'Senior Engineer', startDate: '', endDate: '', highlights: [] }
          ]
        }
      ],
      education: [],
      skills: [],
      projects: [],
      volunteer: [],
      awards: [],
      publications: [],
      certificates: [],
      languages: [],
      interests: [],
      references: [],
      ...overrides.sections
    },
    ...overrides
  } as ResumeData;
}

function makeJob(overrides: Partial<JobPosting> = {}): JobPosting {
  return {
    id: 'job-1',
    title: 'Senior Engineer',
    company: 'Stripe',
    location: 'Remote',
    description: 'Build payments.',
    requirements: [],
    niceToHaves: [],
    benefits: [],
    keywords: [],
    seniority: '',
    employmentType: '',
    source: 'paste',
    mustHaveSkills: [],
    niceToHaveSkills: [],
    implicitSkills: [],
    ...overrides
  } as JobPosting;
}

describe('roleFitSimilarity — async wrapper', () => {
  it('returns neutral when JD has no title', async () => {
    const result = await roleFitSimilarity(
      makeResume(),
      makeJob({ title: '' })
    );
    expect(result.fallback).toBe(true);
    expect(result.value).toBe(NEUTRAL_ROLE_FIT_SCORE);
    expect(result.bestSimilarity).toBeNull();
    expect(result.bestMatchingTitle).toBeNull();
  });

  it('returns neutral when resume has no work titles', async () => {
    const result = await roleFitSimilarity(
      makeResume({
        sections: { work: [], basics: { ...makeResume().sections.basics } }
      }),
      makeJob({ title: 'Senior Engineer' })
    );
    expect(result.fallback).toBe(true);
    expect(result.value).toBe(NEUTRAL_ROLE_FIT_SCORE);
  });

  it('returns the maximum similarity across all work titles', async () => {
    // Mock the semantic-similarity helper to return known values
    // for each (title, jdTitle) pair.
    const mockedSimilarity = vi.spyOn(semanticSimilarityModule, 'semanticSimilarity');
    mockedSimilarity
      .mockResolvedValueOnce(0.3) // Senior Engineer
      .mockResolvedValueOnce(0.7) // Backend Engineer
      .mockResolvedValueOnce(0.4); // Software Engineer

    const resume = makeResume({
      sections: {
        work: [
          {
            company: 'A',
            location: '',
            url: '',
            description: '',
            positions: [
              { title: 'Senior Engineer', startDate: '', endDate: '', highlights: [] },
              { title: 'Backend Engineer', startDate: '', endDate: '', highlights: [] },
              { title: 'Software Engineer', startDate: '', endDate: '', highlights: [] }
            ]
          }
        ]
      }
    });

    const result = await roleFitSimilarity(resume, makeJob({ title: 'Staff Engineer' }));
    expect(result.value).toBe(70);
    expect(result.bestSimilarity).toBe(0.7);
    expect(result.bestMatchingTitle).toBe('Backend Engineer');

    mockedSimilarity.mockRestore();
  });

  it('surfaces the best-matching resume title for the UI tooltip', async () => {
    const mockedSimilarity = vi.spyOn(semanticSimilarityModule, 'semanticSimilarity');
    mockedSimilarity.mockResolvedValue(0.6);

    const result = await roleFitSimilarity(makeResume(), makeJob({ title: 'Platform Engineer' }));
    expect(result.bestMatchingTitle).toBe('Senior Engineer');
    expect(result.jdTitle).toBe('Platform Engineer');
    expect(result.value).toBe(60);

    mockedSimilarity.mockRestore();
  });

  it('de-duplicates resume titles case-insensitively', async () => {
    // Two companies, both listing "Senior Engineer" — should only
    // call the model once for that title.
    const mockedSimilarity = vi.spyOn(semanticSimilarityModule, 'semanticSimilarity');
    mockedSimilarity.mockResolvedValue(0.5);

    const resume = makeResume({
      sections: {
        work: [
          {
            company: 'A',
            location: '',
            url: '',
            description: '',
            positions: [
              { title: 'Senior Engineer', startDate: '', endDate: '', highlights: [] }
            ]
          },
          {
            company: 'B',
            location: '',
            url: '',
            description: '',
            positions: [
              { title: 'SENIOR ENGINEER', startDate: '', endDate: '', highlights: [] }
            ]
          },
          {
            company: 'C',
            location: '',
            url: '',
            description: '',
            positions: [
              { title: 'senior engineer', startDate: '', endDate: '', highlights: [] }
            ]
          }
        ]
      }
    });

    await roleFitSimilarity(resume, makeJob({ title: 'Engineer' }));
    // Three identical roles but only ONE model call.
    expect(mockedSimilarity).toHaveBeenCalledTimes(1);

    mockedSimilarity.mockRestore();
  });

  it('falls back to neutral when the model call throws', async () => {
    const mockedSimilarity = vi.spyOn(semanticSimilarityModule, 'semanticSimilarity');
    mockedSimilarity.mockRejectedValue(new Error('model offline'));

    const result = await roleFitSimilarity(makeResume(), makeJob({ title: 'Engineer' }));
    // roleFitSimilarity surfaces the error as fallback.
    // (We could swallow and return neutral, but surfacing helps
    // debugging — the engine's purity invariant is unaffected
    // because this is in lib/scoring-async/.)
    expect(result.fallback).toBe(true);

    mockedSimilarity.mockRestore();
  });
});
