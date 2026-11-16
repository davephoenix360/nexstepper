/**
 * The one place that knows how to read a resume date.
 *
 * ## Why this module exists
 *
 * Two modules needed to parse resume dates, and they disagreed:
 *
 *   - `qualifications.ts` (the eligibility / degree check) understood
 *     the formats resumes actually use.
 *   - `dimensions/seniority-fit.ts` (the Seniority Fit dimension) had
 *     its own ISO-only parser.
 *
 * The result was that the Seniority Fit dimension silently measured
 * NOTHING for any resume whose dates were not ISO — and a resume's date
 * format is a typing habit, not a fact about the candidate. Two
 * candidates with identical careers scored differently depending on
 * whether one typed "May 2026" and the other typed "2026-05".
 *
 * Worse, the failure was invisible: every unparseable date was skipped,
 * the year total came out as 0, and the dimension returned its neutral
 * 50 — which reads like "we couldn't measure" but actually charges the
 * candidate 5 points of their overall score against a JD that asked for
 * no experience at all.
 *
 * So: one parser, shared. If a date format needs to be understood, it
 * is added HERE.
 *
 * ## Purity
 *
 * No `Date`, no `Date.now`, no `Math.random` — the scoring engine's
 * purity test (`tests/unit/scoring/purity.test.ts`) scans every module
 * under `lib/scoring/` for them. Dates are parsed into a plain
 * `{year, month}` shape and all arithmetic is done on integers.
 */

/** A year and (optionally) a month. Avoids `Date` entirely — see purity. */
export interface YearMonth {
  year: number;
  /** 1-12, or 0 when the source only gave a year. */
  month: number;
}

export const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
];

const MONTH_KEYS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12
};

/**
 * Parse a resume date string into a year and month.
 *
 * Handles the formats resumes actually use:
 *
 *   - "2027-06", "2027/06", "2027.06" — ISO-ish
 *   - "June 2027", "Jun 2027", "Sep. 2027", "September 2027" — month names
 *   - "06 2027", "6 2027" — month first
 *   - "2027" — a bare year (month comes back as 0)
 *
 * Returns null when there is no year in it.
 */
export function parseYearMonth(
  value: string | null | undefined
): YearMonth | null {
  if (!value) return null;
  const text = value.toLowerCase().trim();
  if (text.length === 0) return null;

  // "2027-06" / "2027/06"
  const iso = text.match(/(\d{4})\s*[-/.]\s*(\d{1,2})/);
  if (iso) {
    const month = Number(iso[2]);
    if (month >= 1 && month <= 12) {
      return { year: Number(iso[1]), month };
    }
  }

  // "june 2027" / "jun 2027" / "sep. 2027"
  const named = text.match(/([a-z]{3,9})\.?\s+(\d{4})/);
  if (named) {
    const month = MONTH_KEYS[named[1].slice(0, 3)];
    if (month) return { year: Number(named[2]), month };
  }

  // "06 2027"
  const monthFirst = text.match(/(\d{1,2})\s+(\d{4})/);
  if (monthFirst) {
    const month = Number(monthFirst[1]);
    if (month >= 1 && month <= 12) {
      return { year: Number(monthFirst[2]), month };
    }
  }

  // A bare year.
  const year = text.match(/\b(\d{4})\b/);
  if (year) return { year: Number(year[1]), month: 0 };

  return null;
}

/**
 * Parse a date for TENURE arithmetic.
 *
 * Same as `parseYearMonth`, except a bare year ("2020") becomes
 * January rather than "month unknown" (0). Tenure needs a month to do
 * arithmetic with; January is the conventional stand-in for "sometime
 * in 2020" and matches what the Seniority Fit dimension did with its
 * own ISO parser.
 */
export function parseYearMonthForTenure(
  value: string | null | undefined
): YearMonth | null {
  const parsed = parseYearMonth(value);
  if (!parsed) return null;
  return parsed.month === 0 ? { year: parsed.year, month: 1 } : parsed;
}

/** Format a parsed date for display — "June 2027" or "2027". */
export function formatYearMonth(ym: YearMonth): string {
  if (ym.month === 0) return String(ym.year);
  return `${MONTH_NAMES[ym.month - 1]} ${ym.year}`;
}
