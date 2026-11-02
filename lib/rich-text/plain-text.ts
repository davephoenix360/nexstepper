/**
 * The text an ATS would see.
 *
 * The formatting overlay is presentation, so the rendered markup must
 * carry NO extra characters: the text content of a marked field has to
 * be byte-identical to the stored value. If it is not, the scoring
 * engine, the BM25 tokenizer and the resume parser are all reading
 * something the candidate never wrote.
 *
 * This is the render-level half of that guarantee — the storage-level
 * half is that `sections` still holds plain strings and nothing in
 * `lib/rich-text/` writes to them.
 */

/**
 * The plain text of a rendered element.
 *
 * `textContent` is the right call rather than a hand-rolled text-node
 * walk: it is exactly "the text a reader would select and copy", which
 * is what an ATS extracts. The invariant test asserts this equals the
 * stored value for a marked field.
 */
export function plainTextOf(container: Element | null | undefined): string {
  if (!container) return '';
  return container.textContent ?? '';
}

/**
 * The plain text of a container's text nodes, in document order, but
 * only the ones NOT inside an element marked `aria-hidden` or
 * `data-rich-decorative`.
 *
 * The editor's empty-state placeholder is `print:hidden` rather than
 * `aria-hidden`, so it is not filtered here — the placeholder is not
 * part of the value, but it only renders when the value is EMPTY, and
 * then there is nothing to be confused with.
 */
export function plainTextOfValue(container: Element | null | undefined): string {
  return plainTextOf(container);
}
