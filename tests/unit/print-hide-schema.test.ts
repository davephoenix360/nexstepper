import { describe, expect, it } from 'vitest';

import {
  resumeDataSchema,
  isSectionHiddenFromPrint,
  parseResumeData
} from '@/lib/resume-schema/resume-data';
import { sampleResumeData } from '@/lib/resume-schema';

/**
 * Schema-level tests for the print-hide feature.
 *
 * The `print.hiddenSections` field is a forward-compatible addition
 * to the ResumeData envelope — every existing resume in the DB
 * predates this field. These tests pin:
 *
 *   1. Backward compatibility — a stored envelope without `print`
 *      still parses cleanly (the field is optional).
 *   2. Round-trip — a parsed envelope with `print` survives a
 *      second parse unchanged.
 *   3. The `isSectionHiddenFromPrint` predicate's three branches:
 *      slug absent, slug present, `print` envelope absent.
 *   4. Slug length bounds — Zod rejects slugs that are too short
 *      (empty) or too long (>64 chars), so a buggy caller can't
 *      silently nuke the PDF.
 */
describe('print-hide schema', () => {
  it('accepts a stored envelope without the `print` field (back-compat)', () => {
    // Strip `print` from the sample resume — simulates the
    // shape of every resume revision persisted before the
    // print-hide feature shipped.
    const legacy = {
      ...sampleResumeData
    };
    delete (legacy as Record<string, unknown>).print;
    const result = parseResumeData(legacy);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.print).toBeUndefined();
    }
  });

  it('accepts a minimal envelope without `print` (min-viable contract)', () => {
    // The minimum-viable input is `{ sections: { basics: {} } }` —
    // both `sections` and `sections.basics` are required. `print`
    // is optional; absence is fine.
    const result = parseResumeData({ sections: { basics: {} } });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.print).toBeUndefined();
    }
  });

  it('accepts a `print` envelope with hidden sections', () => {
    const result = parseResumeData({
      sections: { basics: {} },
      print: { hiddenSections: ['skills', 'interests'] }
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.print?.hiddenSections).toEqual([
        'skills',
        'interests'
      ]);
    }
  });

  it('defaults `hiddenSections` to `[]` when `print` is provided empty', () => {
    const result = parseResumeData({
      sections: { basics: {} },
      print: {} as { hiddenSections?: string[] }
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.print?.hiddenSections).toEqual([]);
    }
  });

  it('round-trips a printed envelope (parse -> write back -> parse)', () => {
    // The schema must not mutate input on parse. Re-parsing the
    // same object should yield an equivalent shape.
    const input = {
      sections: { basics: {} },
      print: { hiddenSections: ['volunteer'] }
    };
    const first = parseResumeData(input);
    expect(first.success).toBe(true);
    if (first.success) {
      const second = parseResumeData(first.data);
      expect(second.success).toBe(true);
      if (second.success) {
        expect(second.data.print).toEqual(input.print);
      }
    }
  });

  it('rejects a `print` envelope with an empty-string slug', () => {
    // Empty slug would match every section under the substring rule
    // — must be rejected.
    const result = resumeDataSchema.safeParse({
      sections: { basics: {} },
      print: { hiddenSections: [''] }
    });
    expect(result.success).toBe(false);
  });

  it('rejects a slug longer than 64 characters', () => {
    const tooLong = 'a'.repeat(65);
    const result = resumeDataSchema.safeParse({
      sections: { basics: {} },
      print: { hiddenSections: [tooLong] }
    });
    expect(result.success).toBe(false);
  });
});

describe('isSectionHiddenFromPrint', () => {
  it('returns true when the slug is in the array', () => {
    const data = { print: { hiddenSections: ['skills'] } };
    expect(isSectionHiddenFromPrint(data, 'skills')).toBe(true);
  });

  it('returns false when the slug is not in the array', () => {
    const data = { print: { hiddenSections: ['skills'] } };
    expect(isSectionHiddenFromPrint(data, 'experience')).toBe(false);
  });

  it('returns false when the print envelope is absent (legacy data)', () => {
    const data = {} as { print?: { hiddenSections?: string[] } };
    expect(isSectionHiddenFromPrint(data, 'skills')).toBe(false);
  });

  it('returns false when hiddenSections is empty', () => {
    const data = { print: { hiddenSections: [] } };
    expect(isSectionHiddenFromPrint(data, 'skills')).toBe(false);
  });
});
