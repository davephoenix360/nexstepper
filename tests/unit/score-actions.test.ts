import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock 'server-only' before importing the action (test runtime is
// not a Next.js request handler).
vi.mock('server-only', () => ({}));

// Mock Better Auth so we can script the session in each test.
const mockSession = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: () => mockSession()
    }
  }
}));

// Mock the DB layer so we can script ownership + data shape.
const mockGetResume = vi.fn();
vi.mock('@/lib/db/queries', () => ({
  getResume: (...args: unknown[]) => mockGetResume(...args)
}));

// Mock next/cache's revalidatePath (no-op in tests).
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn()
}));

// Mock next/headers for the auth session lookup.
vi.mock('next/headers', () => ({
  headers: () => Promise.resolve(new Headers())
}));

// Mock the hybrid scoring engine so tests run without a live model
// download. The mock returns a deterministic breakdown matching the
// ScoreBreakdown shape so the action's return-type assertions hold.
vi.mock('@/lib/scoring-async/score-hybrid', () => ({
  scoreResumeHybridFromEnvelope: vi.fn(async () => ({
    overallScore: 75,
    dimensionScores: {
      atsMatching: 70,
      structure: 80,
      contentQuality: 75,
      alignment: 85
    },
    criteriaScores: {
      'ATS Keyword Match': 60,
      'ATS Similarity': 55,
      'ATS Coverage': 70,
      'Section Completeness': 80,
      'Optimal Length': 80,
      'Accomplishment Focus': 80,
      'Action Verb Usage': 70,
      Tailoring: 50,
      'Unique Value': 100,
      'Soft Skills': 50
    },
    computedInMs: 3
  }))
}));

import { recomputeScoreAction } from '@/app/(dashboard)/dashboard/resumes/[id]/score-actions';
import { scoreResumeHybridFromEnvelope } from '@/lib/scoring-async/score-hybrid';
import type { ResumeData, JobPosting } from '@/lib/resume-schema';

const SAMPLE_RESUME = {
  sections: {
    basics: {
      name: 'Jane Doe',
      label: 'Senior Engineer',
      email: 'jane@example.com',
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
  template: 'classic',
  jobContext: {
    id: 'job-1',
    title: 'Senior TypeScript Engineer',
    company: 'Stripe',
    location: 'Remote',
    description: 'Build payments platforms with React and Node.',
    requirements: ['5+ years TypeScript', 'AWS experience'],
    niceToHaves: [],
    benefits: [],
    keywords: ['typescript', 'react'],
    seniority: '',
    employmentType: '',
    source: 'paste',
    capturedAt: '2026-01-01T00:00:00.000Z'
  } as JobPosting
} as unknown as ResumeData;

describe('recomputeScoreAction', () => {
  beforeEach(() => {
    mockSession.mockReset();
    mockGetResume.mockReset();
  });

  it('returns an error when not signed in', async () => {
    mockSession.mockResolvedValue(null);
    const result = await recomputeScoreAction({ resumeId: 'r1' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('Not signed in');
  });

  it('returns an error when input is invalid', async () => {
    mockSession.mockResolvedValue({ user: { id: 'u1' } });
    const result = await recomputeScoreAction({});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('Invalid input');
  });

  it('returns an error when the resume does not exist / is not owned', async () => {
    mockSession.mockResolvedValue({ user: { id: 'u1' } });
    mockGetResume.mockResolvedValue(null);
    const result = await recomputeScoreAction({ resumeId: 'r1' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('Resume not found');
  });

  it('refuses to score a master resume', async () => {
    mockSession.mockResolvedValue({ user: { id: 'u1' } });
    mockGetResume.mockResolvedValue({
      resume: {
        id: 'r1',
        userId: 'u1',
        name: 'Master',
        note: '',
        status: 'draft',
        template: 'classic',
        isMaster: true,
        parentResumeId: null,
        currentRevisionId: 'rev-1',
        shareTokenHash: null,
        shareEnabled: false,
        shareViewCount: 0,
        shareLastViewedAt: null,
        shareCreatedAt: null,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      data: SAMPLE_RESUME
    });
    const result = await recomputeScoreAction({ resumeId: 'r1' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/master/i);
  });

  it('refuses to score a variant with no JD attached', async () => {
    mockSession.mockResolvedValue({ user: { id: 'u1' } });
    mockGetResume.mockResolvedValue({
      resume: {
        id: 'r1',
        userId: 'u1',
        name: 'Variant',
        note: '',
        status: 'draft',
        template: 'classic',
        isMaster: false,
        parentResumeId: 'master-1',
        currentRevisionId: 'rev-1',
        shareTokenHash: null,
        shareEnabled: false,
        shareViewCount: 0,
        shareLastViewedAt: null,
        shareCreatedAt: null,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      data: { ...SAMPLE_RESUME, jobContext: null }
    });
    const result = await recomputeScoreAction({ resumeId: 'r1' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/job description/i);
  });

  it('calls the hybrid scoring engine (not the sync-only path)', async () => {
    mockSession.mockResolvedValue({ user: { id: 'u1' } });
    mockGetResume.mockResolvedValue({
      resume: {
        id: 'r1',
        userId: 'u1',
        name: 'Variant',
        note: '',
        status: 'draft',
        template: 'classic',
        isMaster: false,
        parentResumeId: 'master-1',
        currentRevisionId: 'rev-1',
        shareTokenHash: null,
        shareEnabled: false,
        shareViewCount: 0,
        shareLastViewedAt: null,
        shareCreatedAt: null,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      data: SAMPLE_RESUME
    });
    const result = await recomputeScoreAction({ resumeId: 'r1' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const { breakdown, tips } = result.data;
      expect(breakdown).toHaveProperty('overallScore');
      expect(breakdown).toHaveProperty('dimensionScores');
      expect(breakdown).toHaveProperty('criteriaScores');
      expect(breakdown).toHaveProperty('computedInMs');
      expect(breakdown.overallScore).toBeGreaterThanOrEqual(0);
      expect(breakdown.overallScore).toBeLessThanOrEqual(100);
      // tips is the per-sub-criterion DynamicTips map — Partial<Record>
      // so it can be empty when no useful signal exists. We don't
      // assert content here; the helper's own tests cover that.
      expect(typeof tips).toBe('object');
    }
    // Confirm the hybrid (not sync-only) engine was invoked.
    expect(scoreResumeHybridFromEnvelope).toHaveBeenCalled();
  });
});
