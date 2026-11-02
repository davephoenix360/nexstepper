import { z } from 'zod';

/**
 * Rich text — the formatting overlay on a resume.
 *
 * ## The one rule
 *
 * **Formatting is presentation. The text is the content.**
 *
 * Nothing in this module may alter a stored character, and nothing may
 * move the ATS score. The `sections` of a resume stay plain strings —
 * the scoring engine, BM25, the Jev evaluators, the digit check, the
 * action-verb check, page-fit estimation, the AI's edit-matching and
 * the resume parser all keep reading exactly what they read today.
 *
 * ## Why an overlay rather than markup in the string
 *
 * `**bold**` in the stored text would put markup in the content, which
 * is the one thing this design exists to prevent. It would also
 * collide with literal asterisks a candidate genuinely types
 * (`*args`, `**kwargs`, a glob), and it would make the stored text
 * differ from the text an ATS sees.
 *
 * See `docs/decisions/0008-rich-text-overlay.md`.
 */

/**
 * The marks a candidate can apply.
 *
 * Three, and only three. Not a technical limit — a product one. A
 * resume in a second colour, a second typeface or a highlight-yellow
 * marker is a red flag for an ATS parser and for a human reviewer.
 * The vocabulary is narrow on purpose.
 */
export const RICH_MARKS = ['bold', 'italic', 'underline'] as const;

export const richMarkSchema = z.enum(RICH_MARKS);
export type RichMark = z.infer<typeof richMarkSchema>;

/**
 * One marked span inside a single text field.
 *
 * `text` and `start` are BOTH stored, and that redundancy is the
 * point. A character offset alone is invalidated by any edit to the
 * field — insert one character at the front of a bullet and every
 * later offset in that bullet is wrong, which would bold the wrong
 * words. Keeping the literal text lets a mark find its anchor again
 * after the text around it moves.
 *
 * The failure mode this buys is deliberate: **a missing mark, never a
 * wrong one.** Losing a bold is a cosmetic annoyance the user can
 * re-apply; bolding the wrong words is a lie on the resume.
 */
export const richSpanSchema = z.object({
  /** The literal text this span covers. This is the re-anchoring anchor. */
  text: z.string().max(4000),
  /** Character offset of `text` within the field value, at save time. */
  start: z.number().int().min(0),
  /** Non-empty. A span with no marks is meaningless. */
  marks: z.array(richMarkSchema).min(1).max(RICH_MARKS.length)
});
export type RichSpan = z.infer<typeof richSpanSchema>;

/**
 * path → spans.
 *
 * Paths use the SAME dotted vocabulary as react-hook-form field paths
 * and the chat tools' edit paths:
 *
 *   'sections.skills.0.keywords.2'
 *   'sections.work.0.positions.0.highlights.1'
 *
 * so a mark on a skill keyword and an AI edit on the same keyword
 * address the same thing, and Slice 3 ("Scout, bold my React
 * experience") needs no new vocabulary.
 */
export const richTextSchema = z.record(
  z.string(),
  z.array(richSpanSchema).max(400)
);
export type RichTextMap = z.infer<typeof richTextSchema>;
