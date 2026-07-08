import { z } from 'zod';

import { optionalFlexibleUrl } from '../url';

/**
 * Work-experience schema (JSON Resume v1.0.0 `work`).
 * One entry per company; each company has one or more `positions` (used when
 * the user changed roles at the same company without leaving).
 */

export const positionSchema = z.object({
  title: z.string().default(''),
  // ISO 8601 partial dates are allowed: "2020-01", "2020", "2020-01-15".
  startDate: z.string().default(''),
  endDate: z.string().default(''), // empty string = current
  highlights: z.array(z.string()).default([])
});

export const workEntrySchema = z.object({
  company: z.string().default(''),
  location: z.string().default(''),
  url: optionalFlexibleUrl,
  description: z.string().default(''), // company-level summary
  positions: z.array(positionSchema).default([])
});

export const workSchema = z.array(workEntrySchema).default([]);

export type Position = z.infer<typeof positionSchema>;
export type WorkEntry = z.infer<typeof workEntrySchema>;