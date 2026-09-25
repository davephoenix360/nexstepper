import { z } from 'zod';

/**
 * Zod schemas for the GDPR Art. 20 data portability export bundle.
 *
 * Two reasons this lives in its own module rather than the
 * `lib/resume-schema/` umbrella:
 *
 *   1. **Stable contract** — the JSON we hand users is what they may
 *      forward to another controller (or save as evidence). The shape
 *      should be additive (new optional fields are fine; renames are
 *      breaking). Pinning it with Zod lets us assert the version in a
 *      test before we ever ship a breaking change.
 *
 *   2. **No reverse-import from `resume-schema`** — the resume schema
 *      evolves with the WYSIWYG editor; the export shape should not
 *      automatically inherit those changes. Keep them decoupled.
 *
 * Excluded fields (documented in `_notes` of every export bundle):
 *
 *   - `stripe_events_processed` — append-only idempotency log, retained
 *     on a "legal obligation" basis under GDPR Art. 17(3)(b).
 *   - Better Auth `account.access_token` / `refresh_token` — credentials
 *     belonging to the auth layer, not user content. Revocation via
 *     sign-out is the right channel.
 *   - `session` rows — transient; meaningless after revocation.
 *
 * Schema version is bumped when the SHAPE changes (not when content
 * changes). v1 is the initial shape.
 */
export const EXPORT_SCHEMA_VERSION = '1.0.0';

/**
 * Stripped user profile — never includes `password` (Better Auth hashes
 * them in `account.password`, but we still exclude to be safe) or
 * OAuth tokens.
 */
export const exportUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  emailVerified: z.boolean(),
  createdAt: z.string(), // // ISO-8601 string (JSON has no Date type)
  updatedAt: z.string()
});

/**
 * Subscription mirror — Stripe customer / subscription IDs are kept so
 * the user can see what was on file with Stripe at export time. We do
 * NOT include any Stripe secret / API key / payment-method details.
 */
export const exportSubscriptionSchema = z.object({
  id: z.string(),
  plan: z.string(), // 'free' | 'pro'
  status: z.string(),
  currentPeriodEnd: z.string().nullable(),
  stripeCustomerId: z.string().nullable(),
  stripeSubscriptionId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
});

/**
 * Resume revision — one snapshot of resume content. We include ALL
 * revisions, not just the current, because historical revisions ARE
 * the user's data and portability requires the full picture.
 */
export const exportResumeRevisionSchema = z.object({
  id: z.string(),
  data: z.unknown(), // // `ResumeData` shape (lib/resume-schema) — left as unknown here for decoupling
  createdAt: z.string()
});

/**
 * Resume = the metadata row. Variants are tagged via `kind: 'variant'`
 * and point at their master via `parentResumeId`.
 */
export const exportResumeSchema = z.object({
  id: z.string(),
  kind: z.enum(['master', 'variant']),
  name: z.string(),
  parentResumeId: z.string().nullable(),
  currentRevisionId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  revisions: z.array(exportResumeRevisionSchema)
});

/**
 * Application = a job the user is tracking, with the JD they pasted.
 * One application may have many variants (tailored resumes); the link
 * lives in `resumeVariants` (separate table, not exported here —
 * see _notes).
 */
export const exportApplicationSchema = z.object({
  id: z.string(),
  jobTitle: z.string(),
  company: z.string().nullable(),
  status: z.string(),
  /** Raw JD text the user pasted. Source of truth. */
  jdText: z.string(),
  /** Structured parsed JD (JobPostingData). Nullable: parser runs on demand. */
  jdParsed: z.unknown().nullable(),
  sourceUrl: z.string().nullable(),
  sourceBoard: z.string().nullable(),
  appliedAt: z.string().nullable(),
  notes: z.string(),
  createdAt: z.string(),
  updatedAt: z.string()
});

/**
 * Score snapshot — historical ATS scores over time. Field names match
 * the `score_snapshots` table: `matchScore` (the headline 0–100 number)
 * and `matchBreakdown` (the structured per-dimension breakdown).
 */
