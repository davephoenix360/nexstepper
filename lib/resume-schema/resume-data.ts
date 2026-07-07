import { z } from 'zod';

import { resumeSectionsSchema, type ResumeSections } from './sections';
import { jobPostingSchema, type JobPosting } from './job-posting';

/**
 * The full resume envelope — JSON Resume sections + Nextep metadata.
 *
 * This is the canonical `data` shape stored in `resume_revisions.data`
 * (JSONB column). Every read/write of resume content goes through
 * `resumeDataSchema.safeParse` — no exceptions.
 *
 * Layout:
 *   - **sections** — the JSON Resume body
 *   - **envelope fields** — Nextep metadata (display name, status, template,
 *     optional job context, master/variant pointer)
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
  jobContext: jobPostingSchema.nullable().optional()
});

export type ResumeData = z.infer<typeof resumeDataSchema>;
export type { ResumeSections, JobPosting };

/**
 * Type-safe parse — returns either the validated data or a structured error
 * suitable for surfacing to forms via react-hook-form's `zodResolver`.
 */
export function parseResumeData(input: unknown) {
  return resumeDataSchema.safeParse(input);
}