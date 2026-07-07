import { z } from 'zod';

/**
 * Job-posting schema — the structured representation of a job description
 * attached to a resume (variant tailoring, ATS scoring, AI Optimize).
 *
 * Used from Phase 3 onward. Defined now so the resume envelope can carry it.
 */
export const jobPostingSchema = z.object({
  id: z.string(), // server-assigned UUID
  url: z.url().optional(), // original posting URL, if the user pasted one
  title: z.string().default(''),
  company: z.string().default(''),
  location: z.string().default(''),
  // Free-form parsed sections from the LLM
  description: z.string().default(''), // full JD text
  requirements: z.array(z.string()).default([]), // bullet list
  niceToHaves: z.array(z.string()).default([]),
  benefits: z.array(z.string()).default([]),
  // LLM-extracted keywords used by scoring
  keywords: z.array(z.string()).default([]),
  seniority: z.string().default(''), // "Junior" | "Mid" | "Senior" | "Staff" | etc.
  employmentType: z.string().default(''), // "Full-time" | "Contract" | etc.
  // Capture metadata
  source: z.enum(['paste', 'url', 'extension']).default('paste'),
  capturedAt: z.iso.datetime().optional()
});

export type JobPosting = z.infer<typeof jobPostingSchema>;