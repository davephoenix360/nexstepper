import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  buildDynamicTips
} from '@/lib/scoring/tips';
import {
  scoreIntentCoverage,
  scoreIntentCoverageParams,
  NEUTRAL_INTENT_COVERAGE_SCORE
} from '@/lib/scoring/dimensions/intent-coverage';
import type { JobPosting, ResumeData } from '@/lib/resume-schema';

/**
 * Locks the v2 Intent Coverage scoring dimension + the dynamic tip
 * branch that surfaces the per-priority miss list to the user.
 *
 * Pure / sync — no AI Gateway, no IO. The fixture builders mirror
 * the ones in `tests/unit/scoring/tips.test.tsx` so cross-cutting
 * regressions surface here too.
 */

// ---------------------------------------------------------------------------
// Fixtures
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
        email: 'jane@example.com',
        phone: '',
        url: '',
        summary:
          'Senior TypeScript engineer with 8 years building React and Node applications on AWS.',
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
          description: 'Platform team',
          positions: [
            {
              title: 'Staff Engineer',
              startDate: '2020-01',
              endDate: 'present',
              highlights: [
                'Built the payments platform serving 12M users on AWS',
                'Mentored 5 engineers across 2 teams'
              ]
            }
          ]
        }
      ],
      education: [],
      skills: [
        { name: 'Languages', level: 'expert', keywords: ['typescript', 'python'] },
        { name: 'Cloud', level: 'expert', keywords: ['aws'] }
      ],
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
    title: 'Senior Platform Engineer',
    company: 'Stripe',
    location: 'Remote',
    description: 'Build payments platforms.',
    requirements: ['5+ years TypeScript', 'AWS experience'],
    niceToHaves: [],
    benefits: [],
    keywords: ['typescript', 'aws'],
    seniority: '',
    employmentType: '',
    source: 'paste',
    // v2 intent-extraction fields — defaults surface only when the
    // test overrides at least one of them (see fallback tests below).
    mustHaveSkills: [],
    niceToHaveSkills: [],
    implicitSkills: [],
    ...overrides
  } as JobPosting;
}

// ---------------------------------------------------------------------------
// scoreIntentCoverageParams — the canonical scoring entry point
// ---------------------------------------------------------------------------

describe('scoreIntentCoverageParams — fallback path', () => {
  it('returns NEUTRAL_INTENT_COVERAGE_SCORE when no priority lists are populated', () => {
    const result = scoreIntentCoverageParams({
      mustHaveSkills: [],
      niceToHaveSkills: [],
      implicitSkills: [],
      resumeTextLower: 'typescript engineer'
    });
    expect(result.value).toBe(NEUTRAL_INTENT_COVERAGE_SCORE);
    expect(result.fallback).toBe(true);
    expect(result.penalty).toBe(0);
    expect(result.missed).toEqual({
      mustHave: [],
      niceToHave: [],
      implicit: []
    });
  });
});

