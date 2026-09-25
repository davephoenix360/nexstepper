import { describe, expect, it } from 'vitest';

import {
  scoreSeniorityFit,
  NEUTRAL_SENIORITY_FIT_SCORE
} from '@/lib/scoring/dimensions/seniority-fit';
import type { JobPosting, ResumeData } from '@/lib/resume-schema';
import type { DeepPartial } from '@/tests/fixtures/types';

/**
 * Locks the v2 Seniority Fit scoring dimension.
 *
 * Pure / sync — no async, no IO, no Math.random. The test
 * fixtures pass an explicit `Date.now` (rather than letting the
 * dimension call `new Date()`) so the engine stays deterministic.
 */

// Deterministic "now" — 2026-01-15 UTC. Picked so work-history
// spans resolve predictably across tests.
const NOW = new Date('2026-01-15T00:00:00Z');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeResume(overrides: DeepPartial<ResumeData> = {}): ResumeData {
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
        email: 'jane@example.com',
        phone: '',
        url: '',
        summary: 'Senior TypeScript engineer.',
        location: {
          address: '',
          postalCode: '',
          city: '',
          countryCode: '',
          region: ''
        },
        profiles: []
      },
      work: [],
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
    title: 'Senior TypeScript Engineer',
    company: 'Stripe',
    location: 'Remote',
    description: 'Build payments platforms.',
    requirements: ['5+ years TypeScript', 'AWS experience'],
    niceToHaves: [],
    benefits: [],
    keywords: [],
    seniority: '',
    employmentType: '',
    source: 'paste',
    mustHaveSkills: [],
    niceToHaveSkills: [],
    implicitSkills: [],
    yearsRequiredMin: 5,
    yearsRequiredMax: null,
    ...overrides
  } as JobPosting;
}

// ---------------------------------------------------------------------------
// Fallback paths
// ---------------------------------------------------------------------------

describe('scoreSeniorityFit — fallback paths', () => {
  it('returns NEUTRAL when JD has no yearsRequiredMin', () => {
    const result = scoreSeniorityFit(
      makeResume(),
      makeJob({ yearsRequiredMin: null }),
      NOW
    );
    expect(result.value).toBe(NEUTRAL_SENIORITY_FIT_SCORE);
    expect(result.fallback).toBe(true);
    expect(result.jdYearsMin).toBeNull();
    expect(result.gap).toBeNull();
  });

  it('returns NEUTRAL when resume has no work history', () => {
    const result = scoreSeniorityFit(
      makeResume(), // no work history
      makeJob({ yearsRequiredMin: 5 }),
      NOW
    );
    expect(result.value).toBe(NEUTRAL_SENIORITY_FIT_SCORE);
    expect(result.fallback).toBe(true);
    expect(result.resumeYears).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Sweet-spot band (within ±TOLERANCE_YEARS)
// ---------------------------------------------------------------------------

describe('scoreSeniorityFit — sweet spot (within tolerance)', () => {
  it('scores 100 when resume years match the requirement exactly', () => {
    // 2018-01 → 2026-01 = 8 years. JD asks for 8 years. Perfect.
    const resume = makeResume({
      sections: {
        work: [
          {
            company: 'Acme',
            location: '',
            url: '',
            description: 'Platform team',
            positions: [
              {
                title: 'Staff Engineer',
                startDate: '2018-01',
                endDate: '2026-01',
                highlights: []
              }
            ]
          }
        ]
      }
    });
    const result = scoreSeniorityFit(resume, makeJob({ yearsRequiredMin: 8 }), NOW);
    expect(result.value).toBe(100);
    expect(result.gap).toBe(0);
    expect(result.fallback).toBe(false);
  });

  it('scores 100 within the upper tolerance band (over-qualified by 1 year)', () => {
    // 2017-01 → 2026-01 = 9 years. JD asks for 8 years. Gap = +1 (within ±2).
    const resume = makeResume({
      sections: {
        work: [
          {
            company: 'Acme',
            location: '',
            url: '',
            description: '',
            positions: [
              {
                title: 'Staff Engineer',
                startDate: '2017-01',
                endDate: '2026-01',
                highlights: []
              }
            ]
          }
        ]
      }
    });
    const result = scoreSeniorityFit(resume, makeJob({ yearsRequiredMin: 8 }), NOW);
    expect(result.value).toBe(100);
    expect(result.gap).toBe(1);
  });

  it('scores 100 within the lower tolerance band (under-qualified by 1 year)', () => {
    // 2019-01 → 2026-01 = 7 years. JD asks for 8 years. Gap = -1 (within ±2).
    const resume = makeResume({
      sections: {
        work: [
          {
            company: 'Acme',
            location: '',
            url: '',
            description: '',
            positions: [
              {
                title: 'Staff Engineer',
                startDate: '2019-01',
                endDate: '2026-01',
                highlights: []
              }
            ]
          }
        ]
      }
    });
    const result = scoreSeniorityFit(resume, makeJob({ yearsRequiredMin: 8 }), NOW);
    expect(result.value).toBe(100);
    expect(result.gap).toBe(-1);
  });

  it('counts "present" positions through `now`', () => {
    // 2020-01 → present (2026-01-15) = 6 years 0.5 months → 6 years.
    const resume = makeResume({
      sections: {
        work: [
          {
            company: 'Acme',
            location: '',
            url: '',
            description: '',
            positions: [
              {
                title: 'Senior Engineer',
                startDate: '2020-01',
                endDate: 'present',
                highlights: []
              }
            ]
          }
        ]
      }
    });
    const result = scoreSeniorityFit(resume, makeJob({ yearsRequiredMin: 6 }), NOW);
    expect(result.value).toBe(100);
    expect(result.resumeYears).toBe(6);
  });

  it('sums positions across companies (parallel job-hops counted once)', () => {
    // Acme: 2020-01 → 2024-01 = 4 years. Stripe: 2023-01 → 2026-01 = 3 years.
    // Sum = 7. JD asks for 7 years. Sweet spot.
    const resume = makeResume({
      sections: {
        work: [
          {
            company: 'Acme',
            location: '',
            url: '',
            description: '',
            positions: [
              {
                title: 'Mid Engineer',
                startDate: '2020-01',
                endDate: '2024-01',
                highlights: []
              }
            ]
          },
          {
            company: 'Stripe',
            location: '',
            url: '',
            description: '',
            positions: [
              {
                title: 'Senior Engineer',
                startDate: '2023-01',
                endDate: 'present',
                highlights: []
              }
            ]
          }
        ]
      }
    });
    const result = scoreSeniorityFit(resume, makeJob({ yearsRequiredMin: 7 }), NOW);
    expect(result.resumeYears).toBe(7);
    expect(result.value).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// Penalty math — asymmetric
// ---------------------------------------------------------------------------

describe('scoreSeniorityFit — penalty math', () => {
  it('penalizes under-qualification at 25 pts/year beyond tolerance', () => {
    // Resume = 3 years. JD asks for 8 years. Gap = -5.
    // Tolerance = ±2, so "beyond" is -3 years. Penalty = 3 × 25 = 75.
    // Score = 100 - 75 = 25.
    const resume = makeResume({
      sections: {
        work: [
          {
            company: 'Acme',
            location: '',
            url: '',
            description: '',
            positions: [
              {
                title: 'Engineer',
                startDate: '2023-01',
                endDate: '2026-01',
                highlights: []
              }
            ]
          }
        ]
      }
    });
    const result = scoreSeniorityFit(resume, makeJob({ yearsRequiredMin: 8 }), NOW);
    expect(result.value).toBe(25);
    expect(result.gap).toBe(-5);
  });

  it('does NOT penalize over-qualification past tolerance (neutral signal)', () => {
    // Resume = 20 years. JD asks for 8 years. Gap = +12. Beyond tolerance = 10.
    // Pre-fix: Penalty = 10 × 7.5 = 75 → score 25 (rank-inverting for senior JDs).
    // Post-fix (2026-09-24 calibration): no penalty — over-qualification is
    // a neutral signal past tolerance. Score = 100. Verified empirically:
    // the 50-row validation corpus showed recruiters don't penalize
    // "too much experience" beyond the tolerance band; the old slope
    // was inverting the rank order for senior-track JDs.
    // See docs/drift/2026-09-20-ats-v2-validation-corpus.md §"Seniority Fit
    // wired into the sync engine" for the analysis.
    const resume = makeResume({
      sections: {
        work: [
          {
            company: 'Acme',
            location: '',
            url: '',
            description: '',
            positions: [
              {
                title: 'Principal Engineer',
                startDate: '2006-01',
                endDate: 'present',
                highlights: []
              }
            ]
          }
        ]
      }
    });
    const result = scoreSeniorityFit(resume, makeJob({ yearsRequiredMin: 8 }), NOW);
    expect(result.value).toBe(100);
    expect(result.gap).toBe(12);
  });

  it('asymmetry: 4 years over-qualified scores HIGHER than 4 years under-qualified', () => {
    // Resume = 12 years, JD = 8 years. Gap = +4. Beyond tolerance = 2.
    // Post-fix: no penalty for over-qualification → score = 100.
    const overQ = makeResume({
      sections: {
        work: [
          {
            company: 'Acme',
            location: '',
            url: '',
            description: '',
            positions: [
              {
                title: 'Engineer',
                startDate: '2014-01',
                endDate: 'present',
                highlights: []
              }
            ]
          }
        ]
      }
    });
    const overQResult = scoreSeniorityFit(overQ, makeJob({ yearsRequiredMin: 8 }), NOW);

    // Resume = 4 years, JD = 8 years. Gap = -4. Beyond tolerance = 2.
    // Penalty = 2 × 25 = 50. Score = 50.
    const underQ = makeResume({
      sections: {
        work: [
          {
            company: 'Acme',
            location: '',
            url: '',
            description: '',
            positions: [
              {
                title: 'Engineer',
                startDate: '2022-01',
                endDate: 'present',
                highlights: []
              }
            ]
          }
        ]
      }
    });
    const underQResult = scoreSeniorityFit(underQ, makeJob({ yearsRequiredMin: 8 }), NOW);

    expect(overQResult.value).toBe(100);
    expect(underQResult.value).toBe(50);
    expect(overQResult.value).toBeGreaterThan(underQResult.value);
  });

  it('clamps under-qualification to 0 (never goes negative)', () => {
    // Resume = 1 year. JD = 10. Gap = -9. Beyond tolerance = 7. Penalty = 175.
    // Clamped to 0.
    const resume = makeResume({
      sections: {
        work: [
          {
            company: 'Acme',
            location: '',
            url: '',
            description: '',
            positions: [
              {
                title: 'Junior Engineer',
                startDate: '2025-01',
                endDate: '2026-01',
                highlights: []
              }
            ]
          }
        ]
      }
    });
    const result = scoreSeniorityFit(resume, makeJob({ yearsRequiredMin: 10 }), NOW);
    expect(result.resumeYears).toBe(1);
    expect(result.value).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Max years cap + JD-explicit-max
// ---------------------------------------------------------------------------

describe('scoreSeniorityFit — edge cases', () => {
  it('caps resume years at MAX_YEARS (30) and treats extreme over-qualification as neutral', () => {
    // 1980-01 → present (2026-01) = 46 years, but capped to 30.
    // JD asks for 8 years. Gap = 22. Beyond tolerance = 20.
    // Pre-fix: 20 × 7.5 = 150, clamped to 0 (rank-inverting for senior JDs).
    // Post-fix: no penalty for over-qualification past tolerance → score = 100.
    const resume = makeResume({
      sections: {
        work: [
          {
            company: 'OldCo',
            location: '',
            url: '',
            description: '',
            positions: [
              {
                title: 'Old Timer',
                startDate: '1980-01',
                endDate: 'present',
                highlights: []
              }
            ]
          }
        ]
      }
    });
    const result = scoreSeniorityFit(resume, makeJob({ yearsRequiredMin: 8 }), NOW);
    expect(result.resumeYears).toBe(30);
    // MAX_YEARS caps resume tenure; over-qualification past tolerance
    // has no penalty → score = 100.
    expect(result.value).toBe(100);
  });

  it('honors a JD-explicit max years (treats resume-years above max as over-qualified)', () => {
    // Resume = 15 years. JD = 5-10. Gap vs min = 10 (over tolerance by 8 → 60 pts off).
    // But the JD's max (10) caps the sweet spot: resume-years above max+2 = 12
    // gets penalized. 15 > 12 → penalty = (15-12)*7.5 = 22.5 → 78.
    const resume = makeResume({
      sections: {
        work: [
          {
            company: 'Acme',
            location: '',
            url: '',
            description: '',
            positions: [
              {
                title: 'Staff Engineer',
                startDate: '2011-01',
                endDate: 'present',
                highlights: []
              }
            ]
          }
        ]
      }
    });
    const result = scoreSeniorityFit(
      resume,
      makeJob({ yearsRequiredMin: 5, yearsRequiredMax: 10 }),
      NOW
    );
    expect(result.resumeYears).toBe(15);
    // Math: 100 - (15 - 12) * 7.5 = 100 - 22.5 = 77.5 → 78 (rounded).
    expect(result.value).toBe(78);
  });
});

// ---------------------------------------------------------------------------
// Date format parsing
// ---------------------------------------------------------------------------

describe('scoreSeniorityFit — date parsing', () => {
  it('accepts year-only dates ("2020")', () => {
    // 2020-01-01 → 2026-01-15 = 6 years 0.5 months → 6.
    const resume = makeResume({
      sections: {
        work: [
          {
            company: 'Acme',
            location: '',
            url: '',
            description: '',
            positions: [
              {
                title: 'Engineer',
                startDate: '2020',
                endDate: '2026',
                highlights: []
              }
            ]
          }
        ]
      }
    });
    const result = scoreSeniorityFit(resume, makeJob({ yearsRequiredMin: 6 }), NOW);
    expect(result.resumeYears).toBe(6);
  });

  it('accepts full ISO dates ("2020-01-15")', () => {
    const resume = makeResume({
      sections: {
        work: [
          {
            company: 'Acme',
            location: '',
            url: '',
            description: '',
            positions: [
              {
                title: 'Engineer',
                startDate: '2020-01-15',
                endDate: '2023-06-15',
                highlights: []
              }
            ]
          }
        ]
      }
    });
    const result = scoreSeniorityFit(resume, makeJob({ yearsRequiredMin: 3 }), NOW);
    // 2020-01-15 → 2023-06-15 = 41 months → ~3 years.
    expect(result.resumeYears).toBe(3);
  });

  it('skips positions with unparseable start dates', () => {
    const resume = makeResume({
      sections: {
        work: [
          {
            company: 'Acme',
            location: '',
            url: '',
            description: '',
            positions: [
              {
                title: 'Engineer',
                startDate: 'not a date',
                endDate: '2026-01',
                highlights: []
              }
            ]
          }
        ]
      }
    });
    const result = scoreSeniorityFit(resume, makeJob({ yearsRequiredMin: 5 }), NOW);
    expect(result.fallback).toBe(true);
    expect(result.value).toBe(NEUTRAL_SENIORITY_FIT_SCORE);
  });
});
