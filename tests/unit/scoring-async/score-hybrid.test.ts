import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock the hybrid similarity module BEFORE importing the wrapper.
// The wrapper imports `hybridSimilarity`; we replace it with a
// deterministic stub so the test asserts the wrapper's substitution
// + recompute logic without going through BM25 + transformers.
const mockHybrid = vi.fn();
vi.mock('@/lib/scoring-async/hybrid-similarity', () => ({
  hybridSimilarity: (...args: unknown[]) => mockHybrid(...args)
}));

import { scoreResumeHybridFromEnvelope } from '@/lib/scoring-async/score-hybrid';
import type { ResumeData, JobPosting } from '@/lib/resume-schema';

/**
 * A minimal-but-valid `ResumeData` envelope. We only need the
 * text-bearing fields the engine actually reads; the rest can be
 * empty arrays / empty strings.
 */
const SAMPLE_RESUME = {
  sections: {
    basics: {
      name: 'Jane Doe',
      label: 'Senior Engineer',
      email: '',
      phone: '',
      url: '',
      summary:
        'Senior TypeScript engineer with 8 years building React and Node applications on AWS.',
      location: { address: '', postalCode: '', city: '', countryCode: '', region: '' },
      profiles: []
    },
    work: [
      {
        company: 'Acme',
        location: '',
        url: '',
        description: 'Platform team',
        positions: [
          {
            title: 'Staff Engineer',
            startDate: '2020-01',
            endDate: 'present',
            highlights: [
              'Built the payments platform serving 12M users on AWS'
            ]
          }
        ]
      }
    ],
    education: [],
    skills: [
      { name: 'Languages', level: 'expert', keywords: ['typescript', 'python'] }
    ],
    projects: [],
    volunteer: [],
    awards: [],
    publications: [],
    certificates: [],
    languages: [],
    interests: [],
    references: []
  },
  name: 'Test resume',
  note: '',
  status: 'draft',
  template: 'classic'
} as unknown as ResumeData;

const SAMPLE_JOB = {
  id: 'job-1',
  title: 'Senior TypeScript Engineer',
  company: 'Stripe',
  location: 'Remote',
  description: 'Build payments platforms with React and Node on AWS.',
  requirements: ['5+ years TypeScript', 'AWS experience'],
  niceToHaves: [],
  benefits: [],
  keywords: ['typescript', 'react'],
  seniority: '',
  employmentType: '',
  source: 'paste',
  capturedAt: '2026-01-01T00:00:00.000Z'
} as unknown as JobPosting;