describe('scoreIntentCoverageParams — priority-weighted scoring', () => {
  it('returns 100 when every priority skill is in the resume', () => {
    const result = scoreIntentCoverageParams({
      mustHaveSkills: ['TypeScript', 'AWS'],
      niceToHaveSkills: ['React'],
      implicitSkills: ['Docker'],
      resumeTextLower: 'typescript aws react docker kubernetes'
    });
    expect(result.value).toBe(100);
    expect(result.penalty).toBe(0);
    expect(result.missed).toEqual({
      mustHave: [],
      niceToHave: [],
      implicit: []
    });
    expect(result.fallback).toBe(false);
  });

  it('deducts 8 points per missing must-have skill', () => {
    const result = scoreIntentCoverageParams({
      mustHaveSkills: ['TypeScript', 'Kubernetes', 'Terraform'],
      niceToHaveSkills: [],
      implicitSkills: [],
      // Resume has TypeScript only.
      resumeTextLower: 'typescript react'
    });
    expect(result.missed.mustHave).toEqual(['Kubernetes', 'Terraform']);
    // 2 missing must-haves × 8 = 16 penalty → 100 - 16 = 84.
    expect(result.penalty).toBe(16);
    expect(result.value).toBe(84);
    expect(result.fallback).toBe(false);
  });

  it('deducts 2.5 points per missing nice-to-have skill (3x cheaper than must-have)', () => {
    const result = scoreIntentCoverageParams({
      mustHaveSkills: [],
      niceToHaveSkills: ['React', 'Node', 'Docker'],
      implicitSkills: [],
      resumeTextLower: 'typescript'
    });
    // 3 missing nice-to-haves × 2.5 = 7.5 penalty → 100 - 7.5 = 92.5.
    expect(result.penalty).toBe(7.5);
    expect(result.value).toBe(92.5);
  });

  it('deducts 1.5 points per missing implicit skill (cheapest tier)', () => {
    const result = scoreIntentCoverageParams({
      mustHaveSkills: [],
      niceToHaveSkills: [],
      implicitSkills: ['Docker', 'Kubernetes'],
      resumeTextLower: ''
    });
    expect(result.penalty).toBe(3);
    expect(result.value).toBe(97);
  });

  it('matches case-insensitively', () => {
    const result = scoreIntentCoverageParams({
      mustHaveSkills: ['TypeScript', 'PostgreSQL'],
      niceToHaveSkills: [],
      implicitSkills: [],
      // resumeTextLower contract: caller pre-lowercases. This test
      // exercises the cross-case behavior by mixing the casing in
      // the SKILL strings (the dimension lowercases the skill
      // before matching).
      resumeTextLower: 'typescript and postgresql on aws'
    });
    expect(result.value).toBe(100);
    expect(result.missed.mustHave).toEqual([]);
  });

  it('clamps to 0 when the penalty exceeds 100', () => {
    // 20 missing must-haves × 8 = 160 — exceeds 100.
    const result = scoreIntentCoverageParams({
      mustHaveSkills: Array.from({ length: 20 }, (_, i) => `skill-${i}`),
      niceToHaveSkills: [],
      implicitSkills: [],
      resumeTextLower: ''
    });
    expect(result.value).toBe(0);
    expect(result.penalty).toBe(160);
  });

  it('caps each priority list at 20 items to prevent runaway JDs', () => {
    // 25 must-haves × 8 = 200 raw, but cap kicks in at 20 → 160 penalty → 0 score.
    // 21 must-haves × 8 = 168 — above the cap → still 160 (only first 20 count).
    const twentyOne = scoreIntentCoverageParams({
      mustHaveSkills: Array.from({ length: 21 }, (_, i) => `skill-${i}`),
      niceToHaveSkills: [],
      implicitSkills: [],
      resumeTextLower: ''
    });
    const twentyFive = scoreIntentCoverageParams({
      mustHaveSkills: Array.from({ length: 25 }, (_, i) => `skill-${i}`),
      niceToHaveSkills: [],
      implicitSkills: [],
      resumeTextLower: ''
    });
    // Both should produce the same penalty (160) — the cap means
    // item 21+ doesn't add to the penalty.
    expect(twentyOne.penalty).toBe(160);
    expect(twentyFive.penalty).toBe(160);
    expect(twentyFive.value).toBe(twentyOne.value);
  });

  it('prioritizes must-haves over nice-to-haves — same total, different score', () => {
    const mustHave = scoreIntentCoverageParams({
      mustHaveSkills: ['X'],
      niceToHaveSkills: [],
      implicitSkills: [],
      resumeTextLower: ''
    });
    const niceToHave = scoreIntentCoverageParams({
      mustHaveSkills: [],
      niceToHaveSkills: ['X'],
      implicitSkills: [],
      resumeTextLower: ''
    });
    // mustHave penalty = 8 → 92. niceToHave penalty = 2.5 → 97.5.
    expect(mustHave.value).toBe(92);
    expect(niceToHave.value).toBe(97.5);
    expect(mustHave.value).toBeLessThan(niceToHave.value);
  });
});

// ---------------------------------------------------------------------------
// scoreIntentCoverage — envelope-aware convenience wrapper
// ---------------------------------------------------------------------------

describe('scoreIntentCoverage (envelope wrapper)', () => {
  it('flattens the resume envelope and applies priority weighting', () => {
    const resume = makeResume();
    const job = makeJob({
      mustHaveSkills: ['TypeScript', 'Kubernetes'],
      niceToHaveSkills: ['Docker']
    });
    const result = scoreIntentCoverage(resume, job);
    // Resume has TypeScript (skills + summary), but NOT Kubernetes or Docker.
    expect(result.missed.mustHave).toEqual(['Kubernetes']);
    expect(result.missed.niceToHave).toEqual(['Docker']);
    // 1 must-have × 8 + 1 nice-to-have × 2.5 = 10.5 → 89.5.
    expect(result.value).toBe(89.5);
  });

  it('returns neutral fallback when the JD has no v2 intent fields', () => {
    const resume = makeResume();
    const job = makeJob({
      // No mustHave / niceToHave / implicit — legacy data.
      mustHaveSkills: [],
      niceToHaveSkills: [],
      implicitSkills: []
    });
    const result = scoreIntentCoverage(resume, job);
    expect(result.fallback).toBe(true);
    expect(result.value).toBe(NEUTRAL_INTENT_COVERAGE_SCORE);
  });
});

// ---------------------------------------------------------------------------
// Dynamic tip — Intent Coverage miss-list branch
// ---------------------------------------------------------------------------

function renderTip(tip: React.ReactNode): string {
  return renderToStaticMarkup(<>{tip}</>);
}

