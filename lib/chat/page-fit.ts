import type { PrintSettings } from '@/lib/print-settings';
import type { ResumeData } from '@/lib/resume-schema';

import {
  PAGE_FIT_FORMULAS,
  ROLES_THAT_FIT,
  type PageFitFormula,
  type PageFitSetting
} from './page-fit.generated';
import { SECTION_SPACE_DATA } from './section-space.generated';

/**
 * Estimate how many pages a resume will print on.
 *
 * ## Why this exists
 *
 * "Make it fit on one page" is the single most common request a resume
 * tool gets, and until now the assistant could only answer it by guessing
 * from the user's prose. Guessing is how users end up printing, finding
 * three pages, and coming back annoyed — the exact step this product
 * exists to remove.
 *
 * So we measured instead. `scripts/measure-page-counts.cjs` prints real
 * resumes through the real templates under the real print CSS and counts
 * the PDF pages (486 of them); `scripts/measure-page-formula.cjs` fits the
 * height formula against those real counts. This module turns that
 * measurement back into a number for a resume the user actually has.
 *
 * ## The model
 *
 *     height = fixed
 *            + roles x (perRole + bulletsPerRole x perBullet)
 *            + (each other populated section's measured height)
 *
 * `fixed` is the skeleton measured with no job history — header, skills
 * and education. The other sections come from the section-space table,
 * which records the real height each section occupied when it was
 * present versus hidden.
 *
 * The Experience heading is deliberately NOT a separate term: the fit
 * that produced `perRole` already carries it in the intercept.
 *
 * ## What this is and is not
 *
 * It is a measurement-driven estimate, and it reproduces the real page
 * count on 27 of 27 measured content shapes for most templates and
 * settings. It is NOT a renderer: the assistant still cannot see the
 * document. Long summaries, unusually wide tables, and a skills section
 * much larger than the sample will move the number. So the tool reports
 * the inches as well as the pages, and the prompt tells the model to say
 * "about".
 */

/** The three measured layout presets. */
export const PAGE_FIT_SETTINGS: PageFitSetting[] = ['standard', 'compact', 'tightest'];

/**
 * The sections that are not part of the measured skeleton, with the
 * label the assistant should use for each.
 */
const OPTIONAL_SECTIONS: Array<{ slug: string; label: string }> = [
  { slug: 'projects', label: 'Projects' },
  { slug: 'volunteer', label: 'Volunteer' },
  { slug: 'awards', label: 'Awards' },
  { slug: 'certificates', label: 'Certifications' },
  { slug: 'publications', label: 'Publications' },
  { slug: 'languages', label: 'Languages' },
  { slug: 'interests', label: 'Interests' },
  { slug: 'references', label: 'References' }
];

/**
 * How far each knob is from its "compact" end, so two sets of settings
 * can be compared. Used to pick the closest measured preset.
 */
const DENSITY: Record<string, number> = {
  compact: 0,
  standard: 1,
  generous: 2,
  relaxed: 2,
  small: 0,
  large: 2
};

/** The measured presets, as density vectors. */
const PRESET_VECTORS: Record<PageFitSetting, number[]> = {
  standard: [1, 1, 1, 1, 1],
  compact: [0, 0, 1, 0, 0],
  tightest: [0, 0, 0, 0, 0]
};

/**
 * Pick the measured preset that best matches a user's actual settings.
 *
 * There are 243 combinations of the five knobs and only three measured
 * presets, so the estimator always rounds to the nearest one. It also
 * reports the knobs that differ, so the assistant can tell the user the
 * estimate is approximate when it is.
 */
export function settingsProfile(settings: PrintSettings): PageFitSetting {
  const v = [
    DENSITY[settings.margin] ?? 1,
    DENSITY[settings.lineHeight] ?? 1,
    DENSITY[settings.fontSize] ?? 1,
    DENSITY[settings.sectionSpacing] ?? 1,
    DENSITY[settings.itemSpacing] ?? 1
  ];
  let best: PageFitSetting = 'standard';
  let bestDistance = Infinity;
  for (const preset of PAGE_FIT_SETTINGS) {
    const target = PRESET_VECTORS[preset];
    const distance = v.reduce((a, x, i) => a + Math.abs(x - target[i]), 0);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = preset;
    }
  }
  return best;
}

