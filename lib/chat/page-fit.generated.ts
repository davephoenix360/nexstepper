/**
 * MEASURED page-fit data — GENERATED, do not edit by hand.
 *
 * Produced by:
 *   node scripts/measure-page-counts.cjs --content=minimal
 *   node scripts/measure-page-formula.cjs
 *   node scripts/build-page-fit-table.cjs
 *
 * ## Where these numbers come from
 *
 * Every one of them is a real measurement: resumes were rendered through
 * the real templates under the real print CSS, printed to PDF, and the
 * PDF pages were counted. Nothing here is an estimate of an estimate.
 *
 * Two measurement details matter, and both were bugs first:
 *
 *   1. The DOM has to be measured at the PAPER CONTENT WIDTH (paper width
 *      minus the page margin), because that is the width the text wraps
 *      at when it prints. Measuring at the 8.5in screen width reports a
 *      shorter resume than the one that prints.
 *   2. The `@page` margin only applies once the per-resume CSS variable
 *      has been mirrored onto the root element. Until that happens the
 *      page box silently falls back to 0.4in — so a harness that prints
 *      too early measures the wrong margin for every single sample.
 *
 * ## The accuracy field
 *
 * `accuracy` is how often `ceil(height / usable)` reproduced the REAL
 * page count across the 27 measured content shapes for that template and
 * setting. It is reported rather than hidden: the assistant should say
 * "about" when it quotes a page count.
 *
 * Source: docs/plans/resume-length-guidelines.md
 */
export type PageFitSetting = 'standard' | 'compact' | 'tightest';

export interface PageFitFormula {
  template: string;
  setting: PageFitSetting;
  /** Inches of content with no job history: header, skills, education. */
  fixed: number;
  /** Inches one more work entry adds, before its bullets. */
  perRole: number;
  /** Inches one more bullet adds to a work entry. */
  perBullet: number;
  /** Inches of content that fit on one page at this setting. */
  usable: number;
  /** Width the content was measured at, in inches. */
  contentWidthIn: number | null;
  /** How often the formula reproduced the real page count. */
  accuracy: string | null;
}

export const PAGE_FIT_FORMULAS: PageFitFormula[] = [
  {
    "template": "classic",
    "setting": "standard",
    "fixed": 6,
    "perRole": 0.74,
    "perBullet": 0.43,
    "usable": 9.5,
    "contentWidthIn": 7,
    "accuracy": "27/27"
  },
  {
    "template": "classic",
    "setting": "compact",
    "fixed": 5.38,
    "perRole": 0.72,
    "perBullet": 0.3,
    "usable": 10,
    "contentWidthIn": 7.5,
    "accuracy": "27/27"
  },
  {
    "template": "classic",
    "setting": "tightest",
    "fixed": 5,
    "perRole": 0.67,
    "perBullet": 0.21,
    "usable": 10,
    "contentWidthIn": 7.5,
    "accuracy": "27/27"
  },
  {
    "template": "minimal",
    "setting": "standard",
    "fixed": 6.25,
    "perRole": 0.65,
    "perBullet": 0.46,
    "usable": 9.5,
    "contentWidthIn": 7,
    "accuracy": "27/27"
  },
  {
    "template": "minimal",
    "setting": "compact",
    "fixed": 5.34,
    "perRole": 0.58,
    "perBullet": 0.36,
    "usable": 10,
    "contentWidthIn": 7.5,
    "accuracy": "26/27"
  },
  {
    "template": "minimal",
    "setting": "tightest",
    "fixed": 4.91,
    "perRole": 0.54,
    "perBullet": 0.28,
    "usable": 10,
    "contentWidthIn": 7.5,
    "accuracy": "27/27"
  },
  {
    "template": "modern",
    "setting": "standard",
    "fixed": 6.02,
    "perRole": 0.7,
    "perBullet": 0.45,
    "usable": 9.5,
    "contentWidthIn": 7,
    "accuracy": "26/27"
  },
  {
    "template": "modern",
    "setting": "compact",
    "fixed": 5.1,
    "perRole": 0.59,
    "perBullet": 0.33,
    "usable": 10,
    "contentWidthIn": 7.5,
    "accuracy": "27/27"
  },
  {
    "template": "modern",
    "setting": "tightest",
    "fixed": 4.69,
    "perRole": 0.57,
    "perBullet": 0.23,
    "usable": 10,
    "contentWidthIn": 7.5,
    "accuracy": "27/27"
  },
  {
    "template": "executive",
    "setting": "standard",
    "fixed": 6.62,
    "perRole": 0.67,
    "perBullet": 0.51,
    "usable": 9.5,
    "contentWidthIn": 7,
    "accuracy": "26/27"
  },
  {
    "template": "executive",
    "setting": "compact",
    "fixed": 5.86,
    "perRole": 0.59,
    "perBullet": 0.38,
    "usable": 10,
    "contentWidthIn": 7.5,
    "accuracy": "25/27"
  },
  {
    "template": "executive",
    "setting": "tightest",
    "fixed": 5.43,
    "perRole": 0.54,
    "perBullet": 0.29,
    "usable": 10,
    "contentWidthIn": 7.5,
    "accuracy": "26/27"
  },
  {
    "template": "creative",
    "setting": "standard",
    "fixed": 7.1,
    "perRole": 0.67,
    "perBullet": 0.52,
    "usable": 9.5,
    "contentWidthIn": 7,
    "accuracy": "27/27"
  },
  {
    "template": "creative",
    "setting": "compact",
    "fixed": 5.98,
    "perRole": 0.61,
    "perBullet": 0.4,
    "usable": 10,
    "contentWidthIn": 7.5,
    "accuracy": "27/27"
  },
  {
    "template": "creative",
    "setting": "tightest",
    "fixed": 5.54,
    "perRole": 0.56,
    "perBullet": 0.31,
    "usable": 10,
    "contentWidthIn": 7.5,
    "accuracy": "25/27"
  },
  {
    "template": "jake",
    "setting": "standard",
    "fixed": 6.72,
    "perRole": 0.7,
    "perBullet": 0.45,
    "usable": 9.5,
    "contentWidthIn": 7,
    "accuracy": "27/27"
  },
  {
    "template": "jake",
    "setting": "compact",
    "fixed": 6.03,
    "perRole": 0.6,
    "perBullet": 0.29,
    "usable": 10,
    "contentWidthIn": 7.5,
    "accuracy": "27/27"
  },
  {
    "template": "jake",
    "setting": "tightest",
    "fixed": 5.58,
    "perRole": 0.56,
    "perBullet": 0.21,
    "usable": 10,
    "contentWidthIn": 7.5,
    "accuracy": "27/27"
  }
];

