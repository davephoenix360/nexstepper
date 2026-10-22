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
| Classic | Header (name, contact, summary) | 2.51 |
| Classic | Experience | 4.84 |
| Classic | Projects | 2.81 |
| Classic | Awards | 1.89 |
| Classic | Skills | 1.88 |
| Classic | Languages | 1.31 |
| Classic | Volunteer | 1.24 |
| Classic | Education | 1.18 |
| Classic | Interests | 1.03 |
| Classic | Certificates | 0.95 |
| Classic | _total for this sample_ | 19.64 |
| Creative | _usable page_ | 9.5 |
| Creative | Header (name, contact, summary) | 2.10 |
| Creative | Experience | 5.16 |
| Creative | Projects | 3.35 |
| Creative | Skills | 2.11 |
| Creative | Volunteer | 1.27 |
| Creative | Education | 1.01 |
| Creative | _total for this sample_ | 15.00 |
| Executive | _usable page_ | 9.5 |
| Executive | Header (name, contact, summary) | 1.99 |
| Executive | Experience | 5.14 |
| Executive | Projects | 2.84 |
| Executive | Skills | 1.61 |
| Executive | Volunteer | 1.26 |
| Executive | Education | 1.01 |
| Executive | Publications | 0.46 |
| Executive | _total for this sample_ | 14.31 |
| Jake | _usable page_ | 9.5 |
| Jake | Header (name, contact, summary) | 2.61 |
| Jake | Experience | 4.74 |
| Jake | Projects | 2.38 |
| Jake | Skills | 1.92 |
| Jake | Awards | 1.84 |
| Jake | Education | 1.75 |
| Jake | Languages | 1.35 |
| Jake | Volunteer | 1.25 |
| Jake | Interests | 1.06 |
| Jake | Certificates | 0.98 |
| Jake | _total for this sample_ | 19.88 |
| Minimal | _usable page_ | 9.5 |
| Minimal | Header (name, contact, summary) | 2.20 |
| Minimal | Experience | 4.77 |
| Minimal | Projects | 2.75 |
| Minimal | Skills | 1.55 |
| Minimal | Volunteer | 1.18 |
| Minimal | Education | 1.14 |
| Minimal | _total for this sample_ | 13.59 |
| Modern | _usable page_ | 9.5 |
| Modern | Header (name, contact, summary) | 2.76 |
| Modern | Experience | 4.71 |
| Modern | Projects | 2.76 |
| Modern | Skills | 1.87 |
| Modern | Awards | 1.39 |
| Modern | Volunteer | 1.21 |
| Modern | Education | 0.96 |
| Modern | Certificates | 0.92 |
| Modern | Languages | 0.72 |
| Modern | Interests | 0.72 |
| Modern | _total for this sample_ | 18.02 |

The sample is a 3-role resume with 3 bullets each and every section populated, so the per-section figures are for a typical populated section — a bigger section takes more. Use these to estimate, and say "about" rather than promising an exact page count.

Hiding a section costs the user NOTHING — the content stays in their resume and stays editable, it just does not appear in the PDF. That makes it the cheapest lever for fitting a page, and it should be offered BEFORE cutting their work. Tightening the layout (compact margin + line height) buys roughly 1.5 inches on a typical resume. Cutting content is the expensive option and needs their sign-off.`;
