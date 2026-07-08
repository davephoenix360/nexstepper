import { z } from 'zod';

import { optionalFlexibleUrl } from '../url';

/**
 * Volunteer schema (JSON Resume v1.0.0 `volunteer`).
 * Unpaid work — board roles, pro-bono, community organizing.
 */

export const volunteerEntrySchema = z.object({
  organization: z.string().default(''),
  position: z.string().default(''),
  url: optionalFlexibleUrl,
  startDate: z.string().default(''),
  endDate: z.string().default(''),
  summary: z.string().default(''),
  highlights: z.array(z.string()).default([])
});

export const volunteerSchema = z.array(volunteerEntrySchema).default([]);

export type VolunteerEntry = z.infer<typeof volunteerEntrySchema>;