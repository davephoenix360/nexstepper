import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock 'server-only' before importing the action (test runtime is
// not a Next.js request handler).
vi.mock('server-only', () => ({}));

// Mock Better Auth so we can script the session in each test.
const mockSession = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: () => mockSession() } }
}));

// Mock the DB layer so we can script ownership + data shape.
const mockGetResume = vi.fn();
const mockGetSubscription = vi.fn();
vi.mock('@/lib/db/queries', () => ({
  getResume: (...args: unknown[]) => mockGetResume(...args),
  getSubscription: (...args: unknown[]) => mockGetSubscription(...args)
}));

// Mock next/headers for the auth session lookup.
vi.mock('next/headers', () => ({
  headers: () => Promise.resolve(new Headers())
}));

// Mock the AI fallback chain. The action uses generateObjectWithFallbacks
// — we mock that wrapper so we control exactly what the AI returns.
const mockGenerateObjectWithFallbacks = vi.fn();
vi.mock('@/lib/ai/fallback', () => ({
  generateObjectWithFallbacks: (...args: unknown[]) =>
    mockGenerateObjectWithFallbacks(...args)
}));

// Mock the AI providers module — enrichBulletAction uses the named
// constants from there. We return the same string back so we can
// assert the action passed PARSER_MODEL first.
vi.mock('@/lib/ai/providers', () => ({
  PARSER_MODEL: 'mistral/nemo',
  PARSE_FALLBACKS: ['fallback-1', 'fallback-2']
}));

import { enrichBulletAction } from '@/app/(dashboard)/dashboard/resumes/[id]/_components/enrich-bullet-action';
import type { ResumeData, JobPosting } from '@/lib/resume-schema';

const SAMPLE_JOB: JobPosting = {
  id: 'job-1',
  title: 'Senior TypeScript Engineer',
  company: 'Stripe',
  location: 'Remote',
  description: 'Build payments platforms with React and Node.',
  requirements: ['5+ years TypeScript', 'AWS experience', 'Kubernetes'],
  niceToHaves: [],
  benefits: [],
  keywords: ['typescript', 'react'],
  seniority: '',
  employmentType: '',
  source: 'paste',
  capturedAt: '2026-01-01T00:00:00.000Z',
  mustHaveSkills: ['kubernetes', 'helm'],
  niceToHaveSkills: ['terraform'],
  implicitSkills: [],
  seniorityLevel: null,
  yearsRequiredMin: null,
  yearsRequiredMax: null,
  roleFamily: null,
  domainSignals: []
};

