import { z } from 'zod';

/**
 * Skills schema (JSON Resume v1.0.0 `skills`).
 * Each skill is a named category with keywords underneath (e.g. skill="Backend",
 * keywords=["Python", "Postgres"]).
 */

export const skillEntrySchema = z.object({
  name: z.string(), // category name, e.g. "Backend", "Languages"
  level: z.string().default(''), // optional: "Beginner" / "Intermediate" / "Master"
  keywords: z.array(z.string()).default([])
});

export const skillsSchema = z.array(skillEntrySchema).default([]);

export type SkillEntry = z.infer<typeof skillEntrySchema>;