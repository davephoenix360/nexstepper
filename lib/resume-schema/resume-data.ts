import { z } from 'zod';

import { resumeSectionsSchema, type ResumeSections } from './sections';
import { jobPostingSchema, type JobPosting } from './job-posting';

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
 * The full resume envelope - JSON Resume sections + Nextep metadata.
 *
 * This is the canonical `data` shape stored in `resume_revisions.data`
 * (JSONB column). Every read/write of resume content goes through
 * `resumeDataSchema.safeParse` - no exceptions.
 *
 * Layout:
 *   - **sections** - the JSON Resume body
 *   - **envelope fields** - Nextep metadata (display name, status, template,
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
  print: printPrefsSchema.optional()
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
 * Type-safe parse — returns either the validated data or a structured error
 * suitable for surfacing to forms via react-hook-form's `zodResolver`.
 */
export function parseResumeData(input: unknown) {
  return resumeDataSchema.safeParse(input);
}