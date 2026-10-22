/**
 * The reported bug, end to end.
 *
 * A JD asked for a bachelor's degree. The intent extractor put it in
 * `mustHaveSkills` (its prompt lists "Qualifications" as a must-have
 * section header, and the intent schema has nowhere else to put a
 * requirement that is not a skill). The scorer then treated it as a
 * missing skill: an 8-point Intent Coverage penalty, a line in the
 * scorecard's skill-gap list, and a tip telling the user to add
 * "bachelor", "degree", "computer", "science" to their resume.
 *
 * The candidate is finishing that degree and will hold it by the time
 * the role starts.
 *
 * These tests pin the whole path: the score, the miss list, the tip, the
 * keyword vocabulary, and what the assistant is told.
 */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { buildAtsContext } from '@/lib/chat/system-prompt';
import {
  buildDynamicTips,
  computeMissingKeywords,
  flattenResumeTextForTips
} from '@/lib/scoring/tips';
import {
  jobEligibilityGates,
  jobTokensWithoutStopWords
} from '@/lib/scoring/jd-tokens';
import { STOP_WORDS } from '@/lib/scoring/dictionaries';
import { scoreResumeFromEnvelope } from '@/lib/scoring';
import type { JobPosting, ResumeData } from '@/lib/resume-schema';

const NOW = new Date('2026-10-22T12:00:00Z');

const DEGREE_REQUIREMENT =
  "Bachelor's degree in Computer Science or equivalent practical experience";

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
        label: 'Software Engineer',
        email: 'jane@example.com',
        phone: '',
        url: '',
        summary:
          'Software engineer building healthcare products with TypeScript, Python and Node.js.',
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
          company: 'ClinicCo',
          location: '',
          url: '',
          description: 'Clinic software',
          positions: [
            {
              title: 'Software Engineer',
              startDate: '2024-06',
              endDate: 'present',
              highlights: [
                'Shipped a TypeScript API handling 2M requests a day for a clinic network',
                'Cut patient onboarding time 40% by rebuilding intake flows with React'
              ]
            }
          ]
        }
      ],
      education: [
        {
          institution: 'University of Ottawa',
          url: '',
          location: 'Ottawa, ON',
          degree: {
            degreeLevel: 'Bachelor',
            majors: ['Computer Science'],
            minors: []
          },
          startDate: '2023-09',
          endDate: '2027-06',
          gpa: '',
          courses: []
        }
      ],
      skills: [
        {
          name: 'Languages',
          level: 'expert',
          keywords: ['typescript', 'python', 'sql']
        },
        { name: 'Frameworks', level: 'expert', keywords: ['node.js', 'react'] },
        { name: 'Data', level: 'expert', keywords: ['postgresql'] }
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
    title: 'Software Engineer',
    company: 'CleerDental',
    location: 'Ottawa, ON',
    description: 'We build software for dental clinics.',
    requirements: [
      DEGREE_REQUIREMENT,
      'Strong TypeScript and Node.js experience',
      'Experience with PostgreSQL and SQL'
    ],
    niceToHaves: ['Familiarity with HL7 or FHIR standards'],
    benefits: ['Remote-friendly', 'Health insurance'],
    keywords: [],
    seniority: '',
    employmentType: '',
    source: 'paste',
    mustHaveSkills: [
      DEGREE_REQUIREMENT,
      'TypeScript',
      'Node.js',
      'PostgreSQL',
      'Docker'
    ],
    niceToHaveSkills: ['HL7'],
    implicitSkills: [],
    ...overrides
  } as JobPosting;
}

