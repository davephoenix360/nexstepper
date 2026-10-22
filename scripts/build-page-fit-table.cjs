/**
 * Turn the measured page-fit data into the prompt table AND the structured
 * data the page-count estimator uses.
 *
 * Two inputs, both measured by printing real resumes through the real
 * templates under real print CSS and counting PDF pages:
 *
 *   output/pagecounts/formulas.json  — the height formula per template
 *                                      and setting, plus how accurately it
 *                                      reproduces the real page counts
 *   output/pc-minimal/results.json   — the real page counts (486 PDFs)
 *
 * Output: lib/chat/page-fit.generated.ts
 *
 * Usage:
 *   node scripts/measure-page-counts.cjs --content=minimal
 *   node scripts/measure-page-formula.cjs
 *   node scripts/build-page-fit-table.cjs
 */
const fs = require('node:fs');
const path = require('node:path');

const FORMULAS = path.resolve('output/pagecounts/formulas.json');
const SWEEP = path.resolve('output/pc-minimal/results.json');
const OUT = path.resolve('lib/chat/page-fit.generated.ts');

const formulas = JSON.parse(fs.readFileSync(FORMULAS, 'utf8'));
const sweep = JSON.parse(fs.readFileSync(SWEEP, 'utf8'));

const SETTING_ORDER = ['standard', 'compact', 'tightest'];

const TEMPLATE_LABEL = {
  classic: 'Classic',
  minimal: 'Minimal',
  modern: 'Modern',
  jake: 'Jake',
  executive: 'Executive',
  creative: 'Creative'
};

/**
 * The LARGEST role count that still prints on one page, per template and
 * setting.
 *
 * "Largest" is the useful direction: the smallest is always 0 and says
 * nothing. Measured at three bullets per role, which is the common case.
 */
function maxRolesThatFit(template, setting, bullets) {
  const rows = sweep.results
    .filter(
      (r) =>
        r.template === template && r.setting === setting && r.bullets === bullets
    )
    .sort((a, b) => a.roles - b.roles);
  const fits = rows.filter((r) => r.pages === 1).map((r) => r.roles);
  return fits.length ? Math.max(...fits) : 0;
}

const templates = [...new Set(formulas.map((f) => f.template))].sort();

// ─── structured formula table ────────────────────────────────────────────
const structured = formulas.map((f) => ({
  template: f.template,
  setting: f.setting,
  fixed: f.fixed,
  perRole: f.perRole,
  perBullet: f.perBullet,
  usable: f.usable,
  contentWidthIn: f.contentWidthIn ?? null,
  accuracy: f.accuracy?.height ?? f.accuracy ?? null
}));

// ─── roles-that-fit table ────────────────────────────────────────────────
const rolesThatFit = {};
for (const template of templates) {
  rolesThatFit[template] = {};
  for (const setting of SETTING_ORDER) {
    rolesThatFit[template][setting] = maxRolesThatFit(template, setting, 3);
  }
}

// ─── prompt tables ───────────────────────────────────────────────────────
const lines = [];

// 1. How many roles fit on one page.
lines.push('How many roles fit on ONE page (measured — real resumes printed and counted):');
lines.push('');
lines.push('| template | default settings | tightened layout | tightest preset |');
lines.push('|---|---|---|---|');
for (const template of templates) {
  const label = TEMPLATE_LABEL[template] ?? template;
  const cells = SETTING_ORDER.map((s) => {
    const n = rolesThatFit[template][s];
    return n === 0 ? 'none' : `${n} role${n === 1 ? '' : 's'}`;
  });
  lines.push(`| ${label} | ${cells.join(' | ')} |`);
}
lines.push('');
lines.push(
  'That is at three bullets per role. Fewer bullets per role fits more roles; more bullets fits fewer.'
);

// 2. The height formula, so the assistant can work out what an
//    arbitrary resume weighs rather than only reading a lookup.
lines.push('');
lines.push('The height formula, so you can estimate a resume that is not in the table above:');
lines.push('');
lines.push('```');
lines.push('height_inches = fixed + roles x (perRole + bullets_per_role x perBullet)');
lines.push('pages         = ceil(height_inches / usable_inches_per_page)');
lines.push('```');
lines.push('');
lines.push('| template | setting | fixed | per role | per bullet | usable page |');
lines.push('|---|---|---|---|---|---|');
for (const f of formulas) {
  const label = TEMPLATE_LABEL[f.template] ?? f.template;
  lines.push(
    `| ${label} | ${f.setting} | ${f.fixed.toFixed(2)}in | ` +
      `${f.perRole.toFixed(2)}in | ${f.perBullet.toFixed(2)}in | ${f.usable.toFixed(1)}in |`
  );
}
lines.push('');
lines.push(
  '`fixed` is the skeleton — name, contact, summary, skills and education with no job history. Add the other sections from the section table below.'
);

const body = lines.join('\n');

const ts = `/**
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
 *   2. The \`@page\` margin only applies once the per-resume CSS variable
 *      has been mirrored onto the root element. Until that happens the
 *      page box silently falls back to 0.4in — so a harness that prints
 *      too early measures the wrong margin for every single sample.
 *
 * ## The accuracy field
 *
 * \`accuracy\` is how often \`ceil(height / usable)\` reproduced the REAL
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

export const PAGE_FIT_FORMULAS: PageFitFormula[] = ${JSON.stringify(structured, null, 2)};

/** The largest number of work entries that still printed on one page. */
export const ROLES_THAT_FIT: Record<string, Record<string, number>> = ${JSON.stringify(rolesThatFit, null, 2)};

export const PAGE_FIT_TABLE = \`${body.replace(/`/g, '\\`')}\`;
`;

fs.writeFileSync(OUT, ts, 'utf8');
console.log(`wrote ${OUT}`);
console.log(`templates: ${templates.join(', ')}`);
for (const t of templates) {
  console.log(
    `  ${t.padEnd(10)} ` +
      SETTING_ORDER.map((s) => `${s}=${rolesThatFit[t][s]}`).join('  ')
  );
}