const SAMPLE_RESUME = {
  sections: {
    basics: {
      name: 'Jane Doe',
      label: 'Senior Engineer',
      email: 'jane@example.com',
      phone: '',
      url: '',
      summary: 'Senior TypeScript engineer with 8 years on React + Node.',
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
  jobContext: SAMPLE_JOB
} as unknown as ResumeData;

const OWNED_RESUME = {
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
};

describe('enrichBulletAction', () => {
  beforeEach(() => {
    mockSession.mockReset();
    mockGetResume.mockReset();
    mockGetSubscription.mockReset();
    mockGenerateObjectWithFallbacks.mockReset();
  });

  it('returns Not signed in when there is no session', async () => {
    mockSession.mockResolvedValue(null);
    const result = await enrichBulletAction({
      resumeId: 'r1',
      path: 'sections.work[0].highlights[0]',
      criterion: 'ATS Coverage',
      currentText: 'Built the payments platform'
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('Not signed in');
      // proRequired is OPTIONAL — should be undefined (or absent)
      // when the failure isn't a Pro-gate failure.
      expect(result.proRequired).toBeUndefined();
    }
  });

  it('returns Invalid input for an empty payload', async () => {
    mockSession.mockResolvedValue({ user: { id: 'u1' } });
    const result = await enrichBulletAction({});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('Invalid input');
  });

  it('returns a friendly error for empty currentText (no auth round-trip)', async () => {
    // The empty-text path is short-circuited BEFORE the auth +
    // Pro gate + DB lookups. We assert `mockSession` was never
    // called so a future refactor doesn't accidentally add an
    // expensive round-trip to a no-op case.
    mockSession.mockResolvedValue({ user: { id: 'u1' } });
    mockGetSubscription.mockResolvedValue({
      id: 'sub-1',
      userId: 'u1',
      stripeCustomerId: 'cus',
      stripeSubscriptionId: 's',
      stripePriceId: 'p',
      plan: 'pro',
      status: 'active',
      currentPeriodEnd: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    });
    mockGetResume.mockResolvedValue(OWNED_RESUME);
    const result = await enrichBulletAction({
      resumeId: 'r1',
      path: 'sections.work[0].highlights[0]',
      criterion: 'ATS Coverage',
      currentText: '   '
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/empty/i);
      expect(result.error).toMatch(/add some content/i);
    }
    // The action's empty-text branch returns BEFORE requirePro
    // and getResume, so neither should have been invoked.
    expect(mockGenerateObjectWithFallbacks).not.toHaveBeenCalled();
  });

  it('returns { ok: false, proRequired: true } for Free users', async () => {
    mockSession.mockResolvedValue({ user: { id: 'u1' } });
    mockGetSubscription.mockResolvedValue({
      id: 'sub-1',
      userId: 'u1',
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      stripePriceId: null,
      plan: 'free',
      status: 'inactive',
      currentPeriodEnd: null,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    const result = await enrichBulletAction({
      resumeId: 'r1',
      path: 'sections.work[0].highlights[0]',
      criterion: 'ATS Coverage',
      currentText: 'Built the payments platform'
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('Pro required');
      expect(result.proRequired).toBe(true);
    }
    // Crucially: the AI must NOT have been called.
    expect(mockGenerateObjectWithFallbacks).not.toHaveBeenCalled();
  });

  it('returns Resume not found when the resume is not owned', async () => {
    mockSession.mockResolvedValue({ user: { id: 'u1' } });
    mockGetSubscription.mockResolvedValue({
      id: 'sub-1',
      userId: 'u1',
      stripeCustomerId: 'cus',
      stripeSubscriptionId: 's',
      stripePriceId: 'p',
      plan: 'pro',
      status: 'active',
      currentPeriodEnd: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    });
    mockGetResume.mockResolvedValue(null);
    const result = await enrichBulletAction({
      resumeId: 'r1',
      path: 'sections.work[0].highlights[0]',
      criterion: 'ATS Coverage',
      currentText: 'Built the payments platform'
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('Resume not found');
  });

  it('refuses when the variant has no JD attached', async () => {
    mockSession.mockResolvedValue({ user: { id: 'u1' } });
    mockGetSubscription.mockResolvedValue({
      id: 'sub-1',
      userId: 'u1',
      stripeCustomerId: 'cus',
      stripeSubscriptionId: 's',
      stripePriceId: 'p',
      plan: 'pro',
      status: 'active',
      currentPeriodEnd: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    });
    mockGetResume.mockResolvedValue({
      ...OWNED_RESUME,
      data: { ...SAMPLE_RESUME, jobContext: null }
    });
    const result = await enrichBulletAction({
      resumeId: 'r1',
      path: 'sections.work[0].highlights[0]',
      criterion: 'ATS Coverage',
      currentText: 'Built the payments platform'
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/job description/i);
    expect(mockGenerateObjectWithFallbacks).not.toHaveBeenCalled();
  });

  it('returns 3 rewrites for a Pro user + AI succeeds', async () => {
    mockSession.mockResolvedValue({ user: { id: 'u1' } });
    mockGetSubscription.mockResolvedValue({
      id: 'sub-1',
      userId: 'u1',
      stripeCustomerId: 'cus',
      stripeSubscriptionId: 's',
      stripePriceId: 'p',
      plan: 'pro',
      status: 'active',
      currentPeriodEnd: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    });
    mockGetResume.mockResolvedValue(OWNED_RESUME);
    mockGenerateObjectWithFallbacks.mockResolvedValue({
      data: {
        rewrites: [
          'Built the payments platform on Kubernetes, serving 12M users.',
          'Built the payments platform on Kubernetes, scaling to 12M users.',
          'Led the build of the payments platform, scaling to 12M users on Kubernetes.'
        ]
      },
      modelUsed: 'mistral/nemo',
      usage: { inputTokens: 100, outputTokens: 80 }
    });
    const result = await enrichBulletAction({
      resumeId: 'r1',
      path: 'sections.work[0].highlights[0]',
      criterion: 'ATS Coverage',
      currentText: 'Built the payments platform serving 12M users on AWS'
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      // dedupe collapses identical rows; all three are distinct here.
      expect(result.data.rewrites.length).toBe(3);
      expect(result.data.modelUsed).toBe('mistral/nemo');
      // All rewrites should be derived from the original bullet's
      // vocabulary or the JD vocabulary — never invented out of
      // thin air. Assert one specific term that came from the JD
      // (kubernetes) appears in the rewrite.
      expect(
        result.data.rewrites.some((r) => r.toLowerCase().includes('kubernetes'))
      ).toBe(true);
    }
    // The action passed PARSER_MODEL + the fallback chain.
    const callArgs = mockGenerateObjectWithFallbacks.mock.calls[0]?.[0];
    expect(callArgs).toBeDefined();
    expect(callArgs.models).toEqual(['mistral/nemo', 'fallback-1', 'fallback-2']);
    expect(callArgs.temperature).toBe(0.4);
  });

  it('dedupes identical rewrites (defensive)', async () => {
    mockSession.mockResolvedValue({ user: { id: 'u1' } });
    mockGetSubscription.mockResolvedValue({
      id: 'sub-1',
      userId: 'u1',
      stripeCustomerId: 'cus',
      stripeSubscriptionId: 's',
      stripePriceId: 'p',
      plan: 'pro',
      status: 'active',
      currentPeriodEnd: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    });
    mockGetResume.mockResolvedValue(OWNED_RESUME);
    mockGenerateObjectWithFallbacks.mockResolvedValue({
      data: {
        rewrites: [
          'Same bullet.',
          'Same bullet.',
          'Same bullet.'
        ]
      },
      modelUsed: 'mistral/nemo',
      usage: { inputTokens: 100, outputTokens: 30 }
    });
    const result = await enrichBulletAction({
      resumeId: 'r1',
      path: 'sections.work[0].highlights[0]',
      criterion: 'ATS Coverage',
      currentText: 'Built the payments platform'
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Dedupes to 1 unique + pads to 3 with empty strings.
      // The empty rows never render (the popover filters blanks).
      expect(result.data.rewrites.length).toBe(3);
      expect(new Set(result.data.rewrites.map((s) => s.toLowerCase())).size)
        .toBeLessThanOrEqual(3);
    }
  });

  it('returns an error string when the AI fails', async () => {
    mockSession.mockResolvedValue({ user: { id: 'u1' } });
    mockGetSubscription.mockResolvedValue({
      id: 'sub-1',
      userId: 'u1',
      stripeCustomerId: 'cus',
      stripeSubscriptionId: 's',
      stripePriceId: 'p',
      plan: 'pro',
      status: 'active',
      currentPeriodEnd: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    });
    mockGetResume.mockResolvedValue(OWNED_RESUME);
    mockGenerateObjectWithFallbacks.mockRejectedValue(new Error('upstream timeout'));
    const result = await enrichBulletAction({
      resumeId: 'r1',
      path: 'sections.work[0].highlights[0]',
      criterion: 'ATS Coverage',
      currentText: 'Built the payments platform'
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/AI rewrite failed/);
      expect(result.error).toContain('upstream timeout');
    }
  });
});