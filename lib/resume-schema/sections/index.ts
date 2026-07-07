import { z } from 'zod';

import { basicsSchema } from './basics';
import { workSchema } from './work';
import { educationSchema } from './education';
import { projectsSchema } from './projects';
import { skillsSchema } from './skills';
import { volunteerSchema } from './volunteer';
import { awardsSchema } from './awards';
import { certificatesSchema } from './certificates';
import { publicationsSchema } from './publications';
import { languagesSchema } from './languages';
import { interestsSchema } from './interests';
import { referencesSchema } from './references';

/**
 * The body of a resume — JSON Resume v1.0.0-compatible sections.
 *
 * One source of truth: `resumeSectionsSchema` is the single Zod schema
 * describing every section. Inferred type `ResumeSections` is the single
 * TypeScript type. Templates and the AI both consume `ResumeSections` —
 * never re-shape it at the boundary.
 */
export const resumeSectionsSchema = z.object({
  basics: basicsSchema,
  work: workSchema,
  education: educationSchema,
  projects: projectsSchema,
  skills: skillsSchema,
  volunteer: volunteerSchema,
  awards: awardsSchema,
  certificates: certificatesSchema,
  publications: publicationsSchema,
  languages: languagesSchema,
  interests: interestsSchema,
  references: referencesSchema
});

// Re-export per-section schemas + types for callers that want the leaves
export { basicsSchema } from './basics';
export type { Basics, Location, Profile } from './basics';

export { workSchema } from './work';
export type { WorkEntry, Position } from './work';

export { educationSchema } from './education';
export type { EducationEntry, Degree } from './education';

export { projectsSchema } from './projects';
export type { ProjectEntry } from './projects';

export { skillsSchema } from './skills';
export type { SkillEntry } from './skills';

export { volunteerSchema } from './volunteer';
export type { VolunteerEntry } from './volunteer';

export { awardsSchema } from './awards';
export type { AwardEntry } from './awards';

export { certificatesSchema } from './certificates';
export type { CertificateEntry } from './certificates';

export { publicationsSchema } from './publications';
export type { PublicationEntry } from './publications';

export { languagesSchema } from './languages';
export type { LanguageEntry } from './languages';

export { interestsSchema } from './interests';
export type { InterestEntry } from './interests';

export { referencesSchema } from './references';
export type { ReferenceEntry } from './references';

export type ResumeSections = z.infer<typeof resumeSectionsSchema>;