/** The knobs whose value differs from the preset the estimate uses. */
export function settingsDifferences(
  settings: PrintSettings,
  preset: PageFitSetting
): string[] {
  const target = PRESET_VECTORS[preset];
  const actual = [
    DENSITY[settings.margin] ?? 1,
    DENSITY[settings.lineHeight] ?? 1,
    DENSITY[settings.fontSize] ?? 1,
    DENSITY[settings.sectionSpacing] ?? 1,
    DENSITY[settings.itemSpacing] ?? 1
  ];
  const names = ['margin', 'line height', 'font size', 'section spacing', 'item spacing'];
  const out: string[] = [];
  actual.forEach((x, i) => {
    if (x !== target[i]) out.push(names[i]);
  });
  return out;
}

function findFormula(
  template: string,
  setting: PageFitSetting
): PageFitFormula | undefined {
  return PAGE_FIT_FORMULAS.find(
    (f) => f.template === template && f.setting === setting
  );
}

function findSectionSpace(
  template: string,
  setting: PageFitSetting
) {
  return SECTION_SPACE_DATA.find(
    (r) => r.template === template && r.setting === setting
  );
}

/** One line of the height breakdown. */
export interface PageEstimateLine {
  label: string;
  inches: number;
}

export interface PageEstimate {
  template: string;
  setting: PageFitSetting;
  /** Estimated number of printed pages. */
  pages: number;
  /** Estimated total height of the printed content, in inches. */
  totalInches: number;
  /** Inches that fit on one page at this setting. */
  usableInches: number;
  /** Where the height went. */
  breakdown: PageEstimateLine[];
  /**
   * What hiding each visible section would save, and what the resume
   * would then print as. This is the question users actually ask.
   */
  hideOptions: Array<{
    slug: string;
    label: string;
    inches: number;
    pagesIfHidden: number;
  }>;
  /** What dropping one work entry would save. */
  perRoleInches: number;
  /** The number of roles that fit on one page at this setting. */
  rolesThatFit: number;
  /** Settings that differ from the measured preset, if any. */
  settingsDiffer: string[];
}

/** Count the work positions in a resume — each one is a role on the page. */
function countRoles(data: ResumeData): number {
  return (data.sections?.work ?? []).reduce(
    (a, entry) => a + (entry.positions?.length ?? 0),
    0
  );
}

/** Average bullets per role, rounded to the nearest half. */
function averageBullets(data: ResumeData): number {
  const positions = (data.sections?.work ?? []).flatMap((w) => w.positions ?? []);
  if (!positions.length) return 0;
  const total = positions.reduce(
    (a, p) => a + (p.highlights?.length ?? 0),
    0
  );
  return Math.round((total / positions.length) * 2) / 2;
}

/** Does this resume have content in a given section? */
function sectionHasContent(data: ResumeData, slug: string): boolean {
  const sections = data.sections as Record<string, unknown> | undefined;
  if (!sections) return false;
  const value = sections[slug];
  if (Array.isArray(value)) return value.length > 0;
  return Boolean(value);
}

/**
 * Estimate the printed length of a resume.
 *
 * Returns `null` when there is no measured formula for the template —
 * which should not happen, because the formula table is generated from
 * the same registry the templates come from, but a missing measurement
 * must degrade to "no answer" rather than to a wrong number.
 */
