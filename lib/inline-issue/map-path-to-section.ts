/**
 * Path → section lookup for the inline-issue surface.
 *
 * Maps an EditableText `path` (the same string used in
 * `data-testid="editable-{path}"`) to the section header it
 * belongs to, plus a routing hint for the AI prompt.
 *
 * Sections are derived from the resume JSON Resume shape
 * (lib/resume-schema/sections). Every section has a fixed
 * title + slug; the slug is what becomes the
 * `id="section-{slug}"` attribute on the rendered <h2>.
 *
 * Two paths intentionally return `null`:
 *   1. `sections.basics.*` — there is no formal "Header" section;
 *      basics renders inline above the sections. The scorecard
 *      treats `null` as "don't pulse, don't scroll" and just
 *      shows the static CRITERIA_TIPS tip.
 *   2. Anything we don't recognize — same fallback, same UI.
 *
 * Plan: docs/plans/inline-issue-surface.md §"Pulse target".
 */

import type { SubCriterionKey, TipKind } from './types';

/**
 * One row in the section table. Kept as a const-asserted record so
 * TypeScript narrows the shape and so future contributors get a
 * helpful error if they forget `tipKind`.
 */
type SectionEntry = {
  /** EditableText path prefix (e.g. "sections.work"). */
  prefix: string;
  /** Slug used for `id="section-{slug}"` on the rendered <h2>. */
  slug: string;
  /** Pretty title shown in the pulse overlay. */
  title: string;
};

/**
 * The single source of truth for section ids. Add a new entry here
 * AND render the matching `id="section-{slug}"` in the template.
 *
 * Order doesn't matter for the lookup (we use prefix matching);
 * it's grouped by editing frequency for readability.
 */
export const SECTION_TABLE = {
  // No formal section — header renders inline above the sections.
  // We still list it so the AI prompt template can pick phrasing
  // ("the basics summary" vs. "the experience section"), but
  // `mapPathToSection()` returns a target with `sectionSlug: null`
  // for it. See `BASICS_SLUG` below.
  basics: { prefix: 'sections.basics', slug: 'basics', title: 'Header' },

  // Editing hotspots — the most-clicked sections.
  work: { prefix: 'sections.work', slug: 'experience', title: 'Experience' },
  skills: { prefix: 'sections.skills', slug: 'skills', title: 'Skills' },
  projects: { prefix: 'sections.projects', slug: 'projects', title: 'Projects' },

  // Education / recognition — second tier.
  education: {
    prefix: 'sections.education',
    slug: 'education',
    title: 'Education'
  },
  awards: { prefix: 'sections.awards', slug: 'awards', title: 'Awards' },
  certificates: {
    prefix: 'sections.certificates',
    slug: 'certificates',
    title: 'Certificates'
  },
  publications: {
    prefix: 'sections.publications',
    slug: 'publications',
    title: 'Publications'
  },

  // Lower-frequency sections.
  volunteer: {
    prefix: 'sections.volunteer',
    slug: 'volunteer',
    title: 'Volunteer'
  },
  languages: {
    prefix: 'sections.languages',
    slug: 'languages',
    title: 'Languages'
  },
  interests: {
    prefix: 'sections.interests',
    slug: 'interests',
    title: 'Interests'
  },
  references: {
    prefix: 'sections.references',
    slug: 'references',
    title: 'References'
  }
} as const satisfies Record<string, SectionEntry>;

export type SectionKey = keyof typeof SECTION_TABLE;

/**
 * Section id helper. The scorecard uses this to find the rendered
 * <h2>'s id attribute. Empty string means "no scroll target".
 */
export function sectionId(slug: string): string {
  return slug ? `section-${slug}` : '';
}

/**
 * Pure function — tests assert it stays pure (no Date.now, no
 * randomness). Returns `null` when the path doesn't map to a
 * formal section (basics, unknown prefix).
 *
 * `criterion` is passed in so we can set `tipKind` (`gap` vs
 * `rewrite`) based on what the user clicked. Default `rewrite`
 * because most criteria ("ATS Keyword Match", "Accomplishment
 * Focus") signal "the bullet needs to read stronger", not "you
 * haven't said anything here yet". Intent Coverage / skill gaps
 * are the explicit `gap` case.
 */
