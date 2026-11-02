import {
  RICH_MARKS,
  type RichMark,
  type RichSpan
} from '@/lib/resume-schema/rich-text';

/**
 * Re-anchoring marks onto the text they belong to.
 *
 * ## The problem
 *
 * A span stores a character offset. Any edit to the field invalidates
 * it — including edits the user did not make (Scout rewriting a bullet
 * changes every offset after the change). A naive implementation would
 * then bold the wrong words, and the user cannot tell.
 *
 * ## The rule
 *
 * For each span, in order:
 *
 * 1. **Exact hit** — the text is still where it was. Keep it.
 * 2. **Re-anchor** — the text is still in the field, just somewhere
 *    else. Take the occurrence CLOSEST to the original offset.
 * 3. **Drop** — the text is gone. Report it.
 *
 * The asymmetry is the whole design: the failure mode is a **missing
 * mark**, never a wrong one.
 */

/** The canonical order marks are stored and rendered in. */
export const MARK_ORDER: readonly RichMark[] = RICH_MARKS;

export type ResolvedSpans = {
  /** Re-anchored, sorted, non-overlapping spans. */
  spans: RichSpan[];
  /** Spans whose anchor text no longer exists. Surfaced to the UI. */
  dropped: RichSpan[];
};

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

/**
 * Find where a span's text lives now.
 *
 * Returns the offset, or -1 when the text is gone.
 */
export function findAnchor(value: string, span: RichSpan): number {
  if (span.text.length === 0) return -1;

  // 1. Exact hit — the common case, nothing moved.
  if (
    value.slice(span.start, span.start + span.text.length) === span.text
  ) {
    return span.start;
  }

  // 2. Re-anchor to the occurrence closest to where the span used to
  //    be. "Closest" rather than "first" because the text usually
  //    moves a little, not a lot.
  let best = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  let index = value.indexOf(span.text);
  while (index !== -1) {
    const distance = Math.abs(index - span.start);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
    index = value.indexOf(span.text, index + 1);
  }
  return best;
}

/**
 * Re-anchor every span against the current text.
 *
 * Spans that end up covering the same range with the same marks are
 * merged, so the stored map stays canonical and two renders of the
 * same resume never disagree.
 */
export function resolveSpans(
  value: string,
  spans: RichSpan[] | undefined | null
): ResolvedSpans {
  if (!spans || spans.length === 0) return { spans: [], dropped: [] };

  const resolved: RichSpan[] = [];
  const dropped: RichSpan[] = [];

  for (const span of spans) {
    const anchor = findAnchor(value, span);
    if (anchor < 0) {
      dropped.push(span);
      continue;
    }
    resolved.push({
      text: span.text,
      start: anchor,
      marks: MARK_ORDER.filter((m) => span.marks.includes(m))
    });
  }

  return { spans: mergeSpans(value, resolved), dropped };
}

/**
 * Merge spans that cover the same range with the same marks, and
 * adjacent spans that share a mark set.
 *
 * Two spans with the SAME range and the SAME marks are the same
 * formatting expressed twice — merging them is lossless. Two spans
 * with DIFFERENT marks over the same range are not redundant (bold +
 * underline is one range carrying two marks), and the renderer handles
 * those by segmentation instead.
 */
export function mergeSpans(value: string, spans: RichSpan[]): RichSpan[] {
  if (spans.length === 0) return [];

  const sorted = [...spans].sort(
    (a, b) => a.start - b.start || a.text.length - b.text.length
  );

  const merged: RichSpan[] = [];

  for (const span of sorted) {
    const last = merged[merged.length - 1];
    if (
      last &&
      last.start + last.text.length === span.start &&
      sameMarks(last.marks, span.marks)
    ) {
      // Adjacent and identically marked — one span covering both.
      last.text += span.text;
      continue;
    }
    if (
      last &&
      last.start === span.start &&
      last.text.length === span.text.length &&
      sameMarks(last.marks, span.marks)
    ) {
      // The same range expressed twice.
      continue;
    }
    merged.push({
      ...span,
      // Canonical mark order, so the stored map never depends on the
      // order the marks happened to be added in.
      marks: MARK_ORDER.filter((m) => span.marks.includes(m))
    });
  }

  return merged.filter((span) => span.text.length > 0);
}

function sameMarks(a: readonly RichMark[], b: readonly RichMark[]): boolean {
  if (a.length !== b.length) return false;
  return MARK_ORDER.every((mark) => a.includes(mark) === b.includes(mark));
}

/**
 * One run of text with the marks that apply to all of it.
 */
export type RichSegment = {
  text: string;
  marks: RichMark[];
};

/**
 * Slice a value into segments, each carrying the marks that apply
 * across it.
 *
 * This is how overlapping marks are rendered correctly: bold over
 * [0,10) and underline over [5,15) produce segments [0,5) bold,
 * [5,10) bold+underline, [10,15) underline.
 *
 * The concatenation of every segment's text is exactly `value` —
 * which is what lets the editor map a mouse selection back to
 * character offsets.
 */
export function toSegments(
  value: string,
  spans: RichSpan[] | undefined | null
): RichSegment[] {
  if (!spans || spans.length === 0) {
    return value.length > 0 ? [{ text: value, marks: [] }] : [];
  }

  const points = new Set<number>([0, value.length]);
  for (const span of spans) {
    points.add(clamp(span.start, 0, value.length));
    points.add(clamp(span.start + span.text.length, 0, value.length));
  }
  const sorted = [...points].sort((a, b) => a - b);

  const segments: RichSegment[] = [];
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
    segments.push({
      text: value.slice(from, to),
      marks: MARK_ORDER.filter((m) => marks.has(m))
    });
  }

  return segments;
}
