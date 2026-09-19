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
  capturedAt: z.iso.datetime().optional(),
  /**
   * AI-formatted Markdown rendering of the raw JD, populated once by
   * `formatJdAsMarkdown` (see `lib/jd-parser/format-jd-as-markdown.ts`)
   * so the variant editor's right-rail `<JdPanel>` can render headings,
   * lists, and code blocks without round-tripping through the Gateway
   * on every open. Optional — null means the AI call was skipped
   * (no API key), failed, or hasn't run yet (legacy data).
   *
   * Faithful to the source: the formatter adds structure, never content.
   * Safe to render with `react-markdown` (default `rehype-sanitize`).
   *
   * Plan: docs/plans/jd-markdown-format.md
   */
  markdown: z.string().nullable().optional(),
  /**
   * ISO 8601 timestamp of when `markdown` was generated. Lets us
   * show a "Re-formatted 2 minutes ago" hint in the UI and decide
   * whether a future "Re-format" button should re-run the AI. The
   * formatter call is cheap, but we'd rather not regenerate on every
   * editor open. Null when `markdown` is null.
   */
  markdownGeneratedAt: z.iso.datetime().nullable().optional()
});

export type JobPosting = z.infer<typeof jobPostingSchema>;