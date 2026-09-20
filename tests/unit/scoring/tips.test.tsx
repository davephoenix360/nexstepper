import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  buildDynamicTips,
  collectHighlights,
  computeMissingKeywords,
  computeMissingSections,
  computeUncoveredRequirements,
  CRITERIA_TIPS,
  flattenResumeTextForTips,
  tokenizeLight,
  type DynamicTips
} from '@/lib/scoring/tips';
import type { JobPosting, ResumeData } from '@/lib/resume-schema';
import type { ScoreBreakdown } from '@/lib/scoring';
import type { DeepPartial } from '@/tests/fixtures/types';

/**
 * Locks the per-sub-criterion dynamic tip helper.
 *
 * The dynamic tips render as JSX (ReactNode), so we render them via
 * `renderToStaticMarkup` for assertion rather than relying on string
 * equality. That's how the panel itself will render them at runtime
 * (inside a shadcn TooltipContent).
 *
 * Pure-function tests cover:
 *   - computeMissingKeywords (ATS Keyword Match dynamic signal)
 *   - computeUncoveredRequirements (ATS Coverage dynamic signal)
 *   - computeMissingSections (Section Completeness dynamic signal)
 *   - collectHighlights (Action Verb + Accomplishment Focus signals)
 *   - flattenResumeTextForTips (the flattened signal the others read)
 *   - tokenizeLight (the cheap tokenization shared by the above)
 *   - buildDynamicTips end-to-end (golden regression per criterion)
 */

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeBreakdown(overrides: Partial<ScoreBreakdown> = {}): ScoreBreakdown {
  return {
    overallScore: 70,
    computedInMs: 5,
    intentCoverageBreakdown: {
      value: 50,
      missed: { mustHave: [], niceToHave: [], implicit: [] },
      penalty: 0,
      fallback: true
    },
    ...overrides,
    // Merge partial overrides for nested objects so a test can
    // override just `criteriaScores: { 'ATS Keyword Match': 50 }`
    // without wiping out the new v2 'Intent Coverage' key. Same
    // shape concern that surfaced in `tests/unit/jd-panel.test.tsx`
    // after the v1 merge — see commit `a4a47a1` for the related
    // discussion of `DeepPartial` vs shallow spread.
    criteriaScores: {
      'ATS Keyword Match': 50,
      'ATS Similarity': 60,
      'ATS Coverage': 50,
      'Intent Coverage': 50,
      'Section Completeness': 100,
      'Optimal Length': 80,
      'Accomplishment Focus': 70,
      'Action Verb Usage': 60,
      Tailoring: 30,
      'Unique Value': 100,
      'Soft Skills': 25,
      'Role Fit': 50,
      'Seniority Fit': 50,
      ...overrides.criteriaScores
    },
    dimensionScores: {
      atsMatching: 60,
      structure: 80,
      contentQuality: 70,
      alignment: 60,
      intentCoverage: 50,
      roleFit: 50,
      seniorityFit: 50,
      ...overrides.dimensionScores
    }
  };
}

