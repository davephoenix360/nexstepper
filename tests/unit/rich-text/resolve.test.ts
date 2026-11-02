/**
 * Re-anchoring marks onto the text they belong to.
 *
 * The whole point of storing BOTH an offset and the literal text is
 * that a mark can find its anchor again after the text around it
 * moves — and that when it cannot, the failure is a MISSING mark
 * rather than a WRONG one.
 */
import { describe, expect, it } from 'vitest';

import { mergeSpans, resolveSpans, toSegments } from '@/lib/rich-text/resolve';
import type { RichSpan } from '@/lib/resume-schema/rich-text';

const bold = (text: string, start: number): RichSpan => ({
  text,
  start,
  marks: ['bold']
});

describe('resolveSpans', () => {
  it('keeps a span where it is when nothing moved', () => {
    const value = 'Led the migration to Postgres';
    const { spans, dropped } = resolveSpans(value, [
      bold('Postgres', 21)
    ]);
    expect(dropped).toEqual([]);
    expect(spans).toHaveLength(1);
    expect(spans[0].start).toBe(21);
    expect(spans[0].text).toBe('Postgres');
  });

  it('re-anchors a span whose text moved', () => {
    // Text was inserted in front of the marked word.
    const value = 'Migration: Led the migration to Postgres';
    const { spans, dropped } = resolveSpans(value, [bold('Postgres', 26)]);
    expect(dropped).toEqual([]);
    expect(spans).toHaveLength(1);
    expect(spans[0].start).toBe(value.indexOf('Postgres'));
    expect(value.slice(spans[0].start, spans[0].start + spans[0].text.length)).toBe(
      'Postgres'
    );
  });

  it('re-anchors to the occurrence CLOSEST to the original offset', () => {
    const value = 'Postgres and Postgres';
    // The stored offset (11) points between the two occurrences. The
    // closer one wins — "closest" rather than "first" because the text
    // usually moves a little, not a lot.
    const { spans } = resolveSpans(value, [bold('Postgres', 11)]);
    expect(spans[0].start).toBe(13);
  });

  it('keeps an exact hit even when an earlier occurrence exists', () => {
    const value = 'Postgres and Postgres';
    // The span is ON the second occurrence, so it is an exact hit and
    // must not be dragged back to the first one.
    const { spans } = resolveSpans(value, [bold('Postgres', 13)]);
    expect(spans[0].start).toBe(13);
  });

  it('drops a span whose text is gone — never misapplies it', () => {
    const { spans, dropped } = resolveSpans('Led the migration to MySQL', [
      bold('Postgres', 20)
    ]);
    expect(spans).toEqual([]);
    expect(dropped).toHaveLength(1);
    expect(dropped[0].text).toBe('Postgres');
  });

  it('drops a span whose text is gone even when other text remains', () => {
    const value = 'Led the migration to MySQL, on time';
    const { spans, dropped } = resolveSpans(value, [bold('Postgres', 20)]);
    expect(spans).toEqual([]);
    expect(dropped).toHaveLength(1);
  });

  it('returns nothing for an empty span list', () => {
    expect(resolveSpans('anything', [])).toEqual({ spans: [], dropped: [] });
    expect(resolveSpans('anything', undefined)).toEqual({
      spans: [],
      dropped: []
    });
  });

  it('merges adjacent spans that carry the same marks', () => {
    const value = 'abcdef';
    const merged = mergeSpans(value, [
      { text: 'abc', start: 0, marks: ['bold'] },
      { text: 'def', start: 3, marks: ['bold'] }
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toEqual({ text: 'abcdef', start: 0, marks: ['bold'] });
  });

  it('does NOT merge spans that carry different marks', () => {
    const value = 'abcdef';
    const merged = mergeSpans(value, [
      { text: 'abc', start: 0, marks: ['bold'] },
      { text: 'def', start: 3, marks: ['italic'] }
    ]);
    expect(merged).toHaveLength(2);
  });

  it('keeps the canonical mark order', () => {
    const value = 'abc';
    const merged = mergeSpans(value, [
      { text: 'abc', start: 0, marks: ['underline', 'bold'] }
    ]);
    expect(merged[0].marks).toEqual(['bold', 'underline']);
  });
});

describe('toSegments', () => {
  it('returns one unmarked segment when there are no spans', () => {
    expect(toSegments('hello', [])).toEqual([{ text: 'hello', marks: [] }]);
  });

  it('splits a value around a marked range', () => {
    const value = 'Led to Postgres';
    expect(toSegments(value, [bold('Postgres', 7)])).toEqual([
      { text: 'Led to ', marks: [] },
      { text: 'Postgres', marks: ['bold'] }
    ]);
  });

  it('splits overlapping marks into segments carrying both', () => {
    const value = 'abcdefghij';
    const segments = toSegments(value, [
      { text: 'abcdef', start: 0, marks: ['bold'] },
      { text: 'efghij', start: 4, marks: ['underline'] }
    ]);
    expect(segments).toEqual([
      { text: 'abcd', marks: ['bold'] },
      { text: 'ef', marks: ['bold', 'underline'] },
      { text: 'ghij', marks: ['underline'] }
    ]);
  });

  it('concatenates back to the original value, character for character', () => {
    const value = 'Led the migration to Postgres, on a Tuesday';
    const segments = toSegments(value, [
      { text: 'Postgres', start: 21, marks: ['bold'] },
      { text: 'the', start: 4, marks: ['italic'] }
    ]);
    expect(segments.map((s) => s.text).join('')).toBe(value);
  });
});
