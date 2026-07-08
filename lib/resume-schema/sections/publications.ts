import { z } from 'zod';

import { optionalFlexibleUrl } from '../url';

/**
 * Publications schema (JSON Resume v1.0.0 `publications`).
 * Papers, blog posts, talks.
 */

export const publicationEntrySchema = z.object({
  name: z.string().default(''),
  publisher: z.string().default(''),
  releaseDate: z.string().default(''),
  url: optionalFlexibleUrl,
  summary: z.string().default('')
});

export const publicationsSchema = z.array(publicationEntrySchema).default([]);

export type PublicationEntry = z.infer<typeof publicationEntrySchema>;