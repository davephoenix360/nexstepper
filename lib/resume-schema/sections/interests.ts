import { z } from 'zod';

/**
 * Interests schema (JSON Resume v1.0.0 `interests`).
 */

export const interestEntrySchema = z.object({
  name: z.string(), // e.g. "Open Source", "Climbing"
  keywords: z.array(z.string()).default([])
});

export const interestsSchema = z.array(interestEntrySchema).default([]);

export type InterestEntry = z.infer<typeof interestEntrySchema>;