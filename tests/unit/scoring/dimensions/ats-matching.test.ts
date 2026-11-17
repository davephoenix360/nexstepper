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

  it('uses fixed weights — the coverage sub-criterion is retired', () => {
    // The coverage sub-criterion ("of the responsibilities the JD lists,
    // how many does the resume mention a token from?") was retired on
    // 2026-11-17: it was DEAD in production (the JD envelope's
    // requirement list is never populated — no attach path writes one),
    // and the v2 Intent Coverage dimension already measures requirement
    // coverage. Reviving it would count the same measurement twice.
    //
    // The dimension is now two sub-criteria with fixed weights, so the
    // FORMULA is the same whether or not the JD has a requirements list.
    // (The VALUES differ — the requirements' tokens are part of the JD
    // text the keyword score reads.)
    const cases = [
      {
        title: 'with requirements',
        job: {
          title: 'Engineer',
          description: 'Build things with TypeScript and React.',
          requirements: ['TypeScript', 'React']
        }
      },
      {
        title: 'without requirements',
        job: {
          title: 'Engineer',
          description: 'Build things with TypeScript and React.'
        }
      }
    ];

    for (const { title, job } of cases) {
      const result = scoreAtsMatching(RESUME, job, {
        resumeText: flattenResumeText(RESUME),
        jobText: flattenJobText(job)
      });
      const expected =
        0.75 * result.breakdown.keywordScore + 0.25 * result.breakdown.similarityScore;
      expect(result.value, title).toBeCloseTo(expected, 5);
    }
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