export function estimateResumeLength(
  data: ResumeData,
  settings: PrintSettings,
  hiddenSections: readonly string[] = []
): PageEstimate | null {
  const template = data.template ?? 'classic';
  const setting = settingsProfile(settings);

  const formula = findFormula(template, setting);
  if (!formula) return null;

  const space = findSectionSpace(template, setting);
  const hidden = new Set(hiddenSections);
  const sectionInches = space?.sectionInches ?? {};

  const roles = countRoles(data);
  const bullets = averageBullets(data);
  const experienceContent =
    roles * (formula.perRole + bullets * formula.perBullet);

  const breakdown: PageEstimateLine[] = [];

  // `fixed` is header + skills + education for a typical resume, measured
  // with no job history. If the user has no skills or no education, give
  // those inches back.
  const skillsInches = sectionInches.skills ?? 0;
  const educationInches = sectionInches.education ?? 0;
  let total = formula.fixed;
  if (!sectionHasContent(data, 'skills')) total -= skillsInches;
  if (!sectionHasContent(data, 'education')) total -= educationInches;

  breakdown.push({
    label: 'Header, skills and education',
    inches: Math.round(total * 100) / 100
  });

  // The Experience section's heading is NOT added separately: the
  // least-squares fit that produced `perRole` already carries it in the
  // intercept, so adding it again would double-count roughly a third of
  // an inch and push borderline resumes onto an extra page.
  if (roles > 0) {
    const inches = Math.round(experienceContent * 100) / 100;
    breakdown.push({
      label: `Experience (${roles} role${roles === 1 ? '' : 's'}${bullets ? `, ${bullets} bullets each` : ''})`,
      inches
    });
    total += experienceContent;
  }

  // Every other section, at its measured height.
  const hideOptions: PageEstimate['hideOptions'] = [];
  for (const { slug, label } of OPTIONAL_SECTIONS) {
    if (!sectionHasContent(data, slug)) continue;
    const inches = sectionInches[slug] ?? 0;
    if (inches <= 0) continue;
    if (hidden.has(slug)) continue;
    total += inches;
    breakdown.push({ label, inches: Math.round(inches * 100) / 100 });
  }

  // Sections the user has already hidden do not print.
  if (hidden.has('skills')) total -= skillsInches;
  if (hidden.has('education')) total -= educationInches;
  if (hidden.has('experience')) {
    total -= experienceContent;
    const line = breakdown.find((b) => b.label.startsWith('Experience'));
    if (line) line.inches = 0;
  }

  const usable = formula.usable;
  const totalInches = Math.round(Math.max(0, total) * 100) / 100;
  const pages = Math.max(1, Math.ceil(totalInches / usable));

  // What would hiding each visible optional section buy?
  for (const { slug, label } of OPTIONAL_SECTIONS) {
    if (!sectionHasContent(data, slug)) continue;
    const inches = sectionInches[slug] ?? 0;
    if (inches <= 0) continue;
    if (hidden.has(slug)) continue;
    const after = Math.max(0, totalInches - inches);
    hideOptions.push({
      slug,
      label,
      inches: Math.round(inches * 100) / 100,
      pagesIfHidden: Math.max(1, Math.ceil(after / usable))
    });
  }

  return {
    template,
    setting,
    pages,
    totalInches,
    usableInches: usable,
    breakdown: breakdown.filter((b) => b.inches > 0),
    hideOptions,
    perRoleInches:
      Math.round((formula.perRole + bullets * formula.perBullet) * 100) / 100,
    rolesThatFit: ROLES_THAT_FIT[template]?.[setting] ?? 0,
    settingsDiffer: settingsDifferences(settings, setting)
  };
}

/**
 * Render an estimate as compact text the model can act on.
 *
 * Prose + lines rather than JSON: the model reads this far better, and
 * tool results are fed back into the conversation, so every token counts.
 *
 * It lives here rather than in the tool module so it can be tested
 * without pulling in the auth stack.
 */
export function formatPageEstimate(estimate: PageEstimate): string {
  const lines: string[] = [];

  lines.push(
    `Estimated length: about ${estimate.pages} page${estimate.pages === 1 ? '' : 's'}.`
  );
  lines.push(
    `Estimated content height: ${estimate.totalInches.toFixed(1)}in, and one page holds ${estimate.usableInches.toFixed(1)}in at these settings (${estimate.setting} layout, ${estimate.template} template).`
  );
  lines.push('');
  lines.push('Where the space goes:');
  for (const line of estimate.breakdown) {
    lines.push(`  ${line.label}: ${line.inches.toFixed(2)}in`);
  }

  if (estimate.hideOptions.length) {
    lines.push('');
    lines.push(
      'Hiding a section (free — the content stays in the resume, it just does not print):'
    );
    for (const opt of estimate.hideOptions) {
      lines.push(
        `  ${opt.label}: saves ${opt.inches.toFixed(2)}in → would print as ${opt.pagesIfHidden} page${opt.pagesIfHidden === 1 ? '' : 's'}`
      );
    }
  }

  lines.push('');
  lines.push(
    `At these settings, with three bullets per role, about ${estimate.rolesThatFit} work role${estimate.rolesThatFit === 1 ? '' : 's'} fit on one page. Each role here costs about ${estimate.perRoleInches.toFixed(2)}in.`
  );

  if (estimate.settingsDiffer.length) {
    const differing = estimate.settingsDiffer;
    lines.push(
      `(Estimate uses the closest measured layout preset — ${estimate.setting}. The resume's ` +
        `${differing.join(', ')} ` +
        `${differing.length === 1 ? 'differs' : 'differ'} from it, so treat the number as approximate.)`
    );
  }

  lines.push(
    'This is a measurement-driven estimate, not a rendered proof. If the user is close to a page boundary, say "about one page, possibly spilling to two" rather than promising a page count.'
  );

  return lines.join('\n');
}