function makeResume(overrides: DeepPartial<ResumeData> = {}): ResumeData {
  // Explicit annotation is required — without it, the `baseSections`
  // object literal infers to a structural type with REQUIRED keys
  // (name, label, summary, etc.) from the schema's `.default()` calls,
  // but the spread-with-overrides result merges with `DeepPartial<…>`
  // (everything optional) and TypeScript loses the "fully populated"
  // signal. Pinning to `ResumeData['sections']` keeps the spread
  // type-clean. The optional `overrides.sections` will only widen
  // existing fields, never unset them, at runtime.
  const baseSections: ResumeData['sections'] = {
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
              // Mix of strong+quantified, strong+un-quantified, and
              // weak+un-quantified so the dynamic-tip content-quality
              // checks have something to report on the base fixture.
              'Built the payments platform serving 12M users on AWS',
              'Mentored engineers across 2 teams',
              'Helped the team deliver on quarterly OKRs'
            ]
          }
        ]
      }
    ],
    education: [
      {
        institution: 'State University',
        url: '',
        location: '',
        degree: {
          degreeLevel: 'Bachelor',
          majors: ['Computer Science'],
          minors: []
        },
        startDate: '2014',
        endDate: '2018',
        gpa: '',
        courses: []
      }
    ],
    skills: [
      { name: 'Languages', level: 'expert', keywords: ['typescript', 'python'] },
      { name: 'Cloud', level: 'expert', keywords: ['aws', 'gcp'] }
    ],
    projects: [],
    volunteer: [],
    awards: [],
    publications: [],
    certificates: [],
    languages: [],
    interests: [],
    references: []
  };
  const base: ResumeData = {
    name: 'Test Resume',
    note: '',
    status: 'draft',
    template: 'classic',
    jobContext: null,
    // Cast because `DeepPartial<sections>` widens fields to optional,
    // which loses the "fully populated" signal. Safe at runtime —
    // `overrides.sections` only widens specific fields, never unsets
    // them. The base supplies every required key.
    sections: {
      ...baseSections,
      ...(overrides.sections ?? {})
    } as ResumeData['sections']
  };
  return { ...base, ...overrides, sections: base.sections } as ResumeData;
}

