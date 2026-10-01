import { z } from 'zod';

/**
 * Argument shapes for the chat assistant's tools.
 *
 * ## Why these are surgical operations, not a resume replacement
 *
 * The original `editResume` took whole arrays and required a mandatory `id` on
 * every entry. That was a design dead end, and it is the direct cause of the
 * "the agent says it edited my resume and nothing changes" reports:
 *
 *  1. The resume context sent to the model contains **no IDs**, so a required
 *     `id` could only ever be hallucinated. Validation failed, the tool
 *     returned an error, and the user saw nothing happen.
 *  2. Full-array replacement forced the model to echo the user's entire
 *     resume back on every edit — thousands of tokens, a truncation risk, and
 *     a chance to silently drop history it mis-copied.
 *  3. The shape disagreed with `ResumeData`: skills were modelled as
 *     `{id, name, level}` when the real schema is `{name, level, keywords}`,
 *     so AI-authored skills arrived with no keywords (blank categories in the
 *     PDF). Projects used `link` when the real key is `url`, so links were
 *     dropped. The `as any` cast meant Zod never complained.
 *
 * Every operation below is therefore **additive or targeted**: the model names
 * what to change and where to find it using strings it can actually see in the
 * resume context (company name, role, institution). Nothing is identified by an
 * opaque id, and nothing requires echoing existing content back.
 *
 * Plan: docs/plans/chat-agent-v2.md
 */

/**
 * Partial update to the `basics` block (name, contact details, summary).
 * Only the keys present are written; every omitted key is left untouched.
 *
 * This is the operation behind "I don't like my summary" — the most common
 * complaint that motivated this rewrite.
 */
export const setBasicsSchema = z.object({
  name: z.string().min(1).optional().describe('Full legal name'),
  headline: z
    .string()
    .min(1)
    .optional()
    .describe('Professional headline / target title, e.g. "Senior Backend Engineer"'),
  email: z.string().optional().describe('Contact email'),
  phone: z.string().optional().describe('Contact phone'),
  website: z.string().optional().describe('Personal site or portfolio URL'),
  linkedin: z.string().optional().describe('LinkedIn profile URL or handle'),
  github: z.string().optional().describe('GitHub profile URL or handle'),
  city: z.string().optional().describe('City'),
  region: z.string().optional().describe('State, province, or region'),
  countryCode: z
    .string()
    .length(2)
    .optional()
    .describe('Two-letter ISO 3166-1 country code, e.g. "US", "ZA"'),
  summary: z
    .string()
    .optional()
    .describe(
      'The professional summary / profile paragraph. Send the FULL replacement text, not a diff.'
    )
});

/** A new role to append to the work history. */
export const addWorkSchema = z.object({
  company: z.string().min(1).describe('Company name, exactly as it should appear'),
  role: z.string().min(1).describe('Job title for this position'),
  location: z.string().optional().describe('Office location, e.g. "Remote", "Cape Town"'),
  startDate: z
    .string()
    .optional()
    .describe('Start date. Use "2023", "2023-04", or "2023-04-15". Use "" for unknown.'),
  endDate: z
    .string()
    .optional()
    .describe('End date. Use "" for a current role, otherwise the same format as startDate.'),
  highlights: z
    .array(z.string())
    .optional()
    .describe('Accomplishment bullets. Lead with a metric where you know one.')
});

/** Fields that may be changed on an existing role. */
export const workUpdateFieldsSchema = z.object({
  role: z.string().min(1).optional().describe('New job title'),
  location: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional().describe('"" for a current role'),
  description: z.string().optional().describe('Company-level blurb'),
  highlights: z
    .array(z.string())
    .optional()
    .describe('REPLACES the full bullet list for this role. Include existing bullets you want to keep.')
});

/**
 * Target an existing role for editing.
 *
 * `matchCompany` is required and matched case-insensitively as a substring.
 * `matchRole` narrows the match when someone held more than one role at the
 * same company; omit it when there is only one.
 */
export const updateWorkSchema = z.object({
  matchCompany: z
    .string()
    .min(1)
    .describe('Company name of the role to change, copied from the resume above'),
  matchRole: z
    .string()
    .optional()
    .describe('Job title of the role to change. Required only if the company appears more than once.'),
  set: workUpdateFieldsSchema
});

/** Target an existing role for deletion. */
export const removeWorkSchema = z.object({
  company: z.string().min(1).describe('Company name of the role to remove'),
  role: z
    .string()
    .optional()
    .describe('Job title. Required only if the company appears more than once.')
});

export const addEducationSchema = z.object({
  institution: z.string().min(1).describe('School or institution name'),
  degreeLevel: z.string().optional().describe('e.g. "Bachelor", "Master", "PhD"'),
  majors: z.array(z.string()).optional().describe('Field(s) of study, e.g. ["Computer Science"]'),
  minors: z.array(z.string()).optional(),
  location: z.string().optional(),
  startDate: z.string().optional().describe('"2018", "2018-09", or "" for unknown'),
  endDate: z.string().optional().describe('Graduation date, or "" if still enrolled'),
  gpa: z.string().optional().describe('GPA as a string, e.g. "3.8/4.0". Omit unless strong.'),
  courses: z
    .array(z.string())
    .optional()
    .describe('Relevant coursework. Keep to 3-5 entries and only if genuinely relevant.')
});

