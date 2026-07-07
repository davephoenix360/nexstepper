import { z } from 'zod';

/**
 * Awards schema (JSON Resume v1.0.0 `awards`).
 */

export const awardEntrySchema = z.object({
  title: z.string().default(''),
  date: z.string().default(''),
  awarder: z.string().default(''), // who gave the award
  summary: z.string().default('')
});

export const awardsSchema = z.array(awardEntrySchema).default([]);

export type AwardEntry = z.infer<typeof awardEntrySchema>;