export function mapPathToSection(
  path: string,
  criterion: SubCriterionKey
): {
  sectionSlug: string;
  sectionTitle: string;
  bulletIndex: number | null;
  tipKind: TipKind;
} | null {
  // Defensive — strip a leading slash or whitespace. The editor
  // never produces these but a future Zod issue path could.
  const cleanPath = path.replace(/^\/+/, '').trim();

  // No path → no target.
  if (!cleanPath) return null;

  // Walk the table. Specificity matters: work/projects/education
  // are checked in table order, but since every prefix is unique
  // we don't need longest-prefix-match.
  for (const entry of Object.values(SECTION_TABLE)) {
    if (pathMatchesPrefix(cleanPath, entry.prefix)) {
      // Bullet index — only work/projects/volunteer/awards have
      // highlights arrays. We look for `highlights[N]` anywhere
      // in the path. If absent, the leaf is e.g. a position
      // title or a project description (single-line, not a bullet).
      const bulletIndex = extractBulletIndex(cleanPath);
      return {
        sectionSlug: entry.slug,
        sectionTitle: entry.title,
        bulletIndex,
        tipKind: tipKindFor(criterion, entry.slug)
      };
    }
  }

  return null;
}

/**
 * Check whether `cleanPath` is exactly `prefix` OR continues with
 * one of the two JSON-resume path separators we accept: `.`
 * (nested object access) or `[` (array index access).
 *
 * Without the `[` branch, `sections.work[0]` would never match
 * `sections.work` because the strict string comparison and the
 * `.startsWith('sections.work.')` both fail at the `[`.
 */
function pathMatchesPrefix(cleanPath: string, prefix: string): boolean {
  if (cleanPath === prefix) return true;
  if (cleanPath.startsWith(prefix + '.')) return true;
  if (cleanPath.startsWith(prefix + '[')) return true;
  return false;
}

/**
 * Extract `[N]` from the last *bullet-like* `[N]` segment of the
 * path. A "bullet-like" array is one whose elements are
 * independent rows we can attach a popover to: `highlights`,
 * `responsibilities`, `achievements`, `keywords`.
 *
 * Returns `null` for paths where the LAST indexed segment is
 * not a bullet field (e.g. `sections.education[0].degree` is
 * the degree field of education entry 0, NOT a bullet).
 *
 * Returns `null` for paths like `sections.work[0]` (the whole
 * work entry, not a single bullet inside it).
 */
function extractBulletIndex(path: string): number | null {
  const matches = [...path.matchAll(/\.([a-zA-Z_]+)\[(\d+)\]/g)];
  if (matches.length === 0) return null;
  const last = matches[matches.length - 1];
  const field = last[1];
  const index = Number(last[2]);
  if (Number.isNaN(index)) return null;
  // Only bullet-shaped arrays produce a useful bulletIndex.
  if (!BULLET_ARRAY_FIELDS.has(field)) return null;
  return index;
}

/**
 * JSON Resume fields whose `[N]` indexing points at a single
 * bullet row we can attach the popover to. Keep this in sync
 * with the bullet field names used across the resume-schema
 * sections (see `lib/resume-schema/sections/*.ts`).
 */
const BULLET_ARRAY_FIELDS = new Set([
  'highlights',
  'responsibilities',
  'achievements',
  'keywords',
  'courses',
  'roles',
  'publications',
  'languages',
  'interests',
  'references',
  'awards'
]);

/**
 * Pick the tipKind from the criterion the user clicked. Most
 * criteria are "rewrite" (the resume has SOMETHING there, just
 * reads weak). Intent Coverage + skill gaps are "gap" (the
 * resume doesn't say anything at all).
 *
 * This is the only place a future session should extend when a
 * new sub-criterion lands.
 */
function tipKindFor(criterion: SubCriterionKey, _slug: string): TipKind {
  switch (criterion) {
    case 'ATS Keyword Match':
    case 'ATS Coverage':
    case 'Intent Coverage':
      // Skill-gap criteria — the user hasn't mentioned these
      // terms at all, so the prompt should frame the rewrite
      // as "consider adding this skill" rather than "tweak your
      // existing sentence".
      return 'gap';
    default:
      return 'rewrite';
  }
}

/**
 * Slug-only lookup for callers that already have a section key
 * (e.g. a future "by section" tab in the scorecard). Kept as a
 * named export so tests can pin the slug table without going
 * through `mapPathToSection`.
 */
export function sectionSlugFor(prefix: string): string | null {
  for (const entry of Object.values(SECTION_TABLE)) {
    if (pathMatchesPrefix(prefix, entry.prefix)) {
      return entry.slug;
    }
  }
  return null;
}