/**
 * Resume schema - the canonical structured-data shape for a Nexstepper resume.
 *
 * Built on JSON Resume v1.0.0 (https://jsonresume.org/schema/) so existing
 * resume tooling, importers, and exporters stay compatible.
 *
 * One Zod schema, one TypeScript type, one JSON Schema export. Templates,
 * the AI, and the DB all consume the same shape.
 *
 * @example
 * ```ts
 * import { resumeDataSchema, blankResumeData, type ResumeData } from '@/lib/resume-schema';
 *
 * // Validate
 * const result = resumeDataSchema.safeParse(input);
 * if (!result.success) { ... }
 *
 * // Start a new resume
 * const draft = blankResumeData();
 * ```
 */

// Sections
export {
  resumeSectionsSchema,
  basicsSchema,
  workSchema,
  educationSchema,
  projectsSchema,
  skillsSchema,
  volunteerSchema,
  awardsSchema,
  certificatesSchema,
  publicationsSchema,
  languagesSchema,
  interestsSchema,
  referencesSchema
} from './sections';

export type {
  ResumeSections,
  Basics,
  Location,
  Profile,
  WorkEntry,
  Position,
  EducationEntry,
  Degree,
  ProjectEntry,
  SkillEntry,
  VolunteerEntry,
  AwardEntry,
  CertificateEntry,
  PublicationEntry,
  LanguageEntry,
  InterestEntry,
  ReferenceEntry
} from './sections';

// URL helper — human-friendly URL field that accepts bare domains and
// normalizes them to https://. See ./url.ts for the full contract.
export { flexibleUrl, optionalFlexibleUrl } from './url';

// Envelope
export { resumeDataSchema, parseResumeData } from './resume-data';
export type { ResumeData } from './resume-data';

// Job posting (used in Phase 3+, declared here so the envelope can carry it)
export { jobPostingSchema } from './job-posting';
export type { JobPosting } from './job-posting';

// Samples
export { blankResumeData, sampleResumeData } from './sample';

// JSON Schema (for AI tools)
export {
  getResumeJsonSchema,
  getResumeSectionsJsonSchema
} from './json-schema';

// Re-export zod for convenience at call sites
export { z } from 'zod';