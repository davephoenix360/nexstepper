import { z } from 'zod';

/**
 * Languages schema (JSON Resume v1.0.0 `languages`).
 */

export const languageEntrySchema = z.object({
  language: z.string(), // e.g. "English", "Spanish"
  fluency: z.string().default('') // e.g. "Native", "Fluent", "Conversational"
});

export const languagesSchema = z.array(languageEntrySchema).default([]);

export type LanguageEntry = z.infer<typeof languageEntrySchema>;