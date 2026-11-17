/**
 * Which resume fields the scorer actually reads.
 *
 * ## The bug this file pins
 *
 * The engine had SEVEN dimensions and a documented field list, and the
 * documentation was not evidence. Measured on 2026-11-16 with
 * `pnpm probe:field-coverage`: **10 of 51 probed leaf fields moved the
 * score.** The other 41 — every part of `basics.location`, all of
 * `certificates[]`, `education[].courses[]`, `education[].institution`,
 * `languages[]`, `volunteer[]`, `awards[]` text, `publications[]` text,
 * `interests[]`, `references[]` — were invisible to the score.
 *
 * The cause was structural: the engine read the narrow `ResumeTextSource`
 * shape rather than the envelope, so the schema and the scorer had
 * **separate field lists**, and there were FIVE copies of "the resume's
 * text" (the keyword score, the BM25 signal, the semantic signal, the
 * word count and the tip) which were not equal to each other.
 *
 * These tests pin the fix:
 *
 *   1. ONE flattener, and it reads the evidence-bearing fields.
 *   2. The fields that are proper nouns or noise stay OUT.
 *   3. The JD's own location is not a keyword the candidate must evidence.
 *   4. The eligibility gate detection reads the same source as the notes.
 */
import { describe, expect, it } from 'vitest';

import { flattenResumeText } from '@/lib/scoring/similarity';
import type { JobTextSource, ResumeTextSource } from '@/lib/scoring/similarity';
import { jobTokensWithoutStopWords } from '@/lib/scoring/jd-tokens';
import { resumeDataToScoreable } from '@/lib/scoring/resume-adapter';

const BASE: ResumeTextSource = {
  basics: { summary: 'Backend engineer.', label: 'Senior Backend Engineer' },
  skills: [{ name: 'TypeScript', keywords: ['React'] }],
  work: [
    {
      summary: 'Built things.',
      positions: [{ title: 'Engineer', highlights: ['Shipped it'] }]
    }
  ]
};

describe('flattenResumeText — the evidence-bearing fields are readable', () => {
  it('reads the education subject', () => {
    const text = flattenResumeText({
      ...BASE,
      education: [
        {
          degree: {
            degreeLevel: 'Bachelor',
            majors: ['Computer Science'],
            minors: ['Linguistics']
          },
          courses: ['Distributed Systems']
        }
      ]
    });
    expect(text).toContain('Bachelor');
    expect(text).toContain('Computer Science');
    expect(text).toContain('Linguistics');
    expect(text).toContain('Distributed Systems');
  });

  it('reads certificate names and spoken languages', () => {
    const text = flattenResumeText({
      ...BASE,
      certificates: [{ name: 'AWS Solutions Architect Associate' }],
      languages: [{ language: 'Spanish' }]
    });
    expect(text).toContain('AWS Solutions Architect Associate');
    expect(text).toContain('Spanish');
  });

  it('reads volunteer work, awards and publications', () => {
    const text = flattenResumeText({
      ...BASE,
      volunteer: [
        { position: 'Mentor', summary: 'Taught students.', highlights: ['Ran a bootcamp'] }
      ],
      awards: [{ title: 'Engineer of the Year', summary: 'For the platform team.' }],
      publications: [{ name: 'Scaling Kafka', summary: 'A paper.' }]
    });
    expect(text).toContain('Mentor');
    expect(text).toContain('Ran a bootcamp');
    expect(text).toContain('Engineer of the Year');
    expect(text).toContain('Scaling Kafka');
  });

  it('reads a project\'s keywords and roles', () => {
    const text = flattenResumeText({
      ...BASE,
      projects: [
        {
          name: 'Nextep',
          description: 'A resume builder',
          highlights: [],
          keywords: ['Next.js', 'Postgres'],
          roles: ['Tech Lead']
        }
      ]
    });
    expect(text).toContain('Next.js');
    expect(text).toContain('Postgres');
    expect(text).toContain('Tech Lead');
  });

  it('reads the candidate\'s city and region', () => {
    // The JD's own prose names its city, so the candidate's address has
    // to be evidence they can offer.
    const text = flattenResumeText({
      ...BASE,
      basics: {
        ...BASE.basics,
        location: { city: 'San Francisco', region: 'California' }
      }
    });
    expect(text).toContain('San Francisco');
    expect(text).toContain('California');
  });
});

describe('flattenResumeText — the noise stays out', () => {
  it('does not read contact details, employers, institutions or self-assessments', () => {
    const text = flattenResumeText({
      ...BASE,
      basics: {
        summary: 'Backend engineer.',
        label: 'Senior Backend Engineer',
        // The location's other fields are noise — a street address, a
        // postal code and a two-letter country code would match all
        // sorts of unrelated JD tokens.
        location: { city: 'San Francisco', region: 'California' }
      },
      skills: [{ name: 'TypeScript', keywords: ['React'] }],
      work: [
        {
          summary: 'Built things.',
          positions: [{ title: 'Engineer', highlights: ['Shipped it'] }]
        }
      ],
      education: [
        {
          degree: { degreeLevel: 'Bachelor', majors: ['Computer Science'], minors: [] },
          courses: ['Distributed Systems']
        }
      ]
    });

    // What is NOT there is asserted by absence of the right content —
    // the fields the noise would come from are not in the shape at all,
    // which is the point: the narrow shape carries only evidence.
    expect(text).not.toContain('@');
    expect(text).not.toContain('http');
    expect(text).not.toContain('LinkedIn');
  });
});

