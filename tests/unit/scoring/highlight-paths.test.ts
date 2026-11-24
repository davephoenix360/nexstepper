/**
 * The bullet coordinates that connect the ADVICE to the LEAF.
 *
 * ## The invariant this pins
 *
 * Three lists are involved, and they must agree index for index:
 *
 *   1. the engine's flattened work bullets (Content Quality dimension)
 *   2. the tip's flattened work bullets (`tips.tsx > collectHighlights`)
 *   3. the breakdown's `jevBullets` (aligned to 1 and 2 positionally)
 *
 * The tip names bullets by their index in list 2. The popover needs the
 * EDITOR PATH of that bullet. If list 3 (the paths) ever drifts from
 * list 2 (the advice), the popover opens on one bullet while the advice
 * names another — which is exactly the bug this fixes.
 *
 * So: the texts must be identical, index for index.
 */
import { describe, expect, it } from 'vitest';

import {
  collectHighlightEntries,
  parseWorkHighlightPath,
  pathForHighlightIndex
} from '@/lib/scoring/highlight-paths';
import { collectHighlights } from '@/lib/scoring/tips';
import { resumeDataSchema } from '@/lib/resume-schema';

function makeResume() {
  return resumeDataSchema.parse({
    name: 'Test Resume',
    note: '',
    status: 'draft',
    template: 'classic',
    jobContext: null,
    sections: {
      basics: {
        name: 'Jane Doe',
        label: 'Engineer',
        email: '',
        phone: '',
        url: '',
        summary: 'Engineer.',
        location: {
          address: '',
          postalCode: '',
          city: '',
          countryCode: '',
          region: ''
        },
        profiles: []
      },
      skills: [],
      work: [
        {
          company: 'Acme',
          location: '',
          url: '',
          description: '',
          positions: [
            {
              title: 'Engineer',
              startDate: '2020-01',
              endDate: '',
              highlights: ['First bullet', 'Second bullet', 'Third bullet']
            },
            {
              title: 'Senior Engineer',
              startDate: '2022-01',
              endDate: '',
              highlights: ['Fourth bullet']
            }
          ]
        },
        {
          company: 'Globex',
          location: '',
          url: '',
          description: '',
          positions: [
            {
              title: 'Engineer',
              startDate: '2023-01',
              endDate: '',
              highlights: ['Fifth bullet']
            }
          ]
        }
      ],
      projects: [],
      education: [],
      awards: [],
      certificates: [],
      publications: [],
      languages: [],
      interests: [],
      references: [],
      volunteer: []
    }
  });
}

describe('collectHighlightEntries', () => {
  it('keeps the same order as the tips list the advice is built from', () => {
    const resume = makeResume();
    const adviceTexts = collectHighlights(resume);
    const entries = collectHighlightEntries(resume);
    expect(entries.map((e) => e.text)).toEqual(adviceTexts);
  });

  it('addresses each bullet with a dotted editor path', () => {
    const entries = collectHighlightEntries(makeResume());
    expect(entries.map((e) => e.path)).toEqual([
      'sections.work.0.positions.0.highlights.0',
      'sections.work.0.positions.0.highlights.1',
      'sections.work.0.positions.0.highlights.2',
      'sections.work.0.positions.1.highlights.0',
      'sections.work.1.positions.0.highlights.0'
    ]);
  });

  it('skips empty bullets, exactly as the engine does', () => {
    const resume = makeResume();
    resume.sections.work[0]!.positions[0]!.highlights = ['First bullet', '', 'Third bullet'];
    const entries = collectHighlightEntries(resume);
    // The empty bullet is gone; the rest of the resume's bullets remain.
    expect(entries.map((e) => e.text)).toEqual([
      'First bullet',
      'Third bullet',
      'Fourth bullet',
      'Fifth bullet'
    ]);
    // And the advice list agrees, index for index.
    expect(collectHighlights(resume)).toEqual(entries.map((e) => e.text));
  });

  it('excludes projects, exactly as the engine does', () => {
    const resume = makeResume();
    resume.sections.projects = [
      {
        name: 'A project',
        description: '',
        highlights: ['Project bullet'],
        keywords: [],
        roles: [],
        startDate: '',
        endDate: '',
        url: ''
      }
    ];
    const entries = collectHighlightEntries(resume);
    expect(entries.some((e) => e.text === 'Project bullet')).toBe(false);
  });
});

describe('pathForHighlightIndex', () => {
  it('maps an index back to the bullet it came from', () => {
    const resume = makeResume();
    expect(pathForHighlightIndex(resume, 0)).toBe(
      'sections.work.0.positions.0.highlights.0'
    );
    expect(pathForHighlightIndex(resume, 3)).toBe(
      'sections.work.0.positions.1.highlights.0'
    );
    expect(pathForHighlightIndex(resume, 4)).toBe(
      'sections.work.1.positions.0.highlights.0'
    );
  });

  it('returns null for an index that does not exist', () => {
    const resume = makeResume();
    expect(pathForHighlightIndex(resume, 99)).toBeNull();
    expect(pathForHighlightIndex(resume, -1)).toBeNull();
  });
});

describe('parseWorkHighlightPath', () => {
  it('round-trips every generated path back to its coordinates', () => {
    for (const entry of collectHighlightEntries(makeResume())) {
      expect(parseWorkHighlightPath(entry.path)).toEqual({
        workIndex: Number(entry.path.split('.')[2]),
        positionIndex: Number(entry.path.split('.')[4]),
        highlightIndex: Number(entry.path.split('.')[6])
      });
    }
  });

  it('rejects non-work or malformed paths', () => {
    expect(parseWorkHighlightPath('sections.projects.0.highlights.0')).toBeNull();
    expect(parseWorkHighlightPath('sections.work[0].positions[0].highlights[0]')).toBeNull();
    expect(parseWorkHighlightPath('sections.work.0.positions.0.highlights')).toBeNull();
  });
});
