import {
  MARK_ORDER,
  resolveSpans,
  toSegments,
  type RichSegment
} from './resolve';

import type { RichMark, RichSpan } from '@/lib/resume-schema/rich-text';

/**
 * The span algebra — adding and removing marks over a range.
 *
 * Everything here is a pure function of `(value, spans, range, mark)`.
 * The value is always needed because a mark is stored as a literal
 * text plus an offset, so any change to the range has to recompute
 * what the covered text IS.
 *
 * The representation used while computing is a list of intervals with
 * a mark set each — which makes "add bold over [2,5)" and "remove
 * bold over [2,5)" trivial, including the partial-overlap cases that
 * a naive start/end edit would get wrong.
 */

type Interval = {
  from: number;
  to: number;
  marks: RichMark[];
};

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

/**
 * Split the value into intervals at every span boundary (plus any
 * extra points the caller cares about), each carrying the marks that
 * apply across it.
 */
function intervals(
  value: string,
  spans: RichSpan[],
  extraPoints: number[] = []
): Interval[] {
  const points = new Set<number>([0, value.length]);
  for (const point of extraPoints) {
    points.add(clamp(Math.round(point), 0, value.length));
  }
  for (const span of spans) {
    points.add(clamp(span.start, 0, value.length));
    points.add(clamp(span.start + span.text.length, 0, value.length));
  }
  const sorted = [...points].sort((a, b) => a - b);

  const out: Interval[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const from = sorted[i];
    const to = sorted[i + 1];
    if (to <= from) continue;

    const marks = new Set<RichMark>();
    for (const span of spans) {
      const spanFrom = span.start;
      const spanTo = span.start + span.text.length;
      if (spanFrom <= from && to <= spanTo) {
        for (const mark of span.marks) marks.add(mark);
      }
    }
    out.push({ from, to, marks: MARK_ORDER.filter((m) => marks.has(m)) });
  }
  return out;
}

/**
 * Turn intervals back into spans, merging neighbours that carry the
 * same marks and dropping unmarked runs (unmarked text needs no span —
 * that is the whole point of the overlay).
 */
function intervalsToSpans(value: string, list: Interval[]): RichSpan[] {
  const spans: RichSpan[] = [];

  for (const interval of list) {
    if (interval.marks.length === 0) continue;
    const text = value.slice(interval.from, interval.to);
    if (text.length === 0) continue;

    const last = spans[spans.length - 1];
    if (
      last &&
      last.start + last.text.length === interval.from &&
      MARK_ORDER.every(
        (mark) =>
          last.marks.includes(mark) === interval.marks.includes(mark)
      )
    ) {
      last.text += text;
      continue;
    }
    spans.push({
      text,
      start: interval.from,
      marks: [...interval.marks]
    });
  }

  return spans;
}

function withMark(marks: RichMark[], mark: RichMark, on: boolean): RichMark[] {
  const next = on
    ? MARK_ORDER.filter((m) => m === mark || marks.includes(m))
    : marks.filter((m) => m !== mark);
  return next;
}

/**
 * Apply (or remove) a mark over a character range.
 */
function applyMark(
  value: string,
  spans: RichSpan[] | undefined | null,
  start: number,
  end: number,
  mark: RichMark,
  on: boolean
): RichSpan[] {
  const from = clamp(Math.min(start, end), 0, value.length);
  const to = clamp(Math.max(start, end), 0, value.length);
  if (to <= from) return resolveSpans(value, spans).spans;

  const resolved = resolveSpans(value, spans).spans;
  const list = intervals(value, resolved, [from, to]);

  const updated = list.map((interval) => {
    const inside = interval.from >= from && interval.to <= to;
    return {
      ...interval,
      marks: inside ? withMark(interval.marks, mark, on) : interval.marks
    };
  });

  return intervalsToSpans(value, updated);
}

/** Add a mark over a range. */
export function addMark(
  value: string,
  spans: RichSpan[] | undefined | null,
  start: number,
  end: number,
  mark: RichMark
): RichSpan[] {
  return applyMark(value, spans, start, end, mark, true);
}

/** Remove a mark over a range. */
export function removeMark(
  value: string,
  spans: RichSpan[] | undefined | null,
  start: number,
  end: number,
  mark: RichMark
): RichSpan[] {
  return applyMark(value, spans, start, end, mark, false);
}

/**
 * Toggle a mark over a range: remove it if the WHOLE range already
 * carries it, add it otherwise.
 */
export function toggleMark(
  value: string,
  spans: RichSpan[] | undefined | null,
  start: number,
  end: number,
  mark: RichMark
): RichSpan[] {
  const from = clamp(Math.min(start, end), 0, value.length);
  const to = clamp(Math.max(start, end), 0, value.length);
  if (to <= from) return resolveSpans(value, spans).spans;

  const resolved = resolveSpans(value, spans).spans;
  const list = intervals(value, resolved, [from, to]);
  const inside = list.filter((i) => i.from >= from && i.to <= to);
  const fullyMarked =
    inside.length > 0 && inside.every((i) => i.marks.includes(mark));

  return fullyMarked
    ? removeMark(value, spans, from, to, mark)
    : addMark(value, spans, from, to, mark);
}

/**
 * A mark covering an entire field value.
 *
 * This is the Ctrl/Cmd+B path — the fast way to emphasise a skill
 * chip, a company name or a whole bullet — and the shape a chip
 * takes, since a chip IS a whole field value.
 */
export function spansForWholeValue(
  value: string,
  spans: RichSpan[] | undefined | null,
  mark: RichMark
): RichSpan[] {
  if (value.length === 0) return resolveSpans(value, spans).spans;
  return toggleMark(value, spans, 0, value.length, mark);
}

/** Every mark currently applied to a character range. */
export function marksInRange(
  value: string,
  spans: RichSpan[] | undefined | null,
  start: number,
  end: number
): RichMark[] {
  const from = clamp(Math.min(start, end), 0, value.length);
  const to = clamp(Math.max(start, end), 0, value.length);
  if (to <= from) return [];

  const resolved = resolveSpans(value, spans).spans;
  const list = intervals(value, resolved, [from, to]);
  const marks = new Set<RichMark>();
  for (const interval of list) {
    if (interval.from >= from && interval.to <= to) {
      for (const mark of interval.marks) marks.add(mark);
    }
  }
  return MARK_ORDER.filter((m) => marks.has(m));
}

/**
 * The segments a range covers — used by the renderer and by tests
 * that assert exactly which text a mark wraps.
 */
export function segmentsInRange(
  value: string,
  spans: RichSpan[] | undefined | null,
  start: number,
  end: number
): RichSegment[] {
  const from = clamp(Math.min(start, end), 0, value.length);
  const to = clamp(Math.max(start, end), 0, value.length);
  const resolved = resolveSpans(value, spans).spans;
  return toSegments(value, resolved).filter((segment) => {
    const offset = value.indexOf(segment.text);
    return offset >= from && offset + segment.text.length <= to;
  });
}
