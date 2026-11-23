import { z } from 'zod';

import { resumeSectionsSchema, type ResumeSections } from './sections';
import { jobPostingSchema, type JobPosting } from './job-posting';
import { richTextSchema } from './rich-text';

/**
 * Print / export preferences. Lives on the resume envelope so a
 * single resume can carry different "what to hide from PDF" choices
 * than its master / sibling variants.
 *
 *   `hiddenSections` — slugs (kebab-case) of sections the user
 *   wants EXCLUDED from the printable / PDF render. The editor
 *   still shows them (so the user can edit them); only the PDF
 *   omits them. See `SECTION_SLUGS` in `map-path-to-section.ts`
 *   for the slug vocabulary.
 *
 *   This is intentionally a denylist (array of slugs) rather than
 *   an allowlist — every new section the schema adds becomes
 *   printable by default, which matches user expectation.
 */
export const printPrefsSchema = z.object({
  hiddenSections: z.array(z.string().min(1).max(64)).default([])
});

/**
 * The full resume envelope - JSON Resume sections + Nexstepper metadata.
 *
 * This is the canonical `data` shape stored in `resume_revisions.data`
 * (JSONB column). Every read/write of resume content goes through
 * `resumeDataSchema.safeParse` - no exceptions.
 *
 * Layout:
 *   - **sections** - the JSON Resume body
 *   - **envelope fields** - Nexstepper metadata (display name, status, template,
 *     optional job context, master/variant pointer, print prefs)
 *
 * The DB columns `id`, `userId`, `parentResumeId`, `isMaster`, `createdAt`,
 * `updatedAt` are stored separately on `resumes` so they can be queried
 * without parsing the JSONB. The Zod envelope is the full payload shape;
 * the DB just projects the queryable bits into columns.
 */
export const resumeDataSchema = z.object({
  // --- Sections ---
  sections: resumeSectionsSchema,

  // --- Envelope metadata ---
  /** Display name shown in lists and PDF headers. */
  name: z.string().min(1).max(100).default('Untitled resume'),
  /** Free-form note from the user (target role, "for FAANG", etc.). */
  note: z.string().max(2000).default(''),
  /** User-set lifecycle status. 'completed' gates Phase 4 features. */
  status: z.enum(['draft', 'completed']).default('draft'),
  /** Template ID this resume should render with. Phase 1 ships just 'classic'. */
  template: z.string().default('classic'),
  /** Optional attached job posting for tailoring + scoring (Phase 3+). */
  jobContext: jobPostingSchema.nullable().optional(),
  /**
   * Print / export preferences (Phase 3.5 "hide section from PDF").
   * Optional for backward compat — every existing resume in the DB
   * predates this field and parses cleanly with `print = undefined`.
   * Templates fall back to `printHiddenIf(empty)` for sections with
   * no content (the existing behavior); the new field is purely
   * additive.
   */
  print: printPrefsSchema.optional(),
  /**
   * The formatting overlay — bold / italic / underline, keyed by the
   * dotted path of the field it applies to.
   *
   * OPTIONAL and additive: every resume that predates the feature
   * parses cleanly with this undefined, and a resume with no
   * formatting behaves exactly as it did before.
   *
   * The `sections` above stay PLAIN STRINGS. Nothing here may alter a
   * stored character — the scoring engine, the parsers and the ATS
   * extraction all keep reading the text the candidate wrote.
   *
   * See `docs/decisions/0008-rich-text-overlay.md`.
   */
  formatting: richTextSchema.optional()
});

export type ResumeData = z.infer<typeof resumeDataSchema>;
export type PrintPrefs = z.infer<typeof printPrefsSchema>;
export type { ResumeSections, JobPosting };

/**
 * Predicate used by templates to decide whether a section should
 * be omitted from the PDF render. Returns `true` when the section
 * is either:
 *   - empty AND the editor is in view mode (existing
 *     `printHiddenIf(empty)` behavior — avoids empty header bands
 *     in the PDF), OR
 *   - explicitly in `data.print.hiddenSections`.
 *
 * Editors ALWAYS render the section regardless of this flag — the
 * user needs to see + edit hidden sections. Only the printable
 * view omits them.
 */
export function isSectionHiddenFromPrint(
  data: { print?: { hiddenSections?: readonly string[] } },
  sectionSlug: string
): boolean {
  // Tolerate a partial `print` envelope (e.g. when a caller passes
  // `{ print: {} }` from a code path that hasn't populated
  // `hiddenSections` yet). `?.` short-circuits when `print` or
  // `hiddenSections` is missing.
  return data.print?.hiddenSections?.includes(sectionSlug) ?? false;
}

/**
 * The data each SECTION slug reads.
 *
 * `summary` is here too even though it is not in
 * `PRINTABLE_SECTION_SLUGS` (the chat tool's vocabulary): every
 * template renders it as `sectionSlug="summary"`, so the section
 * wrappers need to know how to judge it.
 */
const SECTION_DATA: Record<string, (data: ResumeData) => unknown> = {
  summary: (d) => d.sections.basics.summary,
  experience: (d) => d.sections.work,
  skills: (d) => d.sections.skills,
  education: (d) => d.sections.education,
  projects: (d) => d.sections.projects,
  awards: (d) => d.sections.awards,
  certificates: (d) => d.sections.certificates,
  publications: (d) => d.sections.publications,
  volunteer: (d) => d.sections.volunteer,
  languages: (d) => d.sections.languages,
  interests: (d) => d.sections.interests,
  references: (d) => d.sections.references
};

/**
 * Does this value contain ANY text that would actually print?
 *
 * A generic deep scan rather than a per-section rule, because the
 * shape of a section entry differs across sections (a work entry has
 * nested `positions[].highlights[]`, an education entry has a nested
 * `degree`, a skill has `keywords[]`) and a rule per section would
 * be a rule to keep in sync with the schema.
 */
function hasPrintableContent(value: unknown): boolean {
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(hasPrintableContent);
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some(
      hasPrintableContent
    );
  }
  return false;
}

/**
 * Is this section EMPTY — i.e. would it print nothing but a heading?
 *
 * ## Why the templates need this
 *
 * A resume section prints its HEADING unconditionally (the heading is
 * the template's chrome, not the candidate's content), so a section
 * with no content prints a bare heading: "Volunteer" with nothing
 * under it. The user sees it on the printed page and it reads like a
 * mistake.
 *
 * The Classic template has always handled this — its editor path
 * carries `printHiddenIf(empty)` on the section wrapper and its
 * read-only path skips the section entirely when the array is empty.
 * The other five templates did not: their section WRAPPER sits
 * OUTSIDE the per-section renderer, so when the renderer returned
 * `null` ("no data in read-only mode") the heading had already been
 * committed to the DOM.
 *
 * This predicate is the shared rule those templates now use. It is
 * stricter than "the array is empty": an array holding one entry the
 * candidate never filled in is ALSO empty, because nothing in it
 * would print.
 *
 * Unknown slugs return `false` — never hide a section we do not
 * understand.
 */
export function isResumeSectionEmpty(
  data: ResumeData,
  sectionSlug: string | undefined
): boolean {
  if (!sectionSlug) return false;
  const pick = SECTION_DATA[sectionSlug];
  if (!pick) return false;
  return !hasPrintableContent(pick(data));
}

/**
 * Type-safe parse — returns either the validated data or a structured error
 * suitable for surfacing to forms via react-hook-form's `zodResolver`.
 */
export function parseResumeData(input: unknown) {
  return resumeDataSchema.safeParse(input);
}