describe('scoreResumeHybridFromEnvelope', () => {
  beforeEach(() => {
    mockHybrid.mockReset();
  });

  it('replaces ONLY the ATS Similarity sub-criterion with the hybrid value', async () => {
    mockHybrid.mockResolvedValue(0.85); // [0, 1]; multiplied by 100 → 85
    const hybrid = await scoreResumeHybridFromEnvelope(SAMPLE_RESUME, SAMPLE_JOB);

    // The hybrid sub-score MUST be the new value × 100, not the BM25 value.
    expect(hybrid.criteriaScores['ATS Similarity']).toBeCloseTo(85, 5);

    // Every other criterion MUST equal the sync engine's output for
    // the same inputs (proves we're only substituting one sub-criterion).
    // We can't compare directly without calling the sync engine, but
    // we can verify the wrapper does NOT change other criteria by
    // inspecting that it goes through scoreResumeFromEnvelope (covered
    // by the immutability test below).
  });

  it('preserves the other sub-criteria values from the sync engine (immutability check)', async () => {
    mockHybrid.mockResolvedValue(0.5);

    // Capture the sync engine's output as the ground truth.
    const { scoreResumeFromEnvelope } = await import('@/lib/scoring');
    const sync = scoreResumeFromEnvelope(SAMPLE_RESUME, SAMPLE_JOB);

    const hybrid = await scoreResumeHybridFromEnvelope(SAMPLE_RESUME, SAMPLE_JOB);

    // Every criterion EXCEPT 'ATS Similarity' must match.
    const criteria = hybrid.criteriaScores;
    const syncCriteria = sync.criteriaScores;
    expect(criteria['ATS Keyword Match']).toBe(syncCriteria['ATS Keyword Match']);
    expect(criteria['ATS Coverage']).toBe(syncCriteria['ATS Coverage']);
    expect(criteria['Section Completeness']).toBe(syncCriteria['Section Completeness']);
    expect(criteria['Optimal Length']).toBe(syncCriteria['Optimal Length']);
    expect(criteria['Accomplishment Focus']).toBe(syncCriteria['Accomplishment Focus']);
    expect(criteria['Action Verb Usage']).toBe(syncCriteria['Action Verb Usage']);
    expect(criteria.Tailoring).toBe(syncCriteria.Tailoring);
    expect(criteria['Unique Value']).toBe(syncCriteria['Unique Value']);
    expect(criteria['Soft Skills']).toBe(syncCriteria['Soft Skills']);
    // The one we explicitly substituted:
    expect(criteria['ATS Similarity']).not.toBe(syncCriteria['ATS Similarity']);
  });

  it('preserves the structure / contentQuality / alignment dimension values from the sync engine', async () => {
    mockHybrid.mockResolvedValue(0.5);

    const { scoreResumeFromEnvelope } = await import('@/lib/scoring');
    const sync = scoreResumeFromEnvelope(SAMPLE_RESUME, SAMPLE_JOB);

    const hybrid = await scoreResumeHybridFromEnvelope(SAMPLE_RESUME, SAMPLE_JOB);

    expect(hybrid.dimensionScores.structure).toBe(sync.dimensionScores.structure);
    expect(hybrid.dimensionScores.contentQuality).toBe(sync.dimensionScores.contentQuality);
    expect(hybrid.dimensionScores.alignment).toBe(sync.dimensionScores.alignment);
    // atsMatching MUST differ (it's recomputed from the substituted
    // similarity sub-score).
    expect(hybrid.dimensionScores.atsMatching).not.toBe(sync.dimensionScores.atsMatching);
  });

  it('recomputes the atsMatching dimension value using the new similarity score', async () => {
    mockHybrid.mockResolvedValue(1.0); // hybrid = 1.0 → similarityScore = 100

    const { scoreResumeFromEnvelope } = await import('@/lib/scoring');
    const sync = scoreResumeFromEnvelope(SAMPLE_RESUME, SAMPLE_JOB);

    const hybrid = await scoreResumeHybridFromEnvelope(SAMPLE_RESUME, SAMPLE_JOB);

    // Recompute the dimension manually using the wrapper's formula:
    //   atsMatching = 0.6 × keyword + 0.2 × similarity + 0.2 × coverage
    const expected =
      0.6 * sync.criteriaScores['ATS Keyword Match'] +
      0.2 * 100 +
      0.2 * sync.criteriaScores['ATS Coverage'];
    expect(hybrid.dimensionScores.atsMatching).toBeCloseTo(expected, 5);
  });

  it('uses re-normalized weights (0.75 / 0.25 / 0) when the JD has no requirements', async () => {
    mockHybrid.mockResolvedValue(0.5); // similarityScore = 50
    const jdNoReqs = { ...SAMPLE_JOB, requirements: [] } as JobPosting;

    const { scoreResumeFromEnvelope } = await import('@/lib/scoring');
    const sync = scoreResumeFromEnvelope(SAMPLE_RESUME, jdNoReqs);

    const hybrid = await scoreResumeHybridFromEnvelope(SAMPLE_RESUME, jdNoReqs);

    // When JD has zero requirements, the sync engine uses
    // keyword=0.75, similarity=0.25, coverage=0. The wrapper
    // MUST mirror that.
    const expected =
      0.75 * sync.criteriaScores['ATS Keyword Match'] +
      0.25 * 50 +
      0 * sync.criteriaScores['ATS Coverage'];
    expect(hybrid.dimensionScores.atsMatching).toBeCloseTo(expected, 5);
  });

  it('recomputes the overallScore from the new atsMatching + unchanged others', async () => {
    mockHybrid.mockResolvedValue(1.0); // similarityScore = 100

    const hybrid = await scoreResumeHybridFromEnvelope(SAMPLE_RESUME, SAMPLE_JOB);

    const expectedOverall =
      0.3 * hybrid.dimensionScores.atsMatching +
      0.2 * hybrid.dimensionScores.structure +
      0.3 * hybrid.dimensionScores.contentQuality +
      0.2 * hybrid.dimensionScores.alignment;
    expect(hybrid.overallScore).toBe(Math.round(expectedOverall));
  });

  it('higher hybrid similarity → higher overall score (monotonicity)', async () => {
    mockHybrid.mockResolvedValue(0.1);
    const low = await scoreResumeHybridFromEnvelope(SAMPLE_RESUME, SAMPLE_JOB);
    mockHybrid.mockResolvedValue(0.9);
    const high = await scoreResumeHybridFromEnvelope(SAMPLE_RESUME, SAMPLE_JOB);

    // The overallScore rounds to an integer, so we compare the
    // pre-round dimension values for a cleaner assertion.
    expect(high.dimensionScores.atsMatching).toBeGreaterThan(
      low.dimensionScores.atsMatching
    );
  });

  it('passes the resume + job to hybridSimilarity exactly once per call', async () => {
    mockHybrid.mockResolvedValue(0.5);
    await scoreResumeHybridFromEnvelope(SAMPLE_RESUME, SAMPLE_JOB);
    expect(mockHybrid).toHaveBeenCalledTimes(1);
  });

  it('returns a non-negative computedInMs (the sync engine measurement)', async () => {
    mockHybrid.mockResolvedValue(0.5);
    const hybrid = await scoreResumeHybridFromEnvelope(SAMPLE_RESUME, SAMPLE_JOB);
    // The wrapper re-uses the sync engine's `scoreResume` call and
    // surfaces its wall-clock measurement. The async semantic cost
    // is intentionally NOT surfaced — the user-facing label is the
    // pure-scoring time, not the I/O time. We only assert
    // non-negative + finite (performance.now() can produce tiny
    // noise values on warm runs).
    expect(hybrid.computedInMs).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(hybrid.computedInMs)).toBe(true);
  });
});