/** The largest number of work entries that still printed on one page. */
export const ROLES_THAT_FIT: Record<string, Record<string, number>> = {
  "classic": {
    "standard": 1,
    "compact": 2,
    "tightest": 3
  },
  "creative": {
    "standard": 1,
    "compact": 2,
    "tightest": 3
  },
  "executive": {
    "standard": 1,
    "compact": 2,
    "tightest": 3
  },
  "jake": {
    "standard": 1,
    "compact": 2,
    "tightest": 3
  },
  "minimal": {
    "standard": 1,
    "compact": 2,
    "tightest": 3
  },
  "modern": {
    "standard": 1,
    "compact": 3,
    "tightest": 4
  }
};

export const PAGE_FIT_TABLE = `How many roles fit on ONE page (measured — real resumes printed and counted):

| template | default settings | tightened layout | tightest preset |
|---|---|---|---|
| Classic | 1 role | 2 roles | 3 roles |
| Creative | 1 role | 2 roles | 3 roles |
| Executive | 1 role | 2 roles | 3 roles |
| Jake | 1 role | 2 roles | 3 roles |
| Minimal | 1 role | 2 roles | 3 roles |
| Modern | 1 role | 3 roles | 4 roles |

That is at three bullets per role. Fewer bullets per role fits more roles; more bullets fits fewer.

The height formula, so you can estimate a resume that is not in the table above:

\`\`\`
height_inches = fixed + roles x (perRole + bullets_per_role x perBullet)
pages         = ceil(height_inches / usable_inches_per_page)
\`\`\`

| template | setting | fixed | per role | per bullet | usable page |
|---|---|---|---|---|---|
| Classic | standard | 6.00in | 0.74in | 0.43in | 9.5in |
| Classic | compact | 5.38in | 0.72in | 0.30in | 10.0in |
| Classic | tightest | 5.00in | 0.67in | 0.21in | 10.0in |
| Minimal | standard | 6.25in | 0.65in | 0.46in | 9.5in |
| Minimal | compact | 5.34in | 0.58in | 0.36in | 10.0in |
| Minimal | tightest | 4.91in | 0.54in | 0.28in | 10.0in |
| Modern | standard | 6.02in | 0.70in | 0.45in | 9.5in |
| Modern | compact | 5.10in | 0.59in | 0.33in | 10.0in |
| Modern | tightest | 4.69in | 0.57in | 0.23in | 10.0in |
| Executive | standard | 6.62in | 0.67in | 0.51in | 9.5in |
| Executive | compact | 5.86in | 0.59in | 0.38in | 10.0in |
| Executive | tightest | 5.43in | 0.54in | 0.29in | 10.0in |
| Creative | standard | 7.10in | 0.67in | 0.52in | 9.5in |
| Creative | compact | 5.98in | 0.61in | 0.40in | 10.0in |
| Creative | tightest | 5.54in | 0.56in | 0.31in | 10.0in |
| Jake | standard | 6.72in | 0.70in | 0.45in | 9.5in |
| Jake | compact | 6.03in | 0.60in | 0.29in | 10.0in |
| Jake | tightest | 5.58in | 0.56in | 0.21in | 10.0in |

\`fixed\` is the skeleton — name, contact, summary, skills and education with no job history. Add the other sections from the section table below.`;
