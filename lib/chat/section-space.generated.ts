/**
 * MEASURED section-space data — GENERATED, do not edit by hand.
 *
 * Produced by:
 *   node scripts/measure-section-space.cjs
 *   node scripts/build-section-space-table.cjs
 *
 * Every number here came from printing real resumes through the real
 * templates under real print CSS and counting PDF pages. The section
 * figures are DELTAS — the difference in total page height between a
 * resume with that section and the same resume with it hidden — which
 * is the number the assistant needs when it weighs "hide this" against
 * "cut that".
 *
 * Regenerate after changing a template's typography, or after the
 * print-settings presets change.
 *
 * Source: docs/plans/resume-length-guidelines.md
 */
export const SECTION_SPACE_TABLE = `Measured vertical space per section, in inches, at DEFAULT print settings.
One page of Letter at default settings holds 9.5 inches of content.

| template | section | inches |
|---|---|---|
| Classic | _usable page_ | 9.5 |
| Classic | Header (name, contact, summary) | 2.53 |
| Classic | Experience | 4.84 |
| Classic | Projects | 2.81 |
| Classic | Awards | 1.89 |
| Classic | Skills | 1.75 |
| Classic | Volunteer | 1.24 |
| Classic | Languages | 1.24 |
| Classic | Education | 1.18 |
| Classic | Interests | 0.99 |
| Classic | Certificates | 0.95 |
| Classic | _total for this sample_ | 19.42 |
| Creative | _usable page_ | 9.5 |
| Creative | Header (name, contact, summary) | 2.06 |
| Creative | Experience | 5.24 |
| Creative | Projects | 3.36 |
| Creative | Skills | 2.17 |
| Creative | Volunteer | 1.28 |
| Creative | Education | 1.02 |
| Creative | _total for this sample_ | 15.13 |
| Executive | _usable page_ | 9.5 |
| Executive | Header (name, contact, summary) | 2.01 |
| Executive | Experience | 5.22 |
| Executive | Projects | 2.84 |
| Executive | Skills | 1.86 |
| Executive | Volunteer | 1.26 |
| Executive | Education | 1.00 |
| Executive | Publications | 0.45 |
| Executive | _total for this sample_ | 14.64 |
| Jake | _usable page_ | 9.5 |
| Jake | Header (name, contact, summary) | 2.60 |
| Jake | Experience | 4.80 |
| Jake | Projects | 2.37 |
| Jake | Awards | 1.85 |
| Jake | Skills | 1.79 |
| Jake | Education | 1.75 |
| Jake | Languages | 1.28 |
| Jake | Volunteer | 1.26 |
| Jake | Interests | 1.02 |
| Jake | Certificates | 0.98 |
| Jake | _total for this sample_ | 19.70 |
| Minimal | _usable page_ | 9.5 |
| Minimal | Header (name, contact, summary) | 2.14 |
| Minimal | Experience | 4.86 |
| Minimal | Projects | 2.75 |
| Minimal | Skills | 1.82 |
| Minimal | Volunteer | 1.20 |
| Minimal | Education | 1.16 |
| Minimal | _total for this sample_ | 13.93 |
| Modern | _usable page_ | 9.5 |
| Modern | Header (name, contact, summary) | 2.81 |
| Modern | Experience | 4.70 |
| Modern | Projects | 2.74 |
| Modern | Skills | 1.90 |
| Modern | Awards | 1.39 |
| Modern | Volunteer | 1.21 |
| Modern | Education | 0.95 |
| Modern | Certificates | 0.90 |
| Modern | Languages | 0.72 |
| Modern | Interests | 0.72 |
| Modern | _total for this sample_ | 18.04 |

The sample is a 3-role resume with 3 bullets each and every section populated, so the per-section figures are for a typical populated section — a bigger section takes more. Use these to estimate, and say "about" rather than promising an exact page count.

Hiding a section costs the user NOTHING — the content stays in their resume and stays editable, it just does not appear in the PDF. That makes it the cheapest lever for fitting a page, and it should be offered BEFORE cutting their work. Tightening the layout (compact margin + line height) buys roughly 1.5 inches on a typical resume. Cutting content is the expensive option and needs their sign-off.`;