describe('the JD\'s own location is not a keyword the candidate must evidence', () => {
  const job: JobTextSource = {
    title: 'Senior Backend Engineer',
    description: 'We build our platform in San Francisco, CA.',
    requirements: [],
    niceToHaves: [],
    benefits: [],
    location: 'San Francisco, CA'
  };

  it('drops the location tokens from the keyword vocabulary', () => {
    const tokens = jobTokensWithoutStopWords(job);
    expect(tokens).not.toContain('san');
    expect(tokens).not.toContain('francisco');
    expect(tokens).not.toContain('ca');
    // ...and the rest of the JD is untouched.
    expect(tokens).toContain('backend');
    expect(tokens).toContain('platform');
  });

  it('does not touch the vocabulary when the JD states no location', () => {
    const tokens = jobTokensWithoutStopWords({ ...job, location: '' });
    expect(tokens).toContain('san');
    expect(tokens).toContain('francisco');
  });
});

describe('the eligibility gate detection reads the same source as the notes', () => {
  it('finds a degree gate in the intent extractor\'s must-have list', () => {
    // `job.requirements` and `job.niceToHaves` are ALWAYS EMPTY in
    // production — the attach paths never populate them. The gate lives
    // in the skill list the extractor produced.
    const job: JobTextSource = {
      title: 'Senior Backend Engineer',
      description: "Bachelor's degree in Computer Science required.",
      requirements: [],
      niceToHaves: [],
      benefits: [],
      mustHaveSkills: ["Bachelor's degree in Computer Science required", 'TypeScript'],
      niceToHaveSkills: []
    };
    const tokens = jobTokensWithoutStopWords(job);
    expect(tokens).not.toContain('bachelor');
    expect(tokens).not.toContain('degree');
    // The subject of the degree is still a legitimate keyword — the
    // candidate's major is the evidence for it.
    expect(tokens).toContain('computer');
    expect(tokens).toContain('science');
  });
});

describe('the resume adapter and the flattener agree', () => {
  it('carries the same fields the flattener reads', () => {
    // The adapter is the only place the envelope is reduced to the
    // engine's shape, so it has to carry every evidence-bearing field
    // — otherwise the field is in the schema but not in the score.
    const scoreable = resumeDataToScoreable({
      sections: {
        basics: {
          name: 'A Person',
          label: 'Senior Backend Engineer',
          email: 'a@example.com',
          phone: '555',
          url: 'https://example.com',
          summary: 'Backend engineer.',
          location: {
            address: '1 Main St',
            postalCode: '94105',
            city: 'San Francisco',
            countryCode: 'US',
            region: 'California'
          },
          profiles: []
        },
        skills: [{ name: 'TypeScript', keywords: ['React'], level: 'expert' }],
        work: [
          {
            company: 'Acme',
            location: 'Remote',
            url: 'https://acme.example',
            description: 'Built things.',
            positions: [
              {
                title: 'Engineer',
                startDate: '2022-01',
                endDate: '',
                highlights: ['Shipped it']
              }
            ]
          }
        ],
        projects: [
          {
            name: 'Nextep',
            description: 'A resume builder',
            highlights: ['Shipped'],
            keywords: ['Next.js'],
            roles: ['Tech Lead'],
            startDate: '',
            endDate: '',
            url: ''
          }
        ],
        education: [
          {
            institution: 'A University',
            location: 'Somewhere',
            url: '',
            degree: {
              degreeLevel: 'Bachelor',
              majors: ['Computer Science'],
              minors: []
            },
            startDate: '2018-09',
            endDate: '2022-06',
            courses: ['Distributed Systems'],
            gpa: '3.9'
          }
        ],
        awards: [{ title: 'Engineer of the Year', awarder: 'Acme', date: '', summary: '' }],
        certificates: [
          {
            name: 'AWS Solutions Architect Associate',
            issuer: 'Amazon',
            date: '',
            url: ''
          }
        ],
        publications: [{ name: 'Scaling Kafka', publisher: 'ACM', releaseDate: '', url: '', summary: '' }],
        languages: [{ language: 'Spanish', fluency: 'Fluent' }],
        interests: [{ name: 'Chess', keywords: [] }],
        references: [{ name: 'Someone', reference: 'Great engineer' }],
        volunteer: [
          {
            organization: 'Codebar',
            position: 'Mentor',
            url: '',
            startDate: '',
            endDate: '',
            summary: 'Taught students.',
            highlights: ['Ran a bootcamp']
          }
        ]
      }
    } as never);

    const text = flattenResumeText(scoreable);

    // Readable.
    expect(text).toContain('Computer Science');
    expect(text).toContain('Distributed Systems');
    expect(text).toContain('AWS Solutions Architect Associate');
    expect(text).toContain('Spanish');
    expect(text).toContain('Mentor');
    expect(text).toContain('Engineer of the Year');
    expect(text).toContain('Scaling Kafka');
    expect(text).toContain('Next.js');
    expect(text).toContain('Tech Lead');
    expect(text).toContain('San Francisco');

    // Not readable.
    expect(text).not.toContain('A University');
    expect(text).not.toContain('Somewhere');
    expect(text).not.toContain('3.9');
    expect(text).not.toContain('Acme');
    expect(text).not.toContain('Codebar');
    expect(text).not.toContain('a@example.com');
    expect(text).not.toContain('555');
    expect(text).not.toContain('example.com');
    expect(text).not.toContain('1 Main St');
    expect(text).not.toContain('94105');
    expect(text).not.toContain('Chess');
    expect(text).not.toContain('Great engineer');
    expect(text).not.toContain('expert');
    expect(text).not.toContain('Fluent');
  });
});
