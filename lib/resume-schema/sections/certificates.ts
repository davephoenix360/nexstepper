import { z } from 'zod';

import { optionalFlexibleUrl } from '../url';

/**
 * Certificates schema (JSON Resume v1.0.0 `certificates`).
 */

export const certificateEntrySchema = z.object({
  name: z.string().default(''),
  date: z.string().default(''),
  issuer: z.string().default(''),
  url: optionalFlexibleUrl
});

export const certificatesSchema = z.array(certificateEntrySchema).default([]);

export type CertificateEntry = z.infer<typeof certificateEntrySchema>;