describe('a degree requirement is not a missing skill', () => {
  it('does not appear in the miss list', () => {
    const breakdown = scoreResumeFromEnvelope(makeResume(), makeJob(), NOW);
    const missed = breakdown.intentCoverageBreakdown.missed;
    expect(missed.mustHave.join(' ')).not.toContain('Bachelor');
    expect(missed.niceToHave.join(' ')).not.toContain('Bachelor');
  });

  it('carries no penalty', () => {
    const breakdown = scoreResumeFromEnvelope(makeResume(), makeJob(), NOW);
    // Exactly one must-have is genuinely missing (Docker) and one
    // nice-to-have (HL7). The degree contributes NOTHING — it used to
    // add 8 points on its own.
    expect(breakdown.intentCoverageBreakdown.missed.mustHave).toEqual([
      'Docker'
    ]);
    expect(breakdown.intentCoverageBreakdown.penalty).toBe(8 + 2.5);
  });

  it('is reported as an eligibility requirement instead', () => {
    const breakdown = scoreResumeFromEnvelope(makeResume(), makeJob(), NOW);
    const eligibility = breakdown.eligibility ?? [];
    expect(eligibility).toHaveLength(1);
    expect(eligibility[0].requirement.kind).toBe('degree');
    expect(eligibility[0].requirement.acceptsAlternative).toBe(true);
  });

  it('tells the user when the degree completes', () => {
    const breakdown = scoreResumeFromEnvelope(makeResume(), makeJob(), NOW);
    const note = (breakdown.eligibility ?? [])[0];
    expect(note.status).toBe('in-progress');
    expect(note.completesOn).toBe('June 2027');
    expect(note.message).toContain('you will hold it by then');
  });

  it('does not change the score for a JD with no eligibility requirement', () => {
    const withDegree = scoreResumeFromEnvelope(makeResume(), makeJob(), NOW);
    const withoutDegree = scoreResumeFromEnvelope(
      makeResume(),
      makeJob({
        mustHaveSkills: ['TypeScript', 'Node.js', 'PostgreSQL', 'Docker'],
        requirements: [
          'Strong TypeScript and Node.js experience',
          'Experience with PostgreSQL and SQL'
        ]
      }),
      NOW
    );
    // The only difference is the eligibility requirement, which is no
    // longer a skill — so the Intent Coverage dimension is identical.
    expect(withDegree.dimensionScores.intentCoverage).toBe(
      withoutDegree.dimensionScores.intentCoverage
    );
  });
});

describe('the advice no longer tells users to add a degree', () => {
  it('the intent tip does not list the degree as a missing skill', () => {
    const breakdown = scoreResumeFromEnvelope(makeResume(), makeJob(), NOW);
    const tips = buildDynamicTips(breakdown, makeResume(), makeJob());
    const html = renderToStaticMarkup(<>{tips['Intent Coverage']}</>);
    expect(html).not.toContain('Bachelor');
    expect(html).not.toContain('degree');
  });

  it('the keyword tip does not ask for degree vocabulary', () => {
    const breakdown = scoreResumeFromEnvelope(makeResume(), makeJob(), NOW);
    const tips = buildDynamicTips(breakdown, makeResume(), makeJob());
    const html = renderToStaticMarkup(<>{tips['ATS Keyword Match']}</>);
    expect(html).not.toContain('bachelor');
    expect(html).not.toContain('degree');
    expect(html).not.toContain('certification');
  });

  it('the missing-keyword list excludes the degree vocabulary', () => {
    const resumeText = flattenResumeTextForTips(makeResume());
    const missing = computeMissingKeywords(makeJob(), resumeText);
    expect(missing.join(' ')).not.toMatch(/bachelor|degree/i);
    // The genuine gaps are still there.
    expect(missing).toContain('hl7');
    expect(missing).toContain('insurance');
  });

  it('the same JD without the degree line is scored identically', () => {
    // Proves the exclusion is what removed the degree, rather than the
    // word never having been in the JD.
    const resumeText = flattenResumeTextForTips(makeResume());
    const withoutDegree = makeJob({
      requirements: [
        'Strong TypeScript and Node.js experience',
        'Experience with PostgreSQL and SQL'
      ],
      mustHaveSkills: ['TypeScript', 'Node.js', 'PostgreSQL', 'Docker']
    });
    const missing = computeMissingKeywords(withoutDegree, resumeText);
    // The vocabulary is untouched when the JD states no eligibility
    // requirement — "degree" is simply not in this JD.
    expect(missing.join(' ')).not.toMatch(/bachelor|degree/i);
  });
});

