/**
 * Slugs for the PARTS of a resume a user can hide from the printed
 * document.
 *
 * ## Why there is a second vocabulary
 *
 * `data.print.hiddenSections` started out holding SECTION slugs
 * (`experience`, `skills`, `education`, …) — one per `id="section-{slug}"`
 * the templates render. That covers whole sections and nothing finer.
 *
 * But some sections are made of PARTS, and a candidate may want one
 * part of a section without losing the rest:
 *
 *   - Jake's "Relevant Coursework" block inside the Education section
 *     (a line of course names — the academic touch, and the part
 *     most likely to be irrelevant to a given job).
 *
 * There was no way to turn that off: the choice was the whole
 * Education section or nothing. So the parts get their own slugs, in
 * the SAME list (`data.print.hiddenSections`) — one place, one
 * mechanism, and the user does not have to learn a second concept.
 *
 * ## Why the list lives here and not in `lib/chat/tools/types.ts`
 *
 * The TEMPLATES need it (they render the toggle and apply
 * `print:hidden`), and the templates are not part of the chat layer.
 * `lib/print/` is the neutral home both sides can import — it already
 * holds the print helpers, and it depends on nothing.
 *
 * ## The shape
 *
 * An OBJECT keyed by part name, not a bare array. A template writes
 * `PRINTABLE_PART_SLUGS.coursework` — which reads as the part it is
 * and cannot be silently transposed with another part's slug. The
 * array form (`PRINTABLE_PART_SLUGS[0]`) is what a mistyped index
 * would look like, and a wrong slug is a toggle that hides nothing.
 *
 * `PRINTABLE_PART_SLUG_VALUES` is the array form, for `z.enum()` and
 * for the chat tool's vocabulary.
 *
 * ## The rule for adding one
 *
 * A part slug is only honest if the template ACTUALLY renders it as a
 * hideable block:
 *
 *   1. the template renders the block with the slug, and
 *   2. the block carries `print:hidden` when the slug is hidden.
 *
 * `tests/unit/print/print-cleanliness.test.tsx` asserts both — a part
 * slug that no template renders would be a promise the product cannot
 * keep (the agent could hide it, and nothing would happen).
 */
export const PRINTABLE_PART_SLUGS = {
  coursework: 'coursework'
} as const;

export type PrintablePartSlug = keyof typeof PRINTABLE_PART_SLUGS;

/**
 * The slug VALUES, in the form `z.enum()` accepts and in the order
 * they appear in the hide list.
 */
export const PRINTABLE_PART_SLUG_VALUES = [
  PRINTABLE_PART_SLUGS.coursework
] as const;

/**
 * The label the UI shows for a hidden part, so the user reads
 * "Relevant Coursework" rather than the slug.
 */
export const PRINTABLE_PART_LABELS: Record<PrintablePartSlug, string> = {
  coursework: 'Relevant Coursework'
};
