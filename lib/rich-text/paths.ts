/**
 * Path builders for the formatting overlay.
 *
 * ## Why these exist
 *
 * The overlay is keyed by the SAME dotted paths react-hook-form uses
 * (`sections.work.0.positions.0.highlights.1`). That is deliberate:
 * a mark on a bullet and an AI edit on the same bullet then address
 * the same thing, and Slice 3 ("Scout, bold my React experience")
 * needs no new vocabulary.
 *
 * Hand-writing those paths at a dozen call sites is how they drift —
 * `sections.skills.0.keywords.2` vs `skills.0.keywords.2` vs
 * `sections.skills.0.keyword.2`. So the paths are built here, once.
 */

import type { ResumeSections } from '@/lib/resume-schema';

/**
 * The section keys a path can address. Derived from the schema so a
 * new section cannot be addressed by a typo — the compiler says no.
 */
export type SectionKey = keyof ResumeSections;

/** Join path segments, skipping empty ones. */
function join(...segments: (string | number)[]): string {
  return segments
    .filter((segment) => segment !== '' && segment !== undefined)
    .join('.');
}

/** `sections.basics.summary` */
export function basicsPath(field: string): string {
  return join('sections', 'basics', field);
}

/**
 * `sections.basics.profiles.0.network` — one online profile's field.
 *
 * `basics.profiles` is an array like every other section array, so it
 * gets the same treatment; `basicsPath` cannot express it because it
 * has no entry index.
 */
export function profilePath(
  profileIndex: number,
  field: 'network' | 'username' | 'url'
): string {
  return join('sections', 'basics', 'profiles', profileIndex, field);
}

/**
 * `sections.work.0.company` — one leaf of one entry of a section.
 *
 * The generic sibling of the named builders below: every section is an
 * array of entries, and every entry has named string leaves, so
 * `entryPath('volunteer', 2, 'organization')` is
 * `sections.volunteer.2.organization`.
 *
 * `field` may itself be dotted for a nested object —
 * `entryPath('education', 0, 'degree.degreeLevel')` is
 * `sections.education.0.degree.degreeLevel`.
 */
export function entryPath(
  section: SectionKey,
  entryIndex: number,
  field: string
): string {
  return join('sections', section, entryIndex, field);
}

/**
 * `sections.projects.0.highlights.2` — one item of a string[] leaf
 * inside a section entry.
 *
 * The per-item path is what the editor writes: `KeywordChips` and
 * `BulletList` both address their items as `<listPath>.<index>`.
 */
export function entryItemPath(
  section: SectionKey,
  entryIndex: number,
  listField: string,
  itemIndex: number
): string {
  return join('sections', section, entryIndex, listField, itemIndex);
}

/**
 * `sections.work.0.positions.1.title` — one leaf of one position of
 * one work entry.
 *
 * Positions are nested one level deeper than a section entry, so they
 * get their own builder rather than a dotted `field`.
 */
export function positionPath(
  workIndex: number,
  positionIndex: number,
  field: string
): string {
  return join('sections', 'work', workIndex, 'positions', positionIndex, field);
}

/** `sections.skills.0.keywords.2` — one keyword of one skill group. */
export function skillKeywordPath(skillIndex: number, keywordIndex: number): string {
  return join('sections', 'skills', skillIndex, 'keywords', keywordIndex);
}

/** `sections.skills.0.name` — the skill group's own name. */
export function skillNamePath(skillIndex: number): string {
  return join('sections', 'skills', skillIndex, 'name');
}

/** `sections.work.0.positions.1.highlights.3` — one bullet of one role. */
export function workHighlightPath(
  workIndex: number,
  positionIndex: number,
  highlightIndex: number
): string {
  return join(
    'sections',
    'work',
    workIndex,
    'positions',
    positionIndex,
    'highlights',
    highlightIndex
  );
}

/** `sections.work.0.company` */
export function workCompanyPath(workIndex: number): string {
  return join('sections', 'work', workIndex, 'company');
}

/** `sections.projects.0.highlights.2` */
export function projectHighlightPath(
  projectIndex: number,
  highlightIndex: number
): string {
  return join('sections', 'projects', projectIndex, 'highlights', highlightIndex);
}

/** `sections.projects.0.description` */
export function projectDescriptionPath(projectIndex: number): string {
  return join('sections', 'projects', projectIndex, 'description');
}

/** `sections.projects.0.keywords.1` */
export function projectKeywordPath(
  projectIndex: number,
  keywordIndex: number
): string {
  return join('sections', 'projects', projectIndex, 'keywords', keywordIndex);
}

/**
 * Every path a string[] leaf can have under a section — used by the
 * auto-bold action to find where a skill keyword lives without
 * hard-coding one section at a time.
 */
export function keywordPathsFor(
  section: 'skills' | 'projects' | 'languages' | 'interests',
  entryIndex: number,
  keywordIndex: number
): string {
  return join('sections', section, entryIndex, 'keywords', keywordIndex);
}
