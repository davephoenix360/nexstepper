import { describe, expect, it } from 'vitest';

import { scoreAtsMatching } from '@/lib/scoring/dimensions/ats-matching';
import {
  flattenJobText,
  flattenResumeText
} from '@/lib/scoring/similarity';
import type { JobTextSource, ResumeTextSource } from '@/lib/scoring/similarity';

/**
 * Locks the ATS-matching dimension in isolation. Three sub-criteria:
 *   - keywordScore   (60%): % of non-stop-word JD tokens present in
 *     the resume text (substring match, case-insensitive).
 *   - similarityScore (20%): Jaccard token-set similarity, full
 *     resume vs full JD.
 *   - coverageScore  (20%): % of JD requirement bullets with at
 *     least one non-stop token mentioned in the resume.
 *
 * Edge cases per plan §"Risks" #4: empty requirements list → skip
 * the coverage sub-criterion and re-normalize the weights.
 */

const RESUME: ResumeTextSource = {
  basics: { summary: 'Senior TypeScript engineer with React and Node.' },
  skills: [
    { name: 'Languages', keywords: ['typescript', 'python', 'rust'] },
    { name: 'Cloud', keywords: ['aws', 'gcp'] }
  ],
  work: [
    {
      summary: 'Platform team',
      positions: [
        {
          title: 'Staff Engineer',
          highlights: [
            'Built a payments platform serving 12M users on AWS',
            'Mentored 5 engineers across 2 teams'
          ]
        }
      ]
    }
  ]
};

const WELL_MATCHED_JOB: JobTextSource = {
  title: 'Senior TypeScript Engineer',
  description: 'Build payments platforms with React and Node.',
  requirements: [
    '5+ years TypeScript experience',
    'Strong AWS skills',
    'React + Next.js background'
  ]
};

const POORLY_MATCHED_JOB: JobTextSource = {
  title: 'Junior Java Developer',
  description: 'Maintain a legacy Spring application.',
  requirements: [
    'Java expertise',
    'Spring framework',
    'Maven build system'
  ]
};

describe('scoreAtsMatching — well-matched pair', () => {
  const result = scoreAtsMatching(RESUME, WELL_MATCHED_JOB, {
    resumeText: flattenResumeText(RESUME),
    jobText: flattenJobText(WELL_MATCHED_JOB)
  });

  it('scores keyword coverage > 0 (some non-stop tokens match)', () => {
    // After substring-matching against the resume text, a healthy
    // fraction of the JD's non-stop tokens appear. We don't pin a
    // specific number — the actual value depends on which stop-word
    // we curated, which may shift over time. The contract is:
    // well-matched > poorly-matched.
    expect(result.breakdown.keywordScore).toBeGreaterThan(0);
  });

  it('scores similarity > 0 (overlapping tokens)', () => {
    expect(result.breakdown.similarityScore).toBeGreaterThan(0);
  });

  it('scores coverage > 50 (most requirements share tokens with the resume)', () => {
    expect(result.breakdown.coverageScore).toBeGreaterThan(50);
  });

  it('returns a value > 30 (well-matched → high dimension score)', () => {
    expect(result.value).toBeGreaterThan(30);
  });
});

describe('scoreAtsMatching — poorly-matched pair', () => {
  const result = scoreAtsMatching(RESUME, POORLY_MATCHED_JOB, {
    resumeText: flattenResumeText(RESUME),
    jobText: flattenJobText(POORLY_MATCHED_JOB)
  });

  it('scores keyword coverage low', () => {
    expect(result.breakdown.keywordScore).toBeLessThan(40);
  });

  it('scores coverage low (Java/Spring/Maven not in the resume)', () => {
    expect(result.breakdown.coverageScore).toBeLessThan(50);
  });

  it('returns a value < 30 (poorly-matched → low dimension score)', () => {
    expect(result.value).toBeLessThan(30);
  });
});

describe('scoreAtsMatching — edge cases', () => {
  it('returns 0 keyword score for an empty JD (no signal)', () => {
    const result = scoreAtsMatching(RESUME, {}, {
      resumeText: flattenResumeText(RESUME),
      jobText: ''
    });
    expect(result.breakdown.keywordScore).toBe(0);
    expect(result.breakdown.similarityScore).toBe(0);
  });

  it('skips coverage and re-normalizes weights when JD has no requirements', () => {
    // 0.6/0.2 with no coverage → keyword gets 0.75, similarity gets 0.25
    const result = scoreAtsMatching(
      RESUME,
      {
        title: 'Engineer',
        description: 'Build things with TypeScript and React.',
        // requirements: [] (empty)
      },
      {
        resumeText: flattenResumeText(RESUME),
        jobText: flattenJobText({
          title: 'Engineer',
          description: 'Build things with TypeScript and React.'
        })
      }
    );
    // coverage should be 0 in the breakdown but excluded from the value
    expect(result.breakdown.coverageScore).toBe(0);
    // The value should NOT be artificially lower because coverage is 0
    // — it should use only keyword + similarity.
    // keywordScore = some positive number
    // similarityScore = some positive number
    // value = 0.75 * keywordScore + 0.25 * similarityScore (no coverage drag)
    const expected =
      0.75 * result.breakdown.keywordScore +
      0.25 * result.breakdown.similarityScore;
    expect(result.value).toBeCloseTo(expected, 5);
  });

  it('treats a requirement of pure stop words as covered (vacuously true)', () => {
    const result = scoreAtsMatching(
      RESUME,
      {
        title: 'Engineer',
        description: 'Build things.',
        requirements: ['the and or'] // all stop words
      },
      {
        resumeText: flattenResumeText(RESUME),
        jobText: flattenJobText({
          title: 'Engineer',
          description: 'Build things.',
          requirements: ['the and or']
        })
      }
    );
    // The single requirement is vacuously covered → coverageScore = 100
    expect(result.breakdown.coverageScore).toBe(100);
  });

  it('is deterministic — same input → same output', () => {
    const a = scoreAtsMatching(RESUME, WELL_MATCHED_JOB, {
      resumeText: flattenResumeText(RESUME),
      jobText: flattenJobText(WELL_MATCHED_JOB)
    });
    const b = scoreAtsMatching(RESUME, WELL_MATCHED_JOB, {
      resumeText: flattenResumeText(RESUME),
      jobText: flattenJobText(WELL_MATCHED_JOB)
    });
    expect(a.value).toBe(b.value);
    expect(a.breakdown).toEqual(b.breakdown);
  });
});