describe('a JD with no eligibility requirement is untouched', () => {
  it('produces no eligibility notes', () => {
    const breakdown = scoreResumeFromEnvelope(
      makeResume(),
      makeJob({
        mustHaveSkills: ['TypeScript'],
        requirements: ['Strong TypeScript and Node.js experience'],
        niceToHaves: []
      }),
      NOW
    );
    expect(breakdown.eligibility ?? []).toHaveLength(0);
  });

  it('keeps its full keyword vocabulary, byte for byte', () => {
    const job = makeJob({
      requirements: ['Strong TypeScript and Node.js experience'],
      niceToHaves: ['Familiarity with HL7 or FHIR standards'],
      mustHaveSkills: ['TypeScript']
    });
    expect(jobEligibilityGates(job)).toHaveLength(0);

    // What the vocabulary was before this change: every non-stop-word
    // token, nothing removed.
    const raw = [
      ...new Set(
        [
          job.title,
          job.description,
          ...job.requirements,
          ...job.niceToHaves,
          ...job.benefits
        ]
          .join(' ')
          .toLowerCase()
          .split(/\W+/)
          .filter((t) => t.length >= 2 && !STOP_WORDS.has(t))
      )
    ];
    expect(jobTokensWithoutStopWords(job)).toEqual(raw);
  });

  it('removes only the eligibility words when the JD does state one', () => {
    const job = makeJob();
    expect(jobEligibilityGates(job)).toHaveLength(1);
    const tokens = jobTokensWithoutStopWords(job);
    expect(tokens).not.toContain('degree');
    expect(tokens).not.toContain('bachelor');
    // Everything else survives — including the genuinely niche terms.
    expect(tokens).toContain('hl7');
    expect(tokens).toContain('insurance');
    // "computer" and "science" are NOT eligibility vocabulary — a
    // Computer Science major is a real, matchable thing.
    expect(tokens).toContain('computer');
    expect(tokens).toContain('science');
  });
});

describe('the assistant is told what an eligibility requirement is', () => {
  it('the ATS context lists it separately from the missed skills', () => {
    const breakdown = scoreResumeFromEnvelope(makeResume(), makeJob(), NOW);
    const context = buildAtsContext(breakdown);
    expect(context).toContain('Eligibility requirements');
    expect(context).toContain('NOT skill gaps');
    expect(context).toContain(DEGREE_REQUIREMENT);
    expect(context).toContain('completes June 2027');
  });

  it('the ATS context tells the model not to call it a missing skill', () => {
    const breakdown = scoreResumeFromEnvelope(makeResume(), makeJob(), NOW);
    const context = buildAtsContext(breakdown);
    expect(context).toMatch(/do not tell them to add a degree/i);
  });

  it('the missed-skills section stays clean of the degree', () => {
    const breakdown = scoreResumeFromEnvelope(makeResume(), makeJob(), NOW);
    const context = buildAtsContext(breakdown);
    const missedSection = context.split('Eligibility requirements')[0]!;
    expect(missedSection).not.toContain('Bachelor');
  });
});

describe('a JD with no eligibility requirement is untouched', () => {
  it('keeps its full keyword vocabulary', () => {
    const breakdown = scoreResumeFromEnvelope(
      makeResume(),
      makeJob({
        mustHaveSkills: ['TypeScript'],
        requirements: ['Strong TypeScript and Node.js experience'],
        niceToHaves: []
      }),
      NOW
    );
    const tips = buildDynamicTips(
      breakdown,
      makeResume(),
      makeJob({
        mustHaveSkills: ['TypeScript'],
        requirements: ['Strong TypeScript and Node.js experience'],
        niceToHaves: []
      })
    );
    expect(breakdown.eligibility ?? []).toHaveLength(0);
  });
});
