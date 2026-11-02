import * as React from 'react';

import { toSegments } from '@/lib/rich-text/resolve';
import type { RichSpan } from '@/lib/resume-schema/rich-text';

/**
 * The renderer — the ONE place a resume's text becomes marked-up text.
 *
 * ## Why one component
 *
 * The editor's idle render and the read-only render (preview page,
 * share link, printed PDF) must agree about what a marked line looks
 * like. If they each had their own implementation, they would drift —
 * the same failure shape as the list badge and the scorecard showing
 * different ATS numbers
 * (`docs/drift/2026-10-23-list-score-badge-divergence.md`).
 *
 * So every surface renders through this component.
 *
 * ## Why it renders a FRAGMENT, not a wrapper element
 *
 * The caller owns the surrounding tag (`<span>`, `<p>`, `<li>`, an
 * `<h2>`) and puts `data-rich-path` on it — that is how the editor
 * knows which field a mouse selection landed in.
 *
 * Rendering a fragment rather than a wrapper element matters for a
 * specific reason: **when a field has no marks, the output must be
 * byte-identical to what it was before this feature existed.** A
 * wrapper `<span>` would change the DOM of every single field in
 * every resume — including the ones that have no formatting at all —
 * and would break the print and page-break tests that assert on
 * structure.
 *
 * With a fragment, an unmarked field renders as one text node inside
 * its tag, exactly as it did before.
 *
 * ## The text is unchanged
 *
 * The concatenation of every segment's text equals the stored value,
 * character for character. The marks are real HTML at render time, so
 * the printed PDF and the share link carry the formatting, and the
 * text an ATS extracts is the text the candidate wrote.
 */
export interface RichTextProps {
  /** The stored value. Never modified. */
  value: string;
  /** The marks for this field. Undefined for an unformatted field. */
  spans?: RichSpan[] | null;
}

export function RichText({ value, spans }: RichTextProps) {
  const segments = toSegments(value, spans);

  if (segments.length === 0) return null;

  // The common case: no marks at all. A bare string renders as a
  // single text node — the DOM is identical to the pre-feature output.
  if (segments.length === 1 && segments[0].marks.length === 0) {
    return segments[0].text;
  }

  return (
    <>
      {segments.map((segment, index) => {
        let node: React.ReactNode = segment.text;

        // Fixed nesting order, so the same marks always produce the
        // same markup. `<strong>` first so the bold is the outermost
        // element and the copy/paste order into a word processor is
        // predictable.
        if (segment.marks.includes('bold')) node = <strong>{node}</strong>;
        if (segment.marks.includes('italic')) node = <em>{node}</em>;
        if (segment.marks.includes('underline')) node = <u>{node}</u>;

        return <React.Fragment key={index}>{node}</React.Fragment>;
      })}
    </>
  );
}
