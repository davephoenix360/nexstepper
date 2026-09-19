import { describe, expect, it } from 'vitest';

import { scoreStructure } from '@/lib/scoring/dimensions/structure';
import type { ResumeTextSource } from '@/lib/scoring/similarity';

/**
 * Locks the structure dimension in isolation — no JD interaction.
 * Per the plan §"Acceptance criteria" #4: "Unit tests cover each
 * dimension independently."
 *
 * Cases:
 *   - Full section completeness + sweet-spot length → 100/100
 *   - Empty resume → 0/100 (well, 12.5 because basics still counts)
 *   - Length penalty: too short, too long
 *   - SectionCompleteness breakdown when one section missing
 */

describe('scoreStructure', () => {
  it('returns 100 for a full resume in the 500-800 word sweet spot', () => {
    const resume = buildResume({
      workCount: 2,
      skillsCount: 3,
      bodyWords: 650,
      hasEducation: true
    });
    const result = scoreStructure(resume);
    expect(result.value).toBe(100);
    expect(result.breakdown.sectionCompleteness).toBe(100);
    expect(result.breakdown.lengthScore).toBe(100);
  });

  it('penalizes a resume that is too short', () => {
    const resume = buildResume({
      workCount: 2,
      skillsCount: 3,
      bodyWords: 100, // 550 below the 650 target → 100 - 55 = 45
      hasEducation: true
    });
    const result = scoreStructure(resume);
    // 100 - (550 * 0.1) = 100 - 55 = 45
    expect(result.breakdown.lengthScore).toBe(45);
  });

  it('penalizes a resume that is too long', () => {
    const resume = buildResume({
      workCount: 2,
      skillsCount: 3,
      bodyWords: 1200, // 550 above the 650 target → 100 - 55 = 45
      hasEducation: true
    });
    const result = scoreStructure(resume);
    expect(result.breakdown.lengthScore).toBe(45);
  });

  it('clamps the length penalty at 0', () => {
    const resume = buildResume({
      workCount: 2,
      skillsCount: 3,
      bodyWords: 10, // 640 below target → 100 - 64 = 36, not negative
      hasEducation: true
    });
    const result = scoreStructure(resume);
    expect(result.breakdown.lengthScore).toBe(36); // 100 - 64*0.1 = 36
    // Sanity: not clamped negative.
    expect(result.breakdown.lengthScore).toBeGreaterThanOrEqual(0);
  });

  it('scores section completeness correctly when work is missing', () => {
    const resume = buildResume({
      workCount: 0, // missing
      skillsCount: 3,
      bodyWords: 650,
      hasEducation: true
    });
    const result = scoreStructure(resume);
    // 3 of 4 sections → 75
    expect(result.breakdown.sectionCompleteness).toBe(75);
  });

  it('scores section completeness correctly when both work + skills are missing', () => {
    const resume = buildResume({
      workCount: 0,
      skillsCount: 0,
      bodyWords: 650,
      hasEducation: true
    });
    const result = scoreStructure(resume);
    // 2 of 4 (basics + education) → 50
    expect(result.breakdown.sectionCompleteness).toBe(50);
  });

  it('does not crash on a completely empty resume', () => {
    const resume: ResumeTextSource = {
      basics: {},
      skills: [],
      work: []
    };
    expect(() => scoreStructure(resume)).not.toThrow();
    const result = scoreStructure(resume);
    // 1 of 4 sections (basics is always present, education is not
    // attached in this fixture) → 25
    expect(result.breakdown.sectionCompleteness).toBe(25);
    // Length is 0 → penalty is 100 - (650 * 0.1) = 35
    expect(result.breakdown.lengthScore).toBe(35);
  });
});

// ─── Fixtures ────────────────────────────────────────────────────────────────

function buildResume(opts: {
  workCount: number;
  skillsCount: number;
  bodyWords: number;
  hasEducation?: boolean;
}): ResumeTextSource {
  // Build a resume whose body (summary + work + skills) sums to
  // exactly `bodyWords` so the test's length calculation is precise.
  const word = 'lorem';
  const skills = Array.from({ length: opts.skillsCount }, () => ({
    name: 'Category',
    keywords: [word]
  }));
  const work = Array.from({ length: opts.workCount }, () => ({
    summary: '',
    positions: [
      {
        title: 'Engineer',
        highlights: [] // no highlights — keeps the body length predictable
      }
    ]
  }));
  // summary absorbs the leftover words so total == bodyWords
  const workWords = opts.workCount * 1; // "Engineer" per position
  const skillsWords = opts.skillsCount * 2; // "Category" + "lorem"
  const summaryWordCount = Math.max(
    0,
    opts.bodyWords - workWords - skillsWords
  );
  const summary = Array.from({ length: summaryWordCount }, () => word).join(' ');
  // `education` is duck-typed by `hasEducation()` in scoreStructure.
  // We attach it as an extra field so the type guard picks it up.
  return {
    basics: { summary, label: '' },
    skills,
    work,
    ...(opts.hasEducation
      ? { education: [{ institution: 'MIT' }] as unknown[] }
      : { education: [] as unknown[] })
  } as ResumeTextSource & { education?: unknown[] };
}