function makeJob(overrides: DeepPartial<JobPosting> = {}): JobPosting {
  // The base literal supplies the full JobPosting shape; overrides
  // only widen specific fields. The spread-with-DeepPartial loses
  // the inferred type's "required" markings, so we build the base
  // explicitly with a typed local + cast the result to keep tsc quiet.
  const base: JobPosting = {
    id: 'job-1',
    url: '',
    title: 'Senior TypeScript Engineer',
    company: 'Stripe',
    location: 'Remote',
    description: 'Build payments platforms with React and Node on AWS.',
    requirements: [
      '5+ years TypeScript experience',
      'Strong AWS skills',
      'Experience with Kubernetes and Terraform'
    ],
    niceToHaves: [],
    benefits: [],
    keywords: ['typescript', 'react', 'aws'],
    seniority: '',
    employmentType: '',
    source: 'paste',
    capturedAt: '2026-01-01T00:00:00.000Z',
    // v2 intent-extraction fields — base fixture represents a JD
    // where the extractor hasn't run. Tests that exercise v2 supply
    // these via overrides.
    mustHaveSkills: [],
    niceToHaveSkills: [],
    implicitSkills: [],
    seniorityLevel: null,
    yearsRequiredMin: null,
    yearsRequiredMax: null,
    roleFamily: null,
    domainSignals: []
  };
  return { ...base, ...overrides } as JobPosting;
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe('tokenizeLight', () => {
  it('lowercases, splits on non-word chars, filters short tokens', () => {
    expect(tokenizeLight('Built the API in 2020 on AWS!')).toEqual([
      'built',
      'the',
      'api',
      'in',
      '2020',
      'on',
      'aws'
    ]);
  });

  it('drops tokens shorter than 2 chars', () => {
    expect(tokenizeLight('A B cd EF')).toEqual(['cd', 'ef']);
  });

  it('returns empty for empty input', () => {
    expect(tokenizeLight('')).toEqual([]);
  });
});

describe('flattenResumeTextForTips', () => {
  it('joins basics + skills + work + education text', () => {
    const text = flattenResumeTextForTips(makeResume());
    expect(text).toContain('Senior TypeScript engineer');
    expect(text).toContain('typescript');
    expect(text).toContain('payments platform');
    expect(text).toContain('State University');
    expect(text).toContain('Bachelor');
    expect(text).toContain('Computer Science');
  });

  it('returns empty-ish string for an empty resume (basics label only)', () => {
    const empty = makeResume({
      sections: {
        basics: {
          name: '',
          label: '',
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
        references: []
      }
    });
    const text = flattenResumeTextForTips(empty).trim();
    expect(text).toBe('');
  });
});

describe('computeMissingKeywords', () => {
  it('returns JD tokens missing from the resume text', () => {
    const job = makeJob({
      title: 'Kubernetes Platform Engineer',
      description: 'Operate a Kubernetes platform with Terraform and Helm.',
      requirements: ['Kubernetes', 'Terraform']
    });
    const resumeText =
      'Senior engineer with AWS and Python experience on ECS clusters.';
    const missing = computeMissingKeywords(job, resumeText);
    expect(missing).toContain('kubernetes');
    expect(missing).toContain('terraform');
    expect(missing).toContain('helm');
    expect(missing).not.toContain('aws');
  });

  it('returns [] when every JD token is in the resume', () => {
    const job = makeJob({
      title: 'TypeScript Engineer',
      description: 'Build React apps with Node and TypeScript.',
      requirements: []
    });
    // Resume mirrors the JD's vocabulary so every meaningful token
    // (typescript, react, node, build, apps, engineer) hits.
    const resumeText =
      'A typescript engineer who likes to build react apps with node.';
    expect(computeMissingKeywords(job, resumeText)).toEqual([]);
  });

  it('stops at stop words', () => {
    const job = makeJob({
      title: '',
      description: 'the and with for from',
      requirements: []
    });
    expect(computeMissingKeywords(job, 'whatever')).toEqual([]);
  });
});

describe('computeUncoveredRequirements', () => {
  it('returns requirements whose tokens are absent from the resume', () => {
    const job = makeJob({
      requirements: [
        'Kubernetes experience',
        'Terraform experience',
        'Go programming language'
      ]
    });
    const resumeText = 'Senior TypeScript engineer with React and Node.';
    const uncovered = computeUncoveredRequirements(job, resumeText);
    expect(uncovered).toContain('Kubernetes experience');
    expect(uncovered).toContain('Terraform experience');
    expect(uncovered).toContain('Go programming language');
  });

  it('omits requirements that share ANY token with the resume', () => {
    const job = makeJob({
      requirements: [
        'Kubernetes experience', // missing
        'TypeScript developer', // hits via 'typescript'
        'AWS engineer' // hits via 'aws'
      ]
    });
    const resumeText = 'TypeScript engineer with React and AWS.';
    const uncovered = computeUncoveredRequirements(job, resumeText);
    expect(uncovered).toEqual(['Kubernetes experience']);
  });

  it('returns [] when there are no requirements', () => {
    expect(
      computeUncoveredRequirements(makeJob({ requirements: [] }), 'whatever')
    ).toEqual([]);
  });
});

describe('computeMissingSections', () => {
  it('returns [] when every section is present', () => {
    expect(computeMissingSections(makeResume())).toEqual([]);
  });

  it('lists every missing section', () => {
    const empty = makeResume({
      sections: {
        basics: {
          name: 'Jane',
          label: 'Engineer',
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
        references: []
      }
    });
    expect(computeMissingSections(empty)).toEqual([
      'Summary',
      'Experience',
      'Education',
      'Skills'
    ]);
  });

  it('lists Summary as missing when only the label is filled (no summary)', () => {
    // Label ("job title") and Summary serve different purposes. A
    // label without a summary still leaves the Summary section
    // empty — the user is missing actual summary prose.
    const onlyLabel = makeResume({
      sections: {
        basics: {
          name: 'Jane',
          label: 'Engineer',
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
        }
      }
    });
    expect(computeMissingSections(onlyLabel)).toContain('Summary');
  });
});

describe('collectHighlights', () => {
  it('returns every work[*].positions[*].highlights string', () => {
    const highlights = collectHighlights(makeResume());
    expect(highlights).toContain('Built the payments platform serving 12M users on AWS');
    expect(highlights).toContain('Mentored engineers across 2 teams');
    expect(highlights).toContain('Helped the team deliver on quarterly OKRs');
    expect(highlights).toHaveLength(3);
  });

  it('skips empty / whitespace-only entries', () => {
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
                startDate: '',
                endDate: '',
                highlights: ['Real highlight', '', '   ', 'Another real highlight']
              }
            ]
          }
        ]
      }
    });
    expect(collectHighlights(resume)).toEqual([
      'Real highlight',
      'Another real highlight'
    ]);
  });
});

