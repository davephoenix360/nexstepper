import { z } from 'zod';

/**
 * Projects schema (JSON Resume v1.0.0 `projects`).
 * Side / open-source / portfolio work, separate from employment history.
 */

export const projectEntrySchema = z.object({
  name: z.string().default(''),
  description: z.string().default(''),
  highlights: z.array(z.string()).default([]),
  keywords: z.array(z.string()).default([]), // tech stack, e.g. ["React", "TypeScript"]
  startDate: z.string().default(''),
  endDate: z.string().default(''), // empty = ongoing
  url: z.url().or(z.literal('')).default(''),
  roles: z.array(z.string()).default([]) // e.g. ["Tech Lead", "Solo Developer"]
});

export const projectsSchema = z.array(projectEntrySchema).default([]);

export type ProjectEntry = z.infer<typeof projectEntrySchema>;