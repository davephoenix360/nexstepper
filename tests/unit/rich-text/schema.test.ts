/**
 * The envelope, and the formatting overlay on it.
 *
 * The two properties that matter:
 *
 * 1. **Optional and additive.** A resume that predates the feature
 *    parses cleanly with `formatting` undefined. A resume with no
 *    formatting behaves exactly as it did before.
 * 2. **The text is untouched.** `sections` still holds plain strings.
 *    This is what keeps the scoring engine honest, and it is asserted
 *    in `scoring-invariance.test.ts`.
 */
import { describe, expect, it } from 'vitest';

import { parseResumeData, resumeDataSchema } from '@/lib/resume-schema';
import { sampleResumeData } from '@/lib/resume-schema/sample';

describe('the formatting overlay on the envelope', () => {
  it('accepts a resume with NO formatting key', () => {
    const parsed = resumeDataSchema.parse(sampleResumeData);
    expect(parsed.formatting).toBeUndefined();
  });

  it('accepts a resume with a valid formatting map', () => {
    const parsed = resumeDataSchema.parse({
      ...sampleResumeData,
      formatting: {
        'sections.skills.0.keywords.0': [
          { text: 'Postgres', start: 0, marks: ['bold'] }
        ]
      }
    });
    expect(parsed.formatting?.['sections.skills.0.keywords.0']).toHaveLength(1);
  });

  it('round-trips the overlay', () => {
    const withFormatting = {
      ...sampleResumeData,
      formatting: {
        'sections.basics.summary': [
          { text: 'Engineer', start: 0, marks: ['bold', 'italic'] }
        ]
      }
    };
    const parsed = parseResumeData(withFormatting);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.formatting?.['sections.basics.summary'][0].marks).toEqual([
        'bold',
        'italic'
      ]);
    }
  });

  it('rejects a span with no marks — a span with no marks is meaningless', () => {
    const result = resumeDataSchema.safeParse({
      ...sampleResumeData,
      formatting: {
        'sections.basics.summary': [{ text: 'Engineer', start: 0, marks: [] }]
      }
    });
    expect(result.success).toBe(false);
  });

  it('rejects a negative offset', () => {
    const result = resumeDataSchema.safeParse({
      ...sampleResumeData,
      formatting: {
        'sections.basics.summary': [
          { text: 'Engineer', start: -1, marks: ['bold'] }
        ]
      }
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown mark', () => {
    const result = resumeDataSchema.safeParse({
      ...sampleResumeData,
      formatting: {
        'sections.basics.summary': [
          { text: 'Engineer', start: 0, marks: ['blink'] }
        ]
      }
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-integer offset', () => {
    const result = resumeDataSchema.safeParse({
      ...sampleResumeData,
      formatting: {
        'sections.basics.summary': [
          { text: 'Engineer', start: 1.5, marks: ['bold'] }
        ]
      }
    });
    expect(result.success).toBe(false);
  });
  it('leaves the SECTIONS untouched — the overlay is beside them, not inside', () => {
    const parsed = resumeDataSchema.parse({
      ...sampleResumeData,
      formatting: {
        'sections.basics.summary': [
          { text: 'Engineer', start: 0, marks: ['bold'] }
        ]
      }
    });
    // The stored text is exactly what it was — no markup leaked into it.
    expect(parsed.sections.basics.summary).toBe(
      sampleResumeData.sections.basics.summary
    );
  });
});