export const removeEducationSchema = z.object({
  institution: z.string().min(1).describe('Institution of the entry to remove')
});

/**
 * Add keywords to a skill category.
 *
 * **Merges** into an existing category of the same name rather than replacing
 * it, so "add Python to my skills" keeps the user's other languages. This
 * matches the real `{name, level, keywords}` schema, which the previous
 * `{id, name, level}` tool shape destroyed.
 */
export const addSkillsSchema = z.object({
  category: z
    .string()
    .min(1)
    .describe('Skill category name, e.g. "Backend", "Languages". Reuses an existing category when one matches.'),
  keywords: z.array(z.string()).describe('Skills to add under this category')
});

/** Remove specific keywords from a skill category. */
export const removeSkillsSchema = z.object({
  category: z.string().min(1).describe('Skill category name'),
  keywords: z.array(z.string()).describe('Keywords to remove from this category')
});

export const addProjectSchema = z.object({
  name: z.string().min(1).describe('Project name'),
  description: z.string().optional().describe('One or two sentences on what it is and why it mattered'),
  highlights: z.array(z.string()).optional().describe('What you built or achieved'),
  keywords: z.array(z.string()).optional().describe('Tech stack, e.g. ["React", "Postgres"]'),
  roles: z.array(z.string()).optional().describe('e.g. ["Tech Lead", "Solo Developer"]'),
  startDate: z.string().optional(),
  endDate: z.string().optional().describe('"" if ongoing'),
  url: z.string().optional().describe('Live URL or repository URL. Note: this key is `url`, not `link`.')
});

export const updateProjectSchema = z.object({
  matchName: z.string().min(1).describe('Exact project name to change, copied from the resume above'),
  set: z.object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    highlights: z.array(z.string()).optional(),
    keywords: z.array(z.string()).optional(),
    roles: z.array(z.string()).optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    url: z.string().optional()
  })
});

export const removeProjectSchema = z.object({
  name: z.string().min(1).describe('Exact project name to remove')
});

export const addCertificatesSchema = z.object({
  name: z.string().min(1),
  issuer: z.string().optional(),
  date: z.string().optional(),
  url: z.string().optional()
});

export const addLanguagesSchema = z.object({
  language: z.string().min(1).describe('e.g. "English", "isiZulu", "Spanish"'),
  fluency: z
    .string()
    .optional()
    .describe('e.g. "Native", "Fluent", "Conversational", "Basic"')
});

export const addInterestsSchema = z.object({
  name: z.string().min(1).describe('e.g. "Open Source", "Trail running"'),
  keywords: z.array(z.string()).optional()
});

export const addAwardsSchema = z.object({
  title: z.string().min(1),
  awarder: z.string().optional(),
  date: z.string().optional(),
  summary: z.string().optional()
});

/**
 * Section slugs the agent may empty wholesale.
 *
 * Deliberately excludes `basics` — an assistant should never be able to wipe a
 * user's name and contact details as a side effect of a misparse.
 */
export const CLEARABLE_SECTIONS = [
  'work',
  'education',
  'projects',
  'skills',
  'volunteer',
  'awards',
  'certificates',
  'publications',
  'languages',
  'interests',
  'references'
] as const;

export type ClearableSection = (typeof CLEARABLE_SECTIONS)[number];

/**
 * Argument shape for the `editResume` tool.
 *
 * Every field is optional and every operation is independent, so a single call
 * may combine several of them (e.g. rewrite the summary *and* add a job). The
 * executor applies all operations to one accumulator — see
 * `buildMergedData` in `./merge-resume.ts`.
 */
export const editResumeArgsSchema = z.object({
  setBasics: setBasicsSchema.optional(),

  addWork: z.array(addWorkSchema).optional(),
  updateWork: z.array(updateWorkSchema).optional(),
  removeWork: z.array(removeWorkSchema).optional(),

  addEducation: z.array(addEducationSchema).optional(),
  removeEducation: z.array(removeEducationSchema).optional(),

  addSkills: z.array(addSkillsSchema).optional(),
  removeSkills: z.array(removeSkillsSchema).optional(),

  addProject: z.array(addProjectSchema).optional(),
  updateProject: z.array(updateProjectSchema).optional(),
  removeProject: z.array(removeProjectSchema).optional(),

  addCertificates: z.array(addCertificatesSchema).optional(),
  addLanguages: z.array(addLanguagesSchema).optional(),
  addInterests: z.array(addInterestsSchema).optional(),
  addAwards: z.array(addAwardsSchema).optional(),

  /**
   * Empty one or more sections completely. Only use this when the user
   * explicitly asked for something to be removed wholesale.
   */
  clearSection: z.array(z.enum(CLEARABLE_SECTIONS)).optional()
});

export type EditResumeArgs = z.infer<typeof editResumeArgsSchema>;

/**
 * Argument shape for the `switchTemplate` tool.
 */
export const switchTemplateArgsSchema = z.object({
  templateId: z.enum(['minimal', 'classic', 'executive', 'creative', 'modern'])
});

export type SwitchTemplateArgs = z.infer<typeof switchTemplateArgsSchema>;

/** Union of all tool argument shapes. */
export type ChatToolArgs = EditResumeArgs | SwitchTemplateArgs;

/** Tool identifiers surfaced to the AI. */
export type ChatToolName = 'editResume' | 'switchTemplate';
