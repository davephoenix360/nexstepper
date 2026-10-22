/**
 * Turn the measured section-space data into the prompt table the chat
 * assistant uses.
 *
 * Why generated rather than hand-written: the numbers come from
 * printing real resumes through the real templates and counting the
 * PDF pages. Hand-copying 200 measurements into a prompt file is how
 * they end up stale and wrong. This regenerates them.
 *
 * Usage:
 *   node scripts/measure-section-space.cjs
 *   node scripts/build-section-space-table.cjs
 */
const fs = require('node:fs');
const path = require('node:path');

const DATA = path.resolve('output/section-space/section-space.json');
const OUT = path.resolve('lib/chat/section-space.generated.ts');

const raw = JSON.parse(fs.readFileSync(DATA, 'utf8'));
if (!raw.length) throw new Error('no measurements in ' + DATA);

// The table the assistant reasons from. Only the STANDARD settings are
// in the prompt: the tightened numbers differ enough that including all
// three would triple the prompt for a distinction the assistant rarely
// needs. The full set lives in the JSON and in
// docs/plans/resume-length-guidelines.md.
const byTemplate = new Map();
for (const row of raw) {
  if (row.setting !== 'standard') continue;
  byTemplate.set(row.template, row);
}

const TEMPLATE_LABEL = {
  classic: 'Classic',
  minimal: 'Minimal',
  modern: 'Modern',
  jake: 'Jake',
  executive: 'Executive',
  creative: 'Creative'
};

const SECTION_LABEL = {
  experience: 'Experience',
  skills: 'Skills',
  projects: 'Projects',
  education: 'Education',
  awards: 'Awards',
  certificates: 'Certificates',
  publications: 'Publications',
  volunteer: 'Volunteer',
  languages: 'Languages',
  interests: 'Interests',
  references: 'References'
};

const lines = [];
lines.push('Measured vertical space per section, in inches, at DEFAULT print settings.');
lines.push('One page of Letter at default settings holds 9.5 inches of content.');
lines.push('');
lines.push('| template | section | inches |');
lines.push('|---|---|---|');

const perTemplate = {};
for (const [template, row] of [...byTemplate.entries()].sort()) {
  const label = TEMPLATE_LABEL[template] ?? template;
  const entries = Object.entries(row.sectionInches).sort((a, b) => b[1] - a[1]);

  // The header (name, contact, summary) renders outside any section, so
  // it is the remainder between the total and the sections. It is real
  // space on the page and the assistant needs to know about it — a
  // summary that runs to six lines is a third of a page.
  const sectionSum = entries.reduce((a, [, v]) => a + v, 0);
  const header = Math.round((row.totalInches - sectionSum) * 100) / 100;

  perTemplate[template] = { header, ...Object.fromEntries(entries) };

  lines.push(`| ${label} | _usable page_ | ${row.usableInches} |`);
  lines.push(
    `| ${label} | Header (name, contact, summary) | ${header.toFixed(2)} |`
  );
  for (const [slug, inches] of entries) {
    lines.push(
      `| ${label} | ${SECTION_LABEL[slug] ?? slug} | ${inches.toFixed(2)} |`
    );
  }
  lines.push(
    `| ${label} | _total for this sample_ | ${row.totalInches.toFixed(2)} |`
  );
}

lines.push('');
lines.push(
  'The sample is a 3-role resume with 3 bullets each and every section populated, so the per-section figures are for a typical populated section — a bigger section takes more. Use these to estimate, and say "about" rather than promising an exact page count.'
);
lines.push('');
lines.push(
  'Hiding a section costs the user NOTHING — the content stays in their resume and stays editable, it just does not appear in the PDF. That makes it the cheapest lever for fitting a page, and it should be offered BEFORE cutting their work. Tightening the layout (compact margin + line height) buys roughly 1.5 inches on a typical resume. Cutting content is the expensive option and needs their sign-off.'
);

const body = lines.join('\n');

const ts = `/**
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
export const SECTION_SPACE_TABLE = \`${body.replace(/`/g, '\\`')}\`;
`;

fs.writeFileSync(OUT, ts, 'utf8');
console.log(`wrote ${OUT}`);
console.log(`templates: ${Object.keys(perTemplate).join(', ')}`);
for (const [t, v] of Object.entries(perTemplate)) {
  console.log(
    `  ${t.padEnd(10)} ` +
      Object.entries(v)
        .map(([k, n]) => `${k}=${n}`)
        .join(' ')
  );
}
