import { z } from 'zod';

/**
 * Job-posting schema — the structured representation of a job description
 * attached to a resume (variant tailoring, ATS scoring, AI Optimize).
 *
 * Used from Phase 3 onward. Defined now so the resume envelope can carry it.
 *
 * ## v2 intent-extraction fields (added 2026-09-19)
 *
 * The bottom of the schema (marked `v2 intent extraction`) carries structured
 * signals extracted by `extractJdIntent` (lib/jd-parser/extract-jd-intent.ts).
 * These are:
 *   - **mustHaveSkills / niceToHaveSkills / implicitSkills** — priority-weighted
 *     skill lists. The Phase 1 Intent Coverage dimension scores the resume
 *     against these lists with a 3×/1×/0.5× weight ratio.
 *   - **seniorityLevel / yearsRequiredMin / yearsRequiredMax** — drives the
 *     Phase 2 Seniority Fit dimension (asymmetric penalty: under-qualified
 *     costs 3× more than over-qualified does).
 *   - **roleFamily / domainSignals** — drives the Phase 2 Role Fit dimension
 *     alongside JobBERT title similarity.
 *
 * All v2 fields are nullable / default-empty so legacy JDs (extracted before
 * the v2 extractor shipped) load fine. The pattern mirrors the `markdown` /
 * `markdownGeneratedAt` fields that Plan B (docs/plans/jd-markdown-format.md)
 * added earlier.
 *
 * Plan: docs/plans/ats-scoring-v2.md
 */
export const seniorityLevelSchema = z.enum([
  'intern',
  'junior',
  'mid',
  'senior',
  'staff',
  'principal',
  'manager',
  'director',
  'vp'
]);

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
  seniority: z.string().default(''), // legacy free-form bucket (kept for backward compat — see v2 fields below)
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
  markdownGeneratedAt: z.iso.datetime().nullable().optional(),

  // ---------------------------------------------------------------------
  // v2 intent-extraction fields. Added 2026-09-19. All optional with a
  // default — callers don't need to specify them, and legacy rows load
  // fine. We use `.optional().default(...)` (not just `.default(...)`)
  // so the inferred TypeScript type marks these as optional — existing
  // callers that construct `JobPosting` literals (test fixtures, etc.)
  // don't have to enumerate every new field. Populated by
  // `extractJdIntent()` (lib/jd-parser/extract-jd-intent.ts) which runs
  // through the AI Gateway with a Zod-structured output. See
  // docs/plans/ats-scoring-v2.md.
  // ---------------------------------------------------------------------

  /**
   * Skills the JD explicitly says are required (e.g. "must have",
   * "required", appears in a "Requirements" / "Qualifications" section).
   * Drives Phase 1 Intent Coverage with a 3× weight vs. nice-to-have.
   * Empty array means the extractor hasn't run, OR the JD doesn't
   * separate must-have from nice-to-have.
   */
  mustHaveSkills: z
    .array(z.string().min(1).max(120))
    .max(50)
    .optional()
    .default([]),
  /**
   * Skills the JD explicitly marks as bonus ("nice to have", "plus",
   * "bonus", appears in a "Nice to have" / "Preferred" section).
   * Drives Phase 1 Intent Coverage with a 1× weight.
   */
  niceToHaveSkills: z
    .array(z.string().min(1).max(120))
    .max(50)
    .optional()
    .default([]),
  /**
   * Skills the JD doesn't name directly but that experienced
   * recruiters would infer (e.g. "Kubernetes" implies "Docker/containers";
   * "distributed systems" implies "consensus algorithms"). Drives
   * Phase 1 Intent Coverage with a 0.5× weight. Empty unless the
   * extractor has run AND the JD has clear implicit-skill signals.
   */
  implicitSkills: z
    .array(z.string().min(1).max(120))
    .max(50)
    .optional()
    .default([]),
  /**
   * Structured seniority bucket. Distinct from the legacy free-form
   * `seniority` field above (kept for backward compat with rows parsed
   * before v2). `seniorityLevel` is the source of truth for new scoring
   * work. Null when the JD doesn't disclose or the extractor hasn't run.
   */
  seniorityLevel: seniorityLevelSchema.nullable().optional().default(null),
  /**
   * Minimum years of experience the JD asks for. Null when the JD
   * doesn't quantify, or when the extractor hasn't run. Drives the
   * Phase 2 Seniority Fit dimension (asymmetric penalty).
   */
  yearsRequiredMin: z.number().int().nonnegative().nullable().optional().default(null),
  /**
   * Maximum years the JD asks for (rare — most JDs say "5+" not "5-7").
   * Null when not stated.
   */
  yearsRequiredMax: z.number().int().nonnegative().nullable().optional().default(null),
  /**
   * Role family inferred from the JD title + responsibilities (e.g.
   * "Backend Engineer", "Data Scientist", "Product Manager"). Used
   * by the Phase 2 Role Fit dimension as a fallback when JobBERT-V3
   * title similarity is unavailable. Null when the extractor hasn't
   * run or the JD doesn't fit a clean role family.
   */
  roleFamily: z.string().min(1).max(120).nullable().optional().default(null),
  /**
   * Industry / domain signals (e.g. ["fintech", "healthcare"]). Drives
   * a future domain-fit dimension. Empty for now (Phase 2 candidate).
   */
  domainSignals: z
    .array(z.string().min(1).max(60))
    .max(20)
    .optional()
    .default([]),
  /**
   * ISO 8601 timestamp of when the v2 intent extractor ran. Same
   * cache-busting pattern as `markdownGeneratedAt`. Undefined when the
   * extractor hasn't run (legacy rows + JDs below the min-length
   * threshold).
   */
  intentExtractedAt: z.iso.datetime().nullable().optional(),
  /**
   * Model ID used by the v2 intent extractor (e.g. "mistral/mistral-nemo").
   * Stored for cost attribution + reproducibility. Undefined when the
   * extractor hasn't run.
   */
  intentExtractorModel: z.string().nullable().optional()
});

export type JobPosting = z.infer<typeof jobPostingSchema>;
export type SeniorityLevel = z.infer<typeof seniorityLevelSchema>;