// ---------------------------------------------------------------------------
// buildDynamicTips — golden regression per criterion
// ---------------------------------------------------------------------------

/**
 * Helper: render a ReactNode tip (string or JSX) to plain HTML so we
 * can assert against it. Mirrors how the scorecard panel renders the
 * tip (inside TooltipContent).
 */
function renderTip(tip: React.ReactNode): string {
  return renderToStaticMarkup(<>{tip}</>);
}

describe('buildDynamicTips — no resume', () => {
  it('returns an empty object when resume is null', () => {
    const breakdown = makeBreakdown();
    expect(buildDynamicTips(breakdown, null, makeJob())).toEqual({});
  });
});

describe('buildDynamicTips — JD-aware criteria', () => {
  it('reports missing JD keywords when the resume is missing several', () => {
    const resume = makeResume(); // typescript/aws only
    const job = makeJob({
      title: 'Kubernetes Platform Engineer',
      description: 'Operate Kubernetes clusters with Terraform and Helm.',
      requirements: ['Kubernetes expertise', 'Terraform scripting']
    });
    const tips = buildDynamicTips(makeBreakdown(), resume, job);
    const html = renderTip(tips['ATS Keyword Match']!);
    expect(html).toContain('Add these missing keywords from the JD');
    // We don't assert specific keyword order — `buildDynamicTips`
    // shows the first 3 missing tokens in insertion order, and the
    // exact set depends on which JD tokens overlap the resume
    // (e.g. "engineer", "platform" match the base fixture). Just
    // confirm the dynamic tip fired with the right header + a
    // <strong> block.
    expect(html).toMatch(/<strong>[^<]+<\/strong>/);
    // The matching-keywords signal — assert via the helper directly
    // so we lock the specific token list without coupling to render order.
    const missing = computeMissingKeywords(
      job,
      flattenResumeTextForTips(resume)
    );
    expect(missing).toContain('kubernetes');
    expect(missing).toContain('terraform');
    expect(missing).toContain('helm');
  });

  it('omits ATS Keyword Match when the resume already covers all JD tokens', () => {
    const resume = makeResume();
    const job = makeJob({
      title: 'TypeScript Engineer',
      description: 'React and Node applications on AWS.',
      requirements: ['TypeScript', 'React', 'AWS']
    });
    const tips = buildDynamicTips(makeBreakdown(), resume, job);
    expect(tips['ATS Keyword Match']).toBeUndefined();
  });

  it('flags BM25 similarity below 70 with a specific score', () => {
    const breakdown = makeBreakdown({
      criteriaScores: {
        'ATS Keyword Match': 50,
        'ATS Similarity': 35,
        'ATS Coverage': 50,
        'Section Completeness': 100,
        'Optimal Length': 80,
        'Accomplishment Focus': 70,
        'Action Verb Usage': 60,
        Tailoring: 30,
        'Unique Value': 100,
        'Soft Skills': 25,
        'Intent Coverage': 50,
        'Role Fit': 50,
        'Seniority Fit': 50
      }
    });
    const tips = buildDynamicTips(breakdown, makeResume(), makeJob());
    const html = renderTip(tips['ATS Similarity']!);
    expect(html).toContain('BM25 similarity is');
    expect(html).toContain('35/100');
  });

  it('omits ATS Similarity when the score is at/above 70', () => {
    const breakdown = makeBreakdown({
      criteriaScores: {
        'ATS Keyword Match': 80,
        'ATS Similarity': 70,
        'ATS Coverage': 80,
        'Section Completeness': 100,
        'Optimal Length': 80,
        'Accomplishment Focus': 70,
        'Action Verb Usage': 60,
        Tailoring: 30,
        'Unique Value': 100,
        'Soft Skills': 25,
        'Intent Coverage': 80,
        'Role Fit': 50,
        'Seniority Fit': 50
      }
    });
    expect(
      buildDynamicTips(breakdown, makeResume(), makeJob())['ATS Similarity']
    ).toBeUndefined();
  });

  it('lists the requirements the resume is not addressing', () => {
    const resume = makeResume();
    const job = makeJob({
      requirements: [
        'Kubernetes expertise', // missing
        'Terraform scripting', // missing
        'TypeScript experience' // hit via summary
      ]
    });
    const tips = buildDynamicTips(makeBreakdown(), resume, job);
    const html = renderTip(tips['ATS Coverage']!);
    expect(html).toContain('addressing');
    expect(html).toContain('Kubernetes expertise');
    expect(html).toContain('Terraform scripting');
    expect(html).not.toContain('TypeScript experience');
  });

  it('omits ATS Coverage when every requirement is covered', () => {
    const resume = makeResume();
    const job = makeJob({
      requirements: ['TypeScript developer', 'AWS engineer']
    });
    expect(
      buildDynamicTips(makeBreakdown(), resume, job)['ATS Coverage']
    ).toBeUndefined();
  });
});

describe('buildDynamicTips — structure criteria', () => {
  it('lists missing sections when basics/work/education/skills are absent', () => {
    const empty = makeResume({
      sections: {
        basics: {
          name: '',
          label: '',
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
        references: []
      }
    });
    const tips = buildDynamicTips(makeBreakdown(), empty, null);
    const html = renderTip(tips['Section Completeness']!);
    expect(html).toContain('missing the');
    expect(html).toContain('Summary');
    expect(html).toContain('Experience');
    expect(html).toContain('Education');
    expect(html).toContain('Skills');
  });

  it('flags a too-short resume (under 500 words)', () => {
    const resume = makeResume(); // small body
    const tips = buildDynamicTips(makeBreakdown(), resume, null);
    const html = renderTip(tips['Optimal Length']!);
    expect(html).toContain('well under the 500-word minimum');
    expect(html).toMatch(/<strong>\d+ words<\/strong>/);
  });

  it('omits Optimal Length when the resume is in the 500-800 sweet spot', () => {
    // Pad a resume to ~700 words (~350 "lorem ipsum" pairs) of
    // filler inside the summary, then drop the other sections that
    // would push us past the 800-word ceiling. Net word count
    // should land in the 500-800 sweet spot.
    const filler = 'lorem ipsum '.repeat(350).trim();
    const resume = makeResume({
      sections: {
        basics: {
          name: 'Jane',
          label: 'Engineer',
          email: '',
          phone: '',
          url: '',
          summary: filler,
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
        references: []
      }
    });
    expect(
      buildDynamicTips(makeBreakdown(), resume, null)['Optimal Length']
    ).toBeUndefined();
  });
});

describe('buildDynamicTips — content quality criteria', () => {
  it('reports highlights that lack numeric quantification', () => {
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
                startDate: '',
                endDate: '',
                highlights: [
                  'Built a payments platform', // no digits
                  'Mentored engineers across teams', // no digits
                  'Reduced API latency by 40%' // has digits
                ]
              }
            ]
          }
        ]
      }
    });
    const tips = buildDynamicTips(makeBreakdown(), resume, null);
    const html = renderTip(tips['Accomplishment Focus']!);
    expect(html).toContain('1 of 3');
    expect(html).toContain('include a number');
  });

  it('omits Accomplishment Focus when every highlight already has digits', () => {
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
                startDate: '',
                endDate: '',
                highlights: ['Served 12M users', 'Saved 40% cost']
              }
            ]
          }
        ]
      }
    });
    expect(
      buildDynamicTips(makeBreakdown(), resume, null)['Accomplishment Focus']
    ).toBeUndefined();
  });

  it('reports weak-verb starters by name', () => {
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
                startDate: '',
                endDate: '',
                highlights: [
                  'Built payments platform', // strong
                  'Helped the team deliver', // weak
                  'Worked on the API' // weak
                ]
              }
            ]
          }
        ]
      }
    });
    const tips = buildDynamicTips(makeBreakdown(), resume, null);
    const html = renderTip(tips['Action Verb Usage']!);
    expect(html).toContain('2 of 3');
    expect(html).toContain('helped');
    expect(html).toContain('worked');
  });
});

describe('buildDynamicTips — alignment criteria', () => {
  it('lists title keywords absent from a short summary', () => {
    const resume = makeResume({
      sections: {
        basics: {
          name: 'Jane',
          label: 'Engineer',
          email: '',
          phone: '',
          url: '',
          summary: 'Generic engineer with broad experience.',
          location: {
            address: '',
            postalCode: '',
            city: '',
            countryCode: '',
            region: ''
          },
          profiles: []
        }
      }
    });
    const job = makeJob({
      title: 'Senior Kubernetes Platform Engineer'
    });
    const breakdown = makeBreakdown({
      criteriaScores: {
        'ATS Keyword Match': 50,
        'ATS Similarity': 40,
        'ATS Coverage': 50,
        'Section Completeness': 100,
        'Optimal Length': 80,
        'Accomplishment Focus': 70,
        'Action Verb Usage': 60,
        Tailoring: 10, // low score → dynamic tip triggers
        'Unique Value': 100,
        'Soft Skills': 25,
        'Intent Coverage': 50,
        'Role Fit': 50,
        'Seniority Fit': 50
      }
    });
    const tips = buildDynamicTips(breakdown, resume, job);
    const html = renderTip(tips['Tailoring']!);
    expect(html).toContain('10%');
    expect(html).toContain('senior');
    expect(html).toContain('kubernetes');
    expect(html).toContain('platform');
  });

  it('lists missing soft skills', () => {
    // Keep at least one soft-skill phrase present (so the tip
    // fires — it only renders when SOME are present), and verify
    // the dynamic tip enumerates the absent ones.
    const resume = makeResume({
      sections: {
        // Wipe soft-skill keywords out of the basics + most fields,
        // but keep exactly one phrase in a highlight so the partial-
        // missing condition triggers.
        basics: {
          name: 'Jane',
          label: '',
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
              {
                title: 'Engineer',
                startDate: '',
                endDate: '',
                // The phrase "team" is in SOFT_SKILLS — keeps the
                // resume on the partial-missing branch.
                highlights: ['Built things with the team']
              }
            ]
          }
        ],
        skills: [],
        education: []
      }
    });
    const tips = buildDynamicTips(makeBreakdown(), resume, null);
    const html = renderTip(tips['Soft Skills']!);
    // Partial-missing tips list every absent phrase via
    // joinWithAnd — confirm the header wording + that at least one
    // other soft-skill phrase surfaces in the <strong> block.
    expect(html).toContain('Your resume is missing');
    expect(html).toMatch(/<strong>[^<]+<\/strong>/);
  });
});

// ---------------------------------------------------------------------------
// Static CRITERIA_TIPS — locks the fallback surface.
// ---------------------------------------------------------------------------

describe('CRITERIA_TIPS', () => {
  it('has an entry for every sub-criterion in ScoreBreakdown.criteriaScores', () => {
    const breakdown = makeBreakdown();
    const keys = Object.keys(breakdown.criteriaScores);
    expect(keys).toHaveLength(13);
    for (const key of keys) {
      expect(CRITERIA_TIPS).toHaveProperty(key);
      expect(typeof CRITERIA_TIPS[key]).toBe('string');
      expect(CRITERIA_TIPS[key].length).toBeGreaterThan(20);
    }
  });
});

// ---------------------------------------------------------------------------
// End-to-end: empty jobContext → empty dynamic tip map.
// ---------------------------------------------------------------------------

describe('buildDynamicTips — no JD', () => {
  it('still populates structure + content quality tips when job is null', () => {
    const tips: DynamicTips = buildDynamicTips(
      makeBreakdown(),
      makeResume(),
      null
    );
    // Structure / content are JD-independent.
    expect(tips['Optimal Length']).toBeDefined();
    expect(tips['Accomplishment Focus']).toBeDefined();
    expect(tips['Action Verb Usage']).toBeDefined();
    // JD-dependent criteria are absent.
    expect(tips['ATS Keyword Match']).toBeUndefined();
    expect(tips['ATS Similarity']).toBeUndefined();
    expect(tips['ATS Coverage']).toBeUndefined();
  });
});
