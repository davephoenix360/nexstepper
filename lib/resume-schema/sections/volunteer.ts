import { z } from 'zod';

/**
 * Volunteer schema (JSON Resume v1.0.0 `volunteer`).
 * Unpaid work — board roles, pro-bono, community organizing.
 */

export const volunteerEntrySchema = z.object({
  organization: z.string().default(''),
  position: z.string().default(''),
  url: z.url().or(z.literal('')).default(''),
  startDate: z.string().default(''),
  endDate: z.string().default(''),
  summary: z.string().default(''),
  highlights: z.array(z.string()).default([])
});

export const volunteerSchema = z.array(volunteerEntrySchema).default([]);

export type VolunteerEntry = z.infer<typeof volunteerEntrySchema>;