export const exportScoreSnapshotSchema = z.object({
  id: z.string(),
  resumeId: z.string(),
  matchScore: z.number(),
  matchBreakdown: z.unknown(),
  dynamicTips: z.unknown(),
  computedInMs: z.number(),
  createdAt: z.string()
});

/**
 * Chat message — `toolCalls` + `toolResult` are JSONB; we preserve them
 * as the user-visible record of their conversation with the AI.
 */
export const exportChatMessageSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  toolCalls: z.array(z.unknown()).nullable(),
  toolResult: z.unknown().nullable(),
  createdAt: z.string()
});

/**
 * Chat session — title + the full message history.
 */
export const exportChatSessionSchema = z.object({
  id: z.string(),
  title: z.string(),
  resumeId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  messages: z.array(exportChatMessageSchema)
});

/**
 * Chat usage — daily token / turn counters. Useful for a user who wants
 * to see "how much did I use the chat this month".
 */
export const exportChatUsageSchema = z.object({
  date: z.string(),
  tokensUsed: z.number(),
  turnsUsed: z.number()
});

/**
 * Share — derived from the `resumes.share_*` columns where
 * `shareEnabled = true`. Including these lets the user revoke any
 * they still care about after export.
 *
 * Note: we deliberately do NOT include the `shareTokenHash` raw value
 * here — even hashed, it could be brute-forced and would let anyone
 * with the export read the public link. Instead we surface a hint
 * (`tokenLastChars`) the user can use to identify the share in their
 * dashboard. Revoking must happen through the UI.
 */
export const exportShareSchema = z.object({
  resumeId: z.string(),
  resumeName: z.string(),
  shareViewCount: z.number(),
  shareLastViewedAt: z.string().nullable(),
  shareCreatedAt: z.string().nullable(),
  /** Last 4 chars of the share token (visible in /r/{token}). For UX. */
  tokenLastChars: z.string().nullable()
});

/**
 * The full export bundle — what the server action returns.
 */
export const exportBundleSchema = z.object({
  /** ISO-8601 timestamp at which this export was generated. */
  exportedAt: z.string(),
  /** Schema version (semver) of the bundle shape. */
  schemaVersion: z.literal(EXPORT_SCHEMA_VERSION),
  /** Plain-language note on what was excluded and why. */
  notes: z.array(z.string()),
  user: exportUserSchema,
  subscriptions: z.array(exportSubscriptionSchema),
  resumes: z.array(exportResumeSchema),
  applications: z.array(exportApplicationSchema),
  scoreSnapshots: z.array(exportScoreSnapshotSchema),
  chatSessions: z.array(exportChatSessionSchema),
  chatUsage: z.array(exportChatUsageSchema),
  shares: z.array(exportShareSchema)
});

export type ExportBundle = z.infer<typeof exportBundleSchema>;
export type ExportUser = z.infer<typeof exportUserSchema>;
export type ExportResume = z.infer<typeof exportResumeSchema>;
export type ExportChatSession = z.infer<typeof exportChatSessionSchema>;

/**
 * The standard `_notes` array included with every export bundle.
 * Update this when fields are added/removed so a user inspecting the
 * JSON can see exactly what's NOT in there and why.
 */
export const STANDARD_EXPORT_NOTES = [
  'Generated by Nexstepper for the user named in `user.id`. This bundle is a self-contained snapshot of every Nexstepper-owned record associated with that user at `exportedAt`.',
  'Excluded: `stripe_events_processed` — internal idempotency log for Stripe webhook delivery, retained on a legal-obligation basis (GDPR Art. 17(3)(b)).',
  'Excluded: Better Auth `account.access_token` / `refresh_token` — OAuth credentials. These are revoked through sign-out, not export.',
  'Excluded: ephemeral `session` rows — meaningless after revocation.',
  'Excluded: `resume_variants` join rows — the tailored-resume data itself is included under `resumes[*].revisions`; the join row contains only the variant-to-application pointer, derivable from `resumes[*].parentResumeId` + the matching application.',
  'Format: JSON. This bundle satisfies the right to data portability under GDPR Article 20 (structured, commonly used, machine-readable).'
] as const;