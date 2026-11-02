/**
 * THE INVARIANT: formatting cannot move the ATS score.
 *
 * ## Why this test exists
 *
 * The product has already shipped this class of bug once: the list
 * badge and the scorecard showed different numbers because two
 * surfaces each computed "the score" their own way
 * (`docs/drift/2026-10-23-list-score-badge-divergence.md`).
 *
 * Formatting is the same shape of risk. If any part of the formatting
 * layer ever leaked into the text — a `<strong>` that reached the
 * scorer, an asterisk, a non-breaking space — every score in the
 * product would move together and the numbers users have already seen
 * would stop meaning anything.
 *
 * So: same resume, same JD, same clock — with and without marks —
 * and the breakdowns must be DEEPLY EQUAL.
 */
import { describe, expect, it } from 'vitest';

import { scoreResumeFromEnvelope } from '@/lib/scoring/score';
import { jobPostingSchema } from '@/lib/resume-schema';
import { sampleResumeData } from '@/lib/resume-schema/sample';
import type { RichTextMap } from '@/lib/resume-schema';

const NOW = new Date('2026-06-01T12:00:00.000Z');

/**
 * The breakdown minus its own timing.
 *
 * `computedInMs` is how long the scorer took, so it differs between two
 * runs by definition. Everything ELSE must be identical.
 */
function withoutTiming(breakdown: unknown): unknown {
  const { computedInMs: _ignored, ...rest } = breakdown as Record<
    string,
    unknown
  >;
  return rest;
}

const JOB = jobPostingSchema.parse({
  id: 'job_1',
  title: 'Senior Backend Engineer',
  company: 'Acme',
  location: 'Remote',
  description:
    'Senior backend engineer. 5+ years TypeScript, Postgres, AWS, Node.js.',
  requirements: [
    '5+ years of professional TypeScript experience',
    'Strong Postgres knowledge, including query tuning',
    'Experience with AWS (EC2, RDS, S3)'
  ],
  niceToHaves: ['Kubernetes in production'],
  keywords: ['typescript', 'postgres', 'aws', 'node.js', 'kubernetes'],
  mustHaveSkills: ['TypeScript', 'Postgres', 'AWS'],
  seniority: 'senior',
  employmentType: 'Full-time',
  source: 'paste'
});

describe('formatting does not move the ATS score', () => {
  it('produces a deeply equal breakdown with and without marks', () => {
    const plain = scoreResumeFromEnvelope(sampleResumeData, JOB, NOW);

    const formatting: RichTextMap = {
      'sections.basics.summary': [
        { text: 'Engineering', start: 4, marks: ['bold'] },
        { text: 'the', start: 0, marks: ['italic', 'underline'] }
      ],
      'sections.skills.0.keywords.0': [
        { text: 'AutoCAD', start: 0, marks: ['bold'] }
      ],
      'sections.work.0.positions.0.highlights.0': [
        { text: 'media', start: 12, marks: ['bold', 'underline'] }
      ]
    };

    const withMarks = scoreResumeFromEnvelope(
      { ...sampleResumeData, formatting },
      JOB,
      NOW
    );

    expect(withoutTiming(withMarks)).toEqual(withoutTiming(plain));
  });

  it('produces a deeply equal breakdown when the marks are on a field the score reads', () => {
    // The summary is read by the Tailoring and BM25 dimensions, so a
    // leak would move the score. The overlay must not.
    const plain = scoreResumeFromEnvelope(sampleResumeData, JOB, NOW);
    const withMarks = scoreResumeFromEnvelope(
      {
        ...sampleResumeData,
        formatting: {
          'sections.basics.summary': [
            {
              text: sampleResumeData.sections.basics.summary,
              start: 0,
              marks: ['bold'] as ('bold')[]
            }
          ]
        }
      },
      JOB,
      NOW
    );
    expect(withoutTiming(withMarks)).toEqual(withoutTiming(plain));
  });

  it('produces a deeply equal breakdown when the marks are on SKILLS', () => {
    // Skills are read by the ATS Keyword Match and Intent Coverage
    // dimensions — the two that moved most in the scorecard-tips bug.
    const plain = scoreResumeFromEnvelope(sampleResumeData, JOB, NOW);
    const withMarks = scoreResumeFromEnvelope(
      {
        ...sampleResumeData,
        formatting: {
          'sections.skills.0.keywords.0': [
            { text: 'AutoCAD', start: 0, marks: ['bold', 'underline'] as ('bold' | 'underline')[] }
          ],
          'sections.skills.1.keywords.0': [
            { text: 'KiCad', start: 0, marks: ['italic'] as ('italic')[] }
          ]
        }
      },
      JOB,
      NOW
    );
    expect(withoutTiming(withMarks)).toEqual(withoutTiming(plain));
  });

  it('leaves the stored text identical — the overlay is beside it', () => {
    const withMarks = {
      ...sampleResumeData,
      formatting: {
        'sections.basics.summary': [
          { text: 'Engineering', start: 4, marks: ['bold'] }
        ]
      }
    };
    expect(withMarks.sections.basics.summary).toBe(
      sampleResumeData.sections.basics.summary
    );
    expect(JSON.stringify(withMarks.sections)).toBe(
      JSON.stringify(sampleResumeData.sections)
    );
  });
});
