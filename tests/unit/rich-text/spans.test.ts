/**
 * The span algebra — adding and removing marks over a range.
 *
 * The cases that matter are the partial overlaps: adding a mark to
 * part of an already-marked range, and removing a mark from part of a
 * range that extends beyond it. A naive start/end edit gets both
 * wrong.
 */
import { describe, expect, it } from 'vitest';

import {
  addMark,
  marksInRange,
  removeMark,
  spansForWholeValue,
  toggleMark
} from '@/lib/rich-text/spans';
import type { RichSpan } from '@/lib/resume-schema/rich-text';

describe('addMark', () => {
  it('marks an unmarked range', () => {
    const value = 'Led the migration to Postgres';
    const spans = addMark(value, [], 21, 29, 'bold');
    expect(spans).toHaveLength(1);
    expect(spans[0]).toEqual({ text: 'Postgres', start: 21, marks: ['bold'] });
  });

  it('adds a second mark to an already-marked range', () => {
    const value = 'Led the migration to Postgres';
    const bolded = addMark(value, [], 21, 29, 'bold');
    const both = addMark(value, bolded, 21, 29, 'underline');
    expect(both).toHaveLength(1);
    expect(both[0].marks).toEqual(['bold', 'underline']);
  });

  it('marks only the part of a range that is inside', () => {
    const value = 'abcdefghij';
    const spans = addMark(value, [], 2, 6, 'bold');
    expect(spans).toHaveLength(1);
    expect(spans[0]).toEqual({ text: 'cdef', start: 2, marks: ['bold'] });
  });

  it('handles a reversed range', () => {
    const value = 'abcdefghij';
    const spans = addMark(value, [], 6, 2, 'bold');
    expect(spans[0]).toEqual({ text: 'cdef', start: 2, marks: ['bold'] });
  });

  it('does not extend an existing mark beyond the range it was given', () => {
    const value = 'abcdefghij';
    const first = addMark(value, [], 0, 6, 'bold');
    const second = addMark(value, first, 2, 4, 'underline');
    expect(second).toHaveLength(3);
    expect(second.map((s) => [s.start, s.text, s.marks])).toEqual([
      [0, 'ab', ['bold']],
      [2, 'cd', ['bold', 'underline']],
      [4, 'ef', ['bold']]
    ]);
  });
});

describe('removeMark', () => {
  it('removes a mark over a range', () => {
    const value = 'Led the migration to Postgres';
    const bolded = addMark(value, [], 21, 29, 'bold');
    expect(removeMark(value, bolded, 21, 29, 'bold')).toEqual([]);
  });

  it('keeps the other mark when removing one of two', () => {
    const value = 'Led the migration to Postgres';
    const bolded = addMark(value, [], 21, 29, 'bold');
    const both = addMark(value, bolded, 21, 29, 'underline');
    const after = removeMark(value, both, 21, 29, 'bold');
    expect(after).toHaveLength(1);
    expect(after[0].marks).toEqual(['underline']);
  });

  it('removes only the part of a mark that is inside the range', () => {
    const value = 'abcdefghij';
    const bolded = addMark(value, [], 0, 10, 'bold');
    const after = removeMark(value, bolded, 3, 6, 'bold');
    expect(after.map((s) => [s.start, s.text])).toEqual([
      [0, 'abc'],
      [6, 'ghij']
    ]);
  });

  it('round-trips: removing what was added leaves the original spans', () => {
    const value = 'Led the migration to Postgres';
    const original: RichSpan[] = [
      { text: 'the', start: 4, marks: ['italic'] }
    ];
    const added = addMark(value, original, 21, 29, 'bold');
    const removed = removeMark(value, added, 21, 29, 'bold');
    expect(removed).toEqual(original);
  });
});

describe('toggleMark', () => {
  it('adds the mark when it is not there', () => {
    const value = 'abcdef';
    const spans = toggleMark(value, [], 2, 4, 'bold');
    expect(spans[0].marks).toEqual(['bold']);
  });

  it('removes the mark when the whole range already has it', () => {
    const value = 'abcdef';
    const bolded = addMark(value, [], 2, 4, 'bold');
    expect(toggleMark(value, bolded, 2, 4, 'bold')).toEqual([]);
  });

  it('adds the mark when only part of the range has it', () => {
    const value = 'abcdefghij';
    const bolded = addMark(value, [], 0, 5, 'bold');
    // Bold covers [0,5); the toggle range [3,8) is not fully bold, so
    // bold is ADDED there — and the two touching bold ranges collapse
    // into one span covering [0,8), because that is what the reader
    // sees.
    const toggled = toggleMark(value, bolded, 3, 8, 'bold');
    expect(toggled.map((s) => [s.start, s.text])).toEqual([[0, 'abcdefgh']]);
    expect(toggled.every((s) => s.marks.includes('bold'))).toBe(true);
  });
});

describe('spansForWholeValue', () => {
  it('marks the whole value', () => {
    const value = 'Postgres';
    const spans = spansForWholeValue(value, [], 'bold');
    expect(spans).toEqual([{ text: 'Postgres', start: 0, marks: ['bold'] }]);
  });

  it('toggles off when the whole value is already marked', () => {
    const value = 'Postgres';
    const bolded = spansForWholeValue(value, [], 'bold');
    expect(spansForWholeValue(value, bolded, 'bold')).toEqual([]);
  });

  it('does nothing on an empty value', () => {
    expect(spansForWholeValue('', [], 'bold')).toEqual([]);
  });
});

describe('marksInRange', () => {
  it('reports the marks covering a range', () => {
    const value = 'abcdefghij';
    const spans = addMark(value, [], 0, 5, 'bold');
    const both = addMark(value, spans, 2, 8, 'underline');
    expect(marksInRange(value, both, 2, 5)).toEqual(['bold', 'underline']);
    expect(marksInRange(value, both, 0, 2)).toEqual(['bold']);
    expect(marksInRange(value, both, 6, 8)).toEqual(['underline']);
    expect(marksInRange(value, both, 8, 10)).toEqual([]);
  });
});
