import { z } from 'zod';

/**
 * References schema (JSON Resume v1.0.0 `references`).
 * Note: most modern resumes omit this section — included for completeness
 * with the JSON Resume spec.
 */

export const referenceEntrySchema = z.object({
  name: z.string().default(''),
  reference: z.string().default('') // the reference text / quote
});

export const referencesSchema = z.array(referenceEntrySchema).default([]);

export type ReferenceEntry = z.infer<typeof referenceEntrySchema>;