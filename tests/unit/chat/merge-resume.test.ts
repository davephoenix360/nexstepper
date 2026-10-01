/**
 * Tests for the `editResume` merge logic
 * (lib/chat/tools/merge-resume.ts).
 *
 * This is where the resume-data bugs actually live, so it is a pure module
 * (no `server-only`, no DB) precisely so it can be tested directly.
 *
 * The first test is a regression test for a real, user-reported bug: the old
 * implementation rebuilt the entire `sections` object inside every branch of a
 * conditional object spread, so each operation **overwrote** the previous one.
 * A single call that set the summary AND added a job silently discarded the
 * summary edit — the revision saved, the UI showed a green "Changes applied",
 * and the user's summary was unchanged.
 */

import { describe, expect, it } from 'vitest';

import { buildMergedData } from '@/lib/chat/tools/merge-resume';
import { blankResumeData, type ResumeData } from '@/lib/resume-schema';

function resumeWithWork(): ResumeData {
  const data = blankResumeData();
  data.sections.basics.name = 'Ada Lovelace';
  data.sections.basics.summary = 'Original summary.';
  data.sections.work = [
    {
      company: 'Acme Corp',
      location: 'London',
      url: '',
      description: '',
      positions: [
        {
          title: 'Backend Engineer',
          startDate: '2022-01',
          endDate: '',
          highlights: ['Shipped the billing service.']
        }
      ]
    }
  ];
  return data;
}

describe('buildMergedData — the section-clobber regression', () => {
  it('applies BOTH setBasics and addWork in one call', () => {
    // This is the exact shape that used to silently lose the summary edit.
    const existing = resumeWithWork();

    const { data, applied } = buildMergedData(existing, {
      setBasics: { summary: 'A much better summary.' },
      addWork: [
        { company: 'Globex', role: 'Staff Engineer', startDate: '2025-01' }
      ]
    });

    expect(data.sections.basics.summary).toBe('A much better summary.');
    expect(data.sections.work).toHaveLength(2);
    expect(data.sections.work[1].company).toBe('Globex');
    expect(applied).toContain('summary');
  });

  it('applies setBasics AND updateWork AND addSkills in one call', () => {
    const existing = resumeWithWork();
    existing.sections.skills = [{ name: 'Backend', level: '', keywords: ['Go'] }];

    const { data } = buildMergedData(existing, {
      setBasics: { summary: 'New summary.' },
      updateWork: [
        { matchCompany: 'Acme', set: { role: 'Senior Backend Engineer' } }
      ],
      addSkills: [{ category: 'Backend', keywords: ['Postgres'] }]
    });

    // All three landed — previously only the last spread survived.
    expect(data.sections.basics.summary).toBe('New summary.');
    expect(data.sections.work[0].positions[0].title).toBe('Senior Backend Engineer');
    expect(data.sections.skills[0].keywords).toEqual(['Go', 'Postgres']);
  });

  it('leaves unrelated sections untouched', () => {
    const existing = resumeWithWork();
    const { data } = buildMergedData(existing, {
      setBasics: { summary: 'Only the summary changes.' }
    });

    // Work history, name, email all preserved.
    expect(data.sections.basics.name).toBe('Ada Lovelace');
    expect(data.sections.work).toHaveLength(1);
    expect(data.sections.work[0].company).toBe('Acme Corp');
    expect(data.sections.work[0].positions[0].highlights).toEqual([
      'Shipped the billing service.'
    ]);
  });

  it('does not mutate the input resume', () => {
    const existing = resumeWithWork();
    const snapshot = JSON.stringify(existing);

    buildMergedData(existing, {
      setBasics: { summary: 'Changed.' },
      addWork: [{ company: 'New Co', role: 'Engineer' }],
      addSkills: [{ category: 'Frontend', keywords: ['React'] }]
    });

    expect(JSON.stringify(existing)).toBe(snapshot);
  });
});

describe('buildMergedData — setBasics', () => {
  it('maps headline onto basics.label and keeps the envelope name in sync', () => {
    const existing = blankResumeData();
    existing.name = 'Old Name';

    const { data } = buildMergedData(existing, {
      setBasics: { name: 'Grace Hopper', headline: 'Compiler Engineer' }
    });

    expect(data.sections.basics.name).toBe('Grace Hopper');
    expect(data.sections.basics.label).toBe('Compiler Engineer');
    expect(data.name).toBe('Grace Hopper');
  });

  it('accepts a bare LinkedIn handle and stores it without mangling a URL', () => {
    const existing = blankResumeData();

    const byHandle = buildMergedData(existing, {
      setBasics: { linkedin: 'ada-lovelace' }
    });
    expect(byHandle.data.sections.basics.profiles[0]).toEqual({
      network: 'LinkedIn',
      username: 'ada-lovelace',
      url: ''
    });

    const byUrl = buildMergedData(existing, {
      setBasics: { linkedin: 'https://linkedin.com/in/adalovelace' }
    });
    expect(byUrl.data.sections.basics.profiles[0]).toEqual({
      network: 'LinkedIn',
      username: '',
      url: 'https://linkedin.com/in/adalovelace'
    });
  });

  it('patches location fields without wiping the other two', () => {
    const existing = blankResumeData();
    existing.sections.basics.location = {
      address: '',
      postalCode: '',
      city: 'Cape Town',
      countryCode: 'ZA',
      region: 'Western Cape'
    };

    const { data } = buildMergedData(existing, {
      setBasics: { city: 'Johannesburg' }
    });

    expect(data.sections.basics.location.city).toBe('Johannesburg');
    expect(data.sections.basics.location.region).toBe('Western Cape');
    expect(data.sections.basics.location.countryCode).toBe('ZA');
  });

  it('treats "clear" as a delete signal for the website', () => {
    const existing = blankResumeData();
    existing.sections.basics.url = 'https://example.com';

    const { data } = buildMergedData(existing, { setBasics: { website: 'clear' } });
    expect(data.sections.basics.url).toBe('');
  });
});

describe('buildMergedData — work', () => {
  it('matches a company case-insensitively and as a substring', () => {
    const existing = resumeWithWork();

    const { data, warnings } = buildMergedData(existing, {
      updateWork: [{ matchCompany: 'acme corp', set: { location: 'Remote' } }]
    });

    expect(warnings).toHaveLength(0);
    expect(data.sections.work[0].location).toBe('Remote');
  });

  it('reports a warning and applies nothing when the company does not match', () => {
    const existing = resumeWithWork();

    const { data, applied, warnings } = buildMergedData(existing, {
      updateWork: [{ matchCompany: 'Nonexistent Inc', set: { location: 'Remote' } }]
    });

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/No work entry matched/i);
    expect(applied).toHaveLength(0);
    expect(data.sections.work[0].location).toBe('London');
  });

  it('targets one position at a multi-role company via matchRole', () => {
    const existing = blankResumeData();
    existing.sections.work = [
      {
        company: 'Acme',
        location: '',
        url: '',
        description: '',
        positions: [
          { title: 'Junior Dev', startDate: '2019', endDate: '2021', highlights: [] },
          { title: 'Senior Dev', startDate: '2021', endDate: '', highlights: [] }
        ]
      }
    ];

    const { data } = buildMergedData(existing, {
      updateWork: [
        { matchCompany: 'Acme', matchRole: 'Senior Dev', set: { role: 'Principal Dev' } }
      ]
    });

    expect(data.sections.work[0].positions[0].title).toBe('Junior Dev');
    expect(data.sections.work[0].positions[1].title).toBe('Principal Dev');
  });

  it('removes only the named position when the company has several', () => {
    const existing = blankResumeData();
    existing.sections.work = [
      {
        company: 'Acme',
        location: '',
        url: '',
        description: '',
        positions: [
          { title: 'Junior Dev', startDate: '', endDate: '', highlights: [] },
          { title: 'Senior Dev', startDate: '', endDate: '', highlights: [] }
        ]
      }
    ];

    const { data } = buildMergedData(existing, {
      removeWork: [{ company: 'Acme', role: 'Junior Dev' }]
    });

    expect(data.sections.work).toHaveLength(1);
    expect(data.sections.work[0].positions).toHaveLength(1);
    expect(data.sections.work[0].positions[0].title).toBe('Senior Dev');
  });

  it('treats "" as "current role" rather than dropping the entry', () => {
    const existing = resumeWithWork();
    const { data } = buildMergedData(existing, {
      updateWork: [{ matchCompany: 'Acme', set: { endDate: '' } }]
    });

    expect(data.sections.work[0].positions[0].endDate).toBe('');
  });
});

describe('buildMergedData — skills', () => {
  it('merges keywords into an existing category instead of replacing it', () => {
    // Regression: the old `{id, name, level}` tool shape replaced the whole
    // array, so "add Python" wiped the user's existing keywords and the
    // category rendered blank in the PDF.
    const existing = blankResumeData();
    existing.sections.skills = [
      { name: 'Backend', level: 'Senior', keywords: ['Go', 'Postgres'] }
    ];

    const { data } = buildMergedData(existing, {
      addSkills: [{ category: 'Backend', keywords: ['Redis'] }]
    });

    expect(data.sections.skills[0].level).toBe('Senior');
    expect(data.sections.skills[0].keywords).toEqual(['Go', 'Postgres', 'Redis']);
  });

  it('creates the category when it does not exist yet', () => {
    const existing = blankResumeData();
    const { data } = buildMergedData(existing, {
      addSkills: [{ category: 'Languages', keywords: ['Python', 'Rust'] }]
    });

    expect(data.sections.skills).toHaveLength(1);
    expect(data.sections.skills[0].name).toBe('Languages');
    expect(data.sections.skills[0].keywords).toEqual(['Python', 'Rust']);
  });

  it('does not duplicate a keyword that is already listed', () => {
    const existing = blankResumeData();
    existing.sections.skills = [{ name: 'Backend', level: '', keywords: ['Go'] }];

    const { data } = buildMergedData(existing, {
      addSkills: [{ category: 'Backend', keywords: ['go', 'Go', 'Postgres'] }]
    });

    expect(data.sections.skills[0].keywords).toEqual(['Go', 'Postgres']);
  });

  it('removes a category entirely once its last keyword is removed', () => {
    const existing = blankResumeData();
    existing.sections.skills = [
      { name: 'Backend', level: '', keywords: ['Go'] },
      { name: 'Frontend', level: '', keywords: ['React'] }
    ];

    const { data } = buildMergedData(existing, {
      removeSkills: [{ category: 'Backend', keywords: ['Go'] }]
    });

    // An empty category renders as a blank heading band in the PDF.
    expect(data.sections.skills).toHaveLength(1);
    expect(data.sections.skills[0].name).toBe('Frontend');
  });

  it('warns instead of silently no-op when the keyword is not there', () => {
    const existing = blankResumeData();
    existing.sections.skills = [{ name: 'Backend', level: '', keywords: ['Go'] }];

    const { warnings } = buildMergedData(existing, {
      removeSkills: [{ category: 'Backend', keywords: ['Rust'] }]
    });

    expect(warnings[0]).toMatch(/none of those keywords/i);
  });
});

describe('buildMergedData — projects', () => {
  it('persists the project url (the old schema called it `link` and dropped it)', () => {
    const existing = blankResumeData();

    const { data } = buildMergedData(existing, {
      addProject: [
        {
          name: 'Nexstepper',
          description: 'Resume builder.',
          url: 'https://nexstepper.app',
          keywords: ['Next.js', 'Drizzle'],
          roles: ['Solo Developer']
        }
      ]
    });

    expect(data.sections.projects[0].url).toBe('https://nexstepper.app');
    expect(data.sections.projects[0].keywords).toEqual(['Next.js', 'Drizzle']);
    expect(data.sections.projects[0].roles).toEqual(['Solo Developer']);
  });

  it('updates a matched project and leaves the rest alone', () => {
    const existing = blankResumeData();
    existing.sections.projects = [
      { name: 'Alpha', description: 'First', highlights: [], keywords: [], startDate: '', endDate: '', url: '', roles: [] },
      { name: 'Beta', description: 'Second', highlights: [], keywords: [], startDate: '', endDate: '', url: '', roles: [] }
    ];

    const { data } = buildMergedData(existing, {
      updateProject: [{ matchName: 'Beta', set: { description: 'Updated.' } }]
    });

    expect(data.sections.projects[1].description).toBe('Updated.');
    expect(data.sections.projects[0].description).toBe('First');
  });
});

describe('buildMergedData — education and leaf sections', () => {
  it('adds education with the nested degree shape', () => {
    const existing = blankResumeData();

    const { data } = buildMergedData(existing, {
      addEducation: [
        {
          institution: 'MIT',
          degreeLevel: 'Bachelor',
          majors: ['Computer Science'],
          endDate: '2018',
          gpa: '3.9/4.0'
        }
      ]
    });

    expect(data.sections.education[0].institution).toBe('MIT');
    expect(data.sections.education[0].degree.degreeLevel).toBe('Bachelor');
    expect(data.sections.education[0].degree.majors).toEqual(['Computer Science']);
  });

  it('adds a language, and updates fluency when it already exists', () => {
    const existing = blankResumeData();
    existing.sections.languages = [{ language: 'English', fluency: 'Fluent' }];

    const { data } = buildMergedData(existing, {
      addLanguages: [
        { language: 'English', fluency: 'Native' },
        { language: 'isiZulu', fluency: 'Conversational' }
      ]
    });

    expect(data.sections.languages).toHaveLength(2);
    expect(data.sections.languages[0].fluency).toBe('Native');
    expect(data.sections.languages[1].language).toBe('isiZulu');
  });

  it('merges interest keywords into an existing interest', () => {
    const existing = blankResumeData();
    existing.sections.interests = [{ name: 'Open Source', keywords: ['React'] }];

    const { data } = buildMergedData(existing, {
      addInterests: [{ name: 'Open Source', keywords: ['TypeScript'] }]
    });

    expect(data.sections.interests[0].keywords).toEqual(['React', 'TypeScript']);
  });
});

describe('buildMergedData — clearSection', () => {
  it('empties the requested section', () => {
    const existing = resumeWithWork();

    const { data, applied } = buildMergedData(existing, { clearSection: ['work'] });

    expect(data.sections.work).toEqual([]);
    expect(applied).toContain('cleared the work section');
  });

  it('wins over an earlier operation on the same section', () => {
    const existing = resumeWithWork();

    const { data } = buildMergedData(existing, {
      addWork: [{ company: 'Globex', role: 'Engineer' }],
      clearSection: ['work']
    });

    // clearSection runs last, so the freshly-added role is gone too.
    expect(data.sections.work).toEqual([]);
  });
});

describe('buildMergedData — empty and no-op calls', () => {
  it('reports no applied changes for an empty call', () => {
    const existing = resumeWithWork();
    const { applied, warnings } = buildMergedData(existing, {});

    expect(applied).toEqual([]);
    expect(warnings).toEqual([]);
  });
});
