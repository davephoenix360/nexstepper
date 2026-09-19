import { describe, expect, it } from 'vitest';

import { scoreAlignment } from '@/lib/scoring/dimensions/alignment';
import type { JobTextSource, ResumeTextSource } from '@/lib/scoring/similarity';

/**
 * Locks the alignment dimension in isolation. Three sub-criteria:
 *   - tailoring (50%): Jaccard similarity, summary vs title.
 *   - hasExtras (30%): binary 0 or 100 — does the resume have any
 *     of projects / awards / publications?
 *   - softSkills (20%): fraction of the legacy's 4-word soft-skill
 *     list present in the resume.
 *
 * Drift from plan §"Open questions" #3: we ship with the legacy 4-word
 * list verbatim ("team", "leadership", "collaborated", "communication").
 * Plan §"Risks" #3 says "expand later if calibration says the alignment
 * score is uniformly low."
 */

const BASE_RESUME: ResumeTextSource = {
  basics: {
    summary: 'Senior engineer with TypeScript and React experience.',
    label: ''
  },
  skills: [],
  work: [],
  projects: []
};

const NO_EXTRAS = {
  hasProjects: false,
  hasAwards: false,
  hasPublications: false
};

describe('scoreAlignment', () => {
  it('scores zero on tailoring when summary and title share no tokens', () => {
    const result = scoreAlignment(
      BASE_RESUME,
      { title: 'Junior Java Developer', description: '' },
      NO_EXTRAS
    );
    expect(result.breakdown.tailoring).toBe(0);
  });

  it('scores positive on tailoring when summary echoes the title', () => {
    const result = scoreAlignment(
      BASE_RESUME,
      { title: 'Senior TypeScript Engineer', description: '' },
      NO_EXTRAS
    );
    // Jaccard of summary tokens {"senior","engineer","typescript","react","experience"}
    // vs title tokens {"senior","typescript","engineer"} — overlap 3, union 5 → 60%
    expect(result.breakdown.tailoring).toBeGreaterThan(0);
    expect(result.breakdown.tailoring).toBeLessThanOrEqual(100);
  });

  it('scores 100 on hasExtras when projects is non-empty', () => {
    const result = scoreAlignment(BASE_RESUME, {}, {
      ...NO_EXTRAS,
      hasProjects: true
    });
    expect(result.breakdown.hasExtras).toBe(100);
  });

  it('scores 100 on hasExtras when awards is non-empty', () => {
    const result = scoreAlignment(BASE_RESUME, {}, {
      ...NO_EXTRAS,
      hasAwards: true
    });
    expect(result.breakdown.hasExtras).toBe(100);
  });

  it('scores 100 on hasExtras when publications is non-empty', () => {
    const result = scoreAlignment(BASE_RESUME, {}, {
      ...NO_EXTRAS,
      hasPublications: true
    });
    expect(result.breakdown.hasExtras).toBe(100);
  });

  it('scores 0 on hasExtras when all three lists are empty', () => {
    const result = scoreAlignment(BASE_RESUME, {}, NO_EXTRAS);
    expect(result.breakdown.hasExtras).toBe(0);
  });

  it('scores 100 on softSkills when all 4 soft-skill words are in the resume', () => {
    const resume: ResumeTextSource = {
      basics: {
        summary:
          'I have been a team lead with strong leadership. I collaborated across teams and value clear communication.'
      },
      skills: [],
      work: [],
      projects: []
    };
    const result = scoreAlignment(resume, {}, NO_EXTRAS);
    expect(result.breakdown.softSkills).toBe(100);
  });

  it('scores partial on softSkills when only some of the 4 words are present', () => {
    const resume: ResumeTextSource = {
      basics: { summary: 'I worked on a team and led projects.' },
      skills: [],
      work: [],
      projects: []
    };
    // "team" is present, "leadership" / "collaborated" / "communication" are not
    const result = scoreAlignment(resume, {}, NO_EXTRAS);
    expect(result.breakdown.softSkills).toBe(25);
  });

  it('scores 0 on softSkills when none of the 4 words are present', () => {
    const result = scoreAlignment(
      {
        basics: { summary: 'A pure backend engineer focused on compilers.' },
        skills: [],
        work: [],
        projects: []
      },
      {},
      NO_EXTRAS
    );
    expect(result.breakdown.softSkills).toBe(0);
  });

  it('uses substring matching (not whole-word) for soft skills', () => {
    // "teamwork" contains "team" as a substring → counts as a hit.
    const resume: ResumeTextSource = {
      basics: { summary: 'Strong teamwork experience.' },
      skills: [],
      work: [],
      projects: []
    };
    const result = scoreAlignment(resume, {}, NO_EXTRAS);
    expect(result.breakdown.softSkills).toBe(25);
  });

  it('combines sub-criteria with 50/30/20 weighting', () => {
    // For an exact-100 composition every sub-criterion has to be 100.
    // We craft a fixture that hits that:
    //   - tailoring: summary == title (same exact text) → Jaccard 1.0
    //   - hasExtras: projects is present → 100
    //   - softSkills: all 4 words present in the summary → 100
    const sameText = 'Senior TypeScript Engineer team leadership collaborated communication';
    const result = scoreAlignment(
      {
        basics: { summary: sameText },
        skills: [],
        work: [],
        projects: [{ name: 'Open source', description: '', highlights: [] }]
      },
      { title: sameText },
      { hasProjects: true, hasAwards: false, hasPublications: false }
    );
    expect(result.value).toBe(100);
  });

  it('handles a completely empty resume + job without crashing', () => {
    const result = scoreAlignment(
      { basics: {}, skills: [], work: [], projects: [] },
      {},
      NO_EXTRAS
    );
    expect(result.value).toBe(0);
  });

  it('is deterministic — same input → same output', () => {
    const a = scoreAlignment(BASE_RESUME, { title: 'Engineer' }, NO_EXTRAS);
    const b = scoreAlignment(BASE_RESUME, { title: 'Engineer' }, NO_EXTRAS);
    expect(a.value).toBe(b.value);
    expect(a.breakdown).toEqual(b.breakdown);
  });
});