describe('buildDynamicTips — Intent Coverage v2 branch', () => {
  it('surfaces a "must-have skills" miss list when v2 data is present', () => {
    const resume = makeResume(); // has TypeScript, AWS — but no Kubernetes
    const job = makeJob({
      mustHaveSkills: ['TypeScript', 'Kubernetes', 'Terraform']
    });
    const tips = buildDynamicTips(
      {
        overallScore: 80,
        dimensionScores: {
          atsMatching: 70,
          structure: 80,
          contentQuality: 75,
          alignment: 70,
          intentCoverage: 84 // 100 - 16 (2 missing must-haves × 8)
        },
        criteriaScores: {
          'ATS Keyword Match': 60,
          'ATS Similarity': 50,
          'ATS Coverage': 70,
          'Intent Coverage': 84,
          'Section Completeness': 80,
          'Optimal Length': 80,
          'Accomplishment Focus': 80,
          'Action Verb Usage': 70,
          Tailoring: 50,
          'Unique Value': 100,
          'Soft Skills': 50
        },
        computedInMs: 5,
        intentCoverageBreakdown: {
          value: 84,
          missed: { mustHave: ['Kubernetes', 'Terraform'], niceToHave: [], implicit: [] },
          penalty: 16,
          fallback: false
        }
      },
      resume,
      job
    );
    const html = renderTip(tips['Intent Coverage']!);
    expect(html).toContain('Missing 2 must-have skills');
    expect(html).toContain('Kubernetes');
    expect(html).toContain('Terraform');
  });

  it('uses singular wording when only one must-have is missing', () => {
    const resume = makeResume();
    const job = makeJob({ mustHaveSkills: ['Kubernetes'] });
    const tips = buildDynamicTips(
      makeBreakdownStub(),
      resume,
      job
    );
    const html = renderTip(tips['Intent Coverage']!);
    expect(html).toContain('Missing 1 must-have skill');
    expect(html).not.toContain('must-have skills');
    expect(html).toContain('Kubernetes');
  });

  it('does NOT fire when no v2 data is available (legacy fallback)', () => {
    const resume = makeResume();
    const job = makeJob({
      // No v2 priority lists populated.
      mustHaveSkills: [],
      niceToHaveSkills: [],
      implicitSkills: []
    });
    const tips = buildDynamicTips(makeBreakdownStub(), resume, job);
    expect(tips['Intent Coverage']).toBeUndefined();
  });

  it('returns no tip when every priority skill is present', () => {
    const resume = makeResume();
    const job = makeJob({
      mustHaveSkills: ['TypeScript', 'AWS'], // both present in resume
      niceToHaveSkills: []
    });
    const tips = buildDynamicTips(makeBreakdownStub(), resume, job);
    expect(tips['Intent Coverage']).toBeUndefined();
  });

  it('includes nice-to-haves when only nice-to-haves are missing', () => {
    const resume = makeResume(); // no Docker / Kubernetes references
    const job = makeJob({
      mustHaveSkills: ['TypeScript'], // present
      niceToHaveSkills: ['Docker', 'Kubernetes']
    });
    const tips = buildDynamicTips(makeBreakdownStub(), resume, job);
    const html = renderTip(tips['Intent Coverage']!);
    expect(html).toContain('Missing 2 nice-to-haves');
    expect(html).toContain('Docker');
    expect(html).toContain('Kubernetes');
  });

  it('caps at 3 skills per priority and shows a "+N more" tail', () => {
    const resume = makeResume();
    const job = makeJob({
      // Use real-looking skills (not single letters) so the
      // case-insensitive substring match doesn't false-positive.
      // A single-letter skill like 'A' would substring-match almost
      // any English resume.
      mustHaveSkills: ['Kubernetes', 'Terraform', 'Helm', 'Ansible', 'Pulumi']
    });
    const tips = buildDynamicTips(makeBreakdownStub(), resume, job);
    const html = renderTip(tips['Intent Coverage']!);
    expect(html).toContain('Missing 5 must-have skills');
    expect(html).toContain('Kubernetes, Terraform, Helm'); // first 3
    expect(html).not.toContain('Ansible'); // excluded by cap
    expect(html).not.toContain('Pulumi'); // excluded by cap
    expect(html).toContain('(+2 more)');
  });
});

/**
 * Minimal breakdown stub for the dynamic-tip tests. The
 * `Intent Coverage` dynamic-tip branch doesn't read most of the
 * fields — it only needs to be a valid `ScoreBreakdown` shape so
 * TypeScript's discriminated-union checks pass.
 */
function makeBreakdownStub() {
  return {
    overallScore: 80,
    dimensionScores: {
      atsMatching: 70,
      structure: 80,
      contentQuality: 75,
      alignment: 70,
      intentCoverage: 50
    },
    criteriaScores: {
      'ATS Keyword Match': 60,
      'ATS Similarity': 50,
      'ATS Coverage': 70,
      'Intent Coverage': 50,
      'Section Completeness': 80,
      'Optimal Length': 80,
      'Accomplishment Focus': 80,
      'Action Verb Usage': 70,
      Tailoring: 50,
      'Unique Value': 100,
      'Soft Skills': 50
    },
    computedInMs: 5,
    intentCoverageBreakdown: {
      value: 50,
      missed: { mustHave: [], niceToHave: [], implicit: [] },
      penalty: 0,
      fallback: true
    }
  };
}
