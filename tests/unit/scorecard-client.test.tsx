import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

// The Server Action import resolves through Next's 'use server' marker.
// We don't call it in SSR (no client transitions in renderToStaticMarkup),
// so mocking it as a no-op keeps the client component's `import`
// statements valid.
vi.mock('@/app/(dashboard)/dashboard/resumes/[id]/score-actions', () => ({
  recomputeScoreAction: vi.fn(async () => ({ ok: false, error: 'mocked' }))
}));

import { ScorecardClient } from '@/app/(dashboard)/dashboard/resumes/[id]/_components/scorecard-client';
import type { JobPosting } from '@/lib/resume-schema';
import type { ScoreBreakdown } from '@/lib/scoring';

const JD: JobPosting = {
  id: 'job-1',
  title: 'Senior Engineer',
  company: 'Stripe',
  location: 'Remote',
  description: 'Build payments APIs.',
  requirements: ['TypeScript'],
  niceToHaves: [],
  benefits: [],
  keywords: [],
  seniority: '',
  employmentType: '',
  source: 'paste',
  // v2 intent-extraction fields (added 2026-09-19, optional with defaults).
  // Listed explicitly so the literal satisfies `JobPosting` without
  // needing an `as JobPosting` cast.
  mustHaveSkills: [],
  niceToHaveSkills: [],
  implicitSkills: [],
  seniorityLevel: null,
  yearsRequiredMin: null,
  yearsRequiredMax: null,
  roleFamily: null,
  domainSignals: []
};

const BREAKDOWN: ScoreBreakdown = {
  overallScore: 78,
  dimensionScores: {
    atsMatching: 70,
    structure: 80,
    contentQuality: 75,
    alignment: 85,
    // v2 — neutral (no v2 data in the SSR fixture).
    intentCoverage: 50,
    // v2 Phase 2 — neutral.
    roleFit: 50,
    seniorityFit: 50
  },
  criteriaScores: {
    'ATS Keyword Match': 60,
    'ATS Similarity': 50,
    'ATS Coverage': 70,
    'Section Completeness': 80,
    'Optimal Length': 80,
    'Accomplishment Focus': 80,
    'Action Verb Usage': 70,
    Tailoring: 50,
    'Unique Value': 100,
    'Soft Skills': 50,
    // v2 — same as the dimension: neutral when no v2 data.
    'Intent Coverage': 60,
    // v2 Phase 2 — neutral.
    'Role Fit': 50,
    'Seniority Fit': 50
  },
  computedInMs: 12,
  intentCoverageBreakdown: {
    value: 50,
    missed: { mustHave: [], niceToHave: [], implicit: [] },
    penalty: 0,
    fallback: true
  }
};

describe('ScorecardClient', () => {
  it('renders the scorecard with the initial breakdown on SSR', () => {
    const html = renderToStaticMarkup(
      <ScorecardClient
        resumeId="r1"
        jobContext={JD}
        initialBreakdown={BREAKDOWN}
      />
    );
    expect(html).toContain('data-testid="scorecard"');
    expect(html).toContain('78');
    // overallScore=78 → "Good" tier (65-79, below the 80 "Strong" line).
    expect(html).toContain('Good');
  });

  it('renders the empty state when no JD is attached', () => {
    const html = renderToStaticMarkup(
      <ScorecardClient
        resumeId="r1"
        jobContext={null}
        initialBreakdown={null}
      />
    );
    expect(html).toContain('data-testid="scorecard-empty-wrapper"');
    expect(html).toContain('Attach a job description');
  });

  it('renders the placeholder when a JD is attached but breakdown is null', () => {
    const html = renderToStaticMarkup(
      <ScorecardClient
        resumeId="r1"
        jobContext={JD}
        initialBreakdown={null}
      />
    );
    // The wrapper is still rendered (so the layout doesn't shift).
    // The inner panel shows the "Awaiting first compute" state via
    // <ScorecardPanel>'s breakdown=null path.
    expect(html).toContain('data-testid="scorecard-empty-wrapper"');
  });
});
