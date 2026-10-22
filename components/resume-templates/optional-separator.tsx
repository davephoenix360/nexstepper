/**
 * Separator for a row of OPTIONAL fields that are comma-joined when
 * printed.
 *
 * ## The bug this fixes
 *
 * A location line is four optional fields — street address, city,
 * region, postal code — rendered in a row. The naive implementation
 * renders a comma before every field after the first:
 *
 *     {i > 0 && <span>,</span>}
 *
 * On screen that is fine: the empty fields show a muted placeholder,
 * so "123 Main St, City, State, ZIP" reads as a form.
 *
 * In PRINT it is not. The placeholder is `print:hidden` — it disappears
 * — but the comma was not, so the printed line came out as:
 *
 *     123 Main St, , ,
 *
 * Three commas with nothing between them. The user reported exactly
 * this: "the commas beside them still render ... you just see a space
 * and comma, space, comma".
 *
 * ## The rule
 *
 * A separator is VISIBLE ON SCREEN whenever it separates two slots, so
 * an empty editor still reads as a list of fields. It is VISIBLE IN
 * PRINT only when BOTH neighbours have values — because in print the
 * empty neighbour is gone entirely, and a comma with nothing on one
 * side of it is exactly the artefact we are removing.
 *
 * Note this is about the PRINTED output, not the on-screen one. The
 * on-screen comma count is a UI affordance and is fine.
 */
export function separatorClass(
  beforeHasValue: boolean,
  afterHasValue: boolean
): string {
  return beforeHasValue && afterHasValue ? '' : 'print:hidden';
}

/**
 * Class for the separator that sits BEFORE slot `index`.
 *
 * The separator is ALWAYS visible on screen, so an empty editor reads as
 * a list of fields ("Street address, City, State, ZIP").
 *
 * In PRINT it is visible only when the slot it precedes has a value AND
 * something earlier in the row also has one — because in print the
 * empty slots vanish, and a comma with no printed partner on one side is
 * exactly the artefact this exists to remove:
 *
 *     123 Main St, , ,          <- before
 *     123 Main St               <- after
 *
 * The "something earlier has a value" half matters because the printed
 * sequence skips empty slots. With city="Edmonton", region="",
 * country="CA" the printed line is "Edmonton, CA" — the comma belongs
 * to the country slot even though the region slot sits between them in
 * the DOM, and it must survive the region slot disappearing.
 */
export function separatorBefore(
  values: readonly (string | undefined | null)[],
  index: number
): string {
  const current = isFilled(values[index]);
  const hasEarlier = values.slice(0, index).some(isFilled);
  return current && hasEarlier ? '' : 'print:hidden';
}

function isFilled(value: string | undefined | null): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}
