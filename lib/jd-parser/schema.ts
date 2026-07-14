import { z } from 'zod';

/**
 * The structured shape of a parsed job description.
 *
 * Built once by `parseJd()` (which calls Claude with `output: 'structured'`
 * bound to this schema), then stored on the Application row in the
 * `jd_parsed` JSONB column. Re-validated on every read (defense in depth —
 * a prior schema version may have stored a different shape).
 *
 * Design goals:
 *  - Optimizer-friendly: requiredSkills / niceToHaveSkills / keywords
 *    are flat string arrays so the diff engine can do simple set ops.
 *  - ATS-friendly: keywords is the de-duplicated union of the above +
 *    role-specific jargon from the responsibilities, used for keyword
 *    scoring in Optimize's match breakdown.
 *  - Human-readable: jobTitle / company / summary give the UI something
 *    nice to show in the application list view without rendering the
 *    raw JD text.
 *  - Loose where we don't know: seniority / remote / employmentType
 *    default to 'unknown' so a bad parse doesn't lose the row.
 *
 * Skill / keyword entries are stored as the AI emits them — we trim +
 * dedupe but don't normalize ("React.js" and "React" stay separate
 * because they ARE separate tokens in the JD world).
 */

// --- Enums (loose; we accept any string the model returns for resilience) ---

export const senioritySchema = z.enum([
  'intern',
  'junior',
  'mid',
  'senior',
  'staff',
  'principal',
  'manager',
  'director',
  'vp',
  'unknown'
]);

export const remotePolicySchema = z.enum([
  'remote',
  'hybrid',
  'onsite',
  'unknown'
]);

export const employmentTypeSchema = z.enum([
  'full_time',
  'part_time',
  'contract',
  'internship',
  'unknown'
]);

// --- Leaf schemas ---

/** A single skill or requirement (free-text). */
const skillSchema = z.string().trim().min(1).max(120);

/** A single keyword for ATS-style matching (free-text, may include jargon). */
const keywordSchema = z.string().trim().min(1).max(120);

/** A single responsibility or qualification (a sentence or short bullet). */
const sentenceSchema = z.string().trim().min(1).max(500);

// --- The top-level parsed JD shape ---

export const parsedJdSchema = z.object({
  /** Job title as the company wrote it. */
  jobTitle: z.string().trim().min(1).max(200),
  /** Company name. Null when the JD doesn't surface one. */
  company: z.string().trim().min(1).max(200).nullable(),
  /** Seniority bucket. */
  seniority: senioritySchema,
  /** Free-form location (e.g. "San Francisco, CA"). Null if not stated. */
  location: z.string().trim().min(1).max(200).nullable(),
  /** Remote / hybrid / onsite. */
  remote: remotePolicySchema,
  /** Salary floor. Null if the JD doesn't disclose. */
  salaryMin: z.number().int().nonnegative().nullable(),
  /** Salary ceiling. Null if the JD doesn't disclose. */
  salaryMax: z.number().int().nonnegative().nullable(),
  /** ISO 4217 currency code. Null when there's no salary band. */
  salaryCurrency: z
    .string()
    .trim()
    .length(3)
    .toUpperCase()
    .nullable(),
  /** Skills the JD says you MUST have. */
  requiredSkills: z.array(skillSchema).max(50).default([]),
  /** Skills the JD says are nice to have. */
  niceToHaveSkills: z.array(skillSchema).max(50).default([]),
  /**
   * De-duplicated union of requiredSkills + niceToHaveSkills + role-specific
   * jargon from the responsibilities, used for keyword scoring in Optimize.
   */
  keywords: z.array(keywordSchema).max(80).default([]),
  /** Role responsibilities, one per entry. */
  responsibilities: z.array(sentenceSchema).max(30).default([]),
  /** Required qualifications, one per entry. */
  qualifications: z.array(sentenceSchema).max(30).default([]),
  /** Minimum years of experience. Null if not stated. */
  yearsExperienceMin: z.number().int().nonnegative().nullable(),
  /** Employment type. */
  employmentType: employmentTypeSchema,
  /** AI summary, 1-2 sentences. The application list view shows this. */
  summary: z.string().trim().min(1).max(500)
});

export type ParsedJd = z.infer<typeof parsedJdSchema>;

// --- Source-board enum (separate from the parsed shape) ---

/**
 * Where the JD came from. Stored as a free-text column on the Application;
 * we validate it on write but the set is small enough to enumerate here.
 */
export const SOURCE_BOARDS = [
  'linkedin',
  'indeed',
  'glassdoor',
  'greenhouse',
  'lever',
  'workday',
  'ashby',
  'smartrecruiters',
  'angelco',
  'ycombinator',
  'remoteok',
  'weworkremotely',
  'manual',
  'extension',
  'other'
] as const;

export const sourceBoardSchema = z.enum(SOURCE_BOARDS);
export type SourceBoard = z.infer<typeof sourceBoardSchema>;

// --- Application status enum (lifecycle) ---

/**
 * Application lifecycle. Free-text in the DB (cheaper to evolve than
 * shipping a migration per state), but validated at the write boundary.
 */
export const APPLICATION_STATUSES = [
  'draft',
  'applied',
  'screening',
  'interviewing',
  'offer',
  'rejected',
  'withdrawn',
  'accepted'
] as const;

export const applicationStatusSchema = z.enum(APPLICATION_STATUSES);
export type ApplicationStatus = z.infer<typeof applicationStatusSchema>;

/**
 * The full input shape for creating an Application. Server Action
 * validates this with `safeParse` (see applications/actions.ts).
 */
export const createApplicationInputSchema = z.object({
  jobTitle: z.string().trim().min(1).max(200),
  company: z.string().trim().max(200).optional(),
  jdText: z.string().trim().min(50).max(50_000),
  sourceUrl: z
    .string()
    .trim()
    .url()
    .max(2_000)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  sourceBoard: sourceBoardSchema.optional(),
  notes: z.string().trim().max(5_000).optional()
});

export type CreateApplicationInput = z.infer<
  typeof createApplicationInputSchema
>;

/**
 * Update shape — same fields, all optional (PATCH semantics). Status has
 * its own field; `appliedAt` is auto-set when status moves to 'applied'
 * unless the caller passes an explicit timestamp.
 */
export const updateApplicationInputSchema = createApplicationInputSchema
  .partial()
  .extend({
    status: applicationStatusSchema.optional(),
    appliedAt: z.coerce.date().optional()
  });

export type UpdateApplicationInput = z.infer<
  typeof updateApplicationInputSchema
>;
