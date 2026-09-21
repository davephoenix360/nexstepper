import {
  pgTable,
  text,
  timestamp,
  boolean,
  jsonb,
  index,
  integer
} from 'drizzle-orm/pg-core';

import type { ResumeData } from '@/lib/resume-schema';

// --- Better Auth core tables (singular, per Better Auth convention) ---

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
});

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at').notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' })
});

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
});

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

/**
 * Idempotency log for Stripe webhook events.
 *
 * Stripe webhooks are at-least-once. The same `customer.subscription.updated`
 * can land multiple times in quick succession and double-update the local
 * row (or double-charge the retry counter, etc.). We dedupe by recording
 * every processed event ID here; the webhook route checks this table
 * before doing any work and writes a row after success.
 *
 * Rows are append-only; we never delete. A periodic cleanup job can
 * prune old rows (e.g. > 30 days) if the table grows. Indexed on
 * event_type for ad-hoc inspection ("how many invoice.* events
 * did we drop today?").
 */
export const stripeEventsProcessed = pgTable(
  'stripe_events_processed',
  {
    /** Stripe event.id (e.g. 'evt_1ABC...'). Primary key — deduplication anchor. */
    eventId: text('event_id').primaryKey(),
    /** Stripe event.type — recorded for debugging + future cleanup jobs. */
    eventType: text('event_type').notNull(),
    /** Server-side timestamp; useful for the periodic prune. */
    processedAt: timestamp('processed_at').notNull().defaultNow()
  },
  (table) => [
    index('stripe_events_processed_type_idx').on(table.eventType)
  ]
);

export type StripeEventProcessed = typeof stripeEventsProcessed.$inferSelect;
export type NewStripeEventProcessed = typeof stripeEventsProcessed.$inferInsert;

// --- Nextep domain tables ---

/**
 * Stripe-synced subscription mirror. One row per user (solo-only v1).
 * `plan` is the canonical plan identifier we use in code: 'free' | 'pro'.
 * `status` mirrors Stripe's subscription.status verbatim.
 */
export const subscriptions = pgTable(
  'subscriptions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' })
      .unique(),
    stripeCustomerId: text('stripe_customer_id').unique(),
    stripeSubscriptionId: text('stripe_subscription_id').unique(),
    stripePriceId: text('stripe_price_id'),
    plan: text('plan').notNull().default('free'), // 'free' | 'pro'
    status: text('status').notNull().default('inactive'), // mirrors Stripe status
    currentPeriodEnd: timestamp('current_period_end'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow()
  },
  (table) => [index('subscriptions_user_idx').on(table.userId)]
);

// --- Inferred types ---

export type User = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;
export type Session = typeof session.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;

/**
 * Plan constants — referenced by code paths that gate features
 * (e.g. chat rate limiting, Optimize tool availability).
 */
export const PLANS = {
  free: {
    id: 'free' as const,
    name: 'Free',
    chatMessagesPerDay: 20,
    canOptimize: false,
    canCollab: false
  },
  pro: {
    id: 'pro' as const,
    name: 'Pro',
    chatMessagesPerDay: Infinity,
    canOptimize: true,
    canCollab: true
  }
} as const;

export type PlanId = keyof typeof PLANS;

// --- Resume domain tables (Phase 1) ---

/**
 * A resume — either a master (the user's "source of truth" resume) or a
 * variant (a tailored derivative, e.g. for a specific job posting).
 *
 * `currentRevisionId` points to the row in `resume_revisions` that should be
 * rendered. Variants point at their master via `parentResumeId`.
 *
 * The full resume content (sections + envelope) lives in `resume_revisions.data`
 * (JSONB). Queryable metadata — id, owner, family, status — stays as columns
 * so we never need to parse JSONB for list views.
 */
export const resumes = pgTable(
  'resumes',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** Display name (shown in lists and PDF headers). */
    name: text('name').notNull(),
    /** Free-form note ("for FAANG", "targeting staff eng roles", etc.). */
    note: text('note').notNull().default(''),
    /** Lifecycle status. 'completed' gates Phase 4 features (AI Optimize etc.). */
    status: text('status').notNull().default('draft'), // 'draft' | 'completed'
    /** Template ID to render with. Phase 1 ships just 'classic'. */
    template: text('template').notNull().default('classic'),
    /** True for the user's master resume; false for a tailored variant. */
    isMaster: boolean('is_master').notNull().default(false),
    /** For variants: points back at the master. Null for masters. */
    parentResumeId: text('parent_resume_id'),
    /** The revision that should be rendered / edited. */
    currentRevisionId: text('current_revision_id'),

    // ─── Public sharing (Phase 2.5) ────────────────────────────────
    /**
     * SHA-256 hex digest of the share token. We never store the raw
     * token — it's sent in the URL, hashed on the way in, and compared
     * to this column. This means a DB leak doesn't leak shareable
     * URLs. Nullable: only set when the owner has enabled sharing.
     */
    shareTokenHash: text('share_token_hash'),
    /** Master switch for public access. False = link returns 404. */
    shareEnabled: boolean('share_enabled').notNull().default(false),
    /** Increments on every successful public render. */
    shareViewCount: integer('share_view_count').notNull().default(0),
    /** Last time someone hit the public route. */
    shareLastViewedAt: timestamp('share_last_viewed_at'),
    /** When sharing was first enabled — for the "shared X days ago" UI. */
    shareCreatedAt: timestamp('share_created_at'),

    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow()
  },
  (table) => [
    index('resumes_user_idx').on(table.userId),
    index('resumes_parent_idx').on(table.parentResumeId),
    // Lookup-by-token: a single btree index on the hash column
    // (B-Tree supports equality, which is all we need).
    index('resumes_share_token_idx').on(table.shareTokenHash)
  ]
);

/**
 * Append-only revision history. Every save inserts a new row; `resumes.currentRevisionId`
 * is bumped to point at the latest. This is the foundation for:
 *   - Undo / restore previous versions
 *   - Phase 5 real-time collab (Yjs operates on top of these snapshots)
 *   - Audit / "who changed what when"
 *
 * The `data` column is JSONB (typed as `ResumeData` so queries get the right
 * shape back). We validate with the Zod `resumeDataSchema` on every write —
 * never trust the JSONB blob to be well-formed at read time either; if it's
 * not, we treat the resume as corrupted and surface a recovery UI.
 */
export const resumeRevisions = pgTable(
  'resume_revisions',
  {
    id: text('id').primaryKey(),
    resumeId: text('resume_id')
      .notNull()
      .references(() => resumes.id, { onDelete: 'cascade' }),
    /** Full `resumeDataSchema` shape. Validated on write. */
    data: jsonb('data').$type<ResumeData>().notNull(),
    /** Optional commit-message-style note ("rewrote work section for Stripe role"). */
    message: text('message'),
    createdAt: timestamp('created_at').notNull().defaultNow()
  },
  (table) => [
    index('resume_revisions_resume_idx').on(table.resumeId, table.createdAt)
  ]
);

// --- Inferred row types ---
export type Resume = typeof resumes.$inferSelect;
export type NewResume = typeof resumes.$inferInsert;
export type ResumeRevision = typeof resumeRevisions.$inferSelect;
export type NewResumeRevision = typeof resumeRevisions.$inferInsert;

// --- Application domain tables (Phase 2.4a) ---

/**
 * Application — one JD the user is (or was) applying to.
 *
 * The raw JD lives in `jdText` (immutable, never edited by the AI — it's the
 * user's source of truth). The structured parsed shape lives in `jdParsed`
 * (jsonb, produced by the JD parser; can be re-parsed on demand).
 *
 * `sourceBoard` is the platform the JD came from ('linkedin', 'greenhouse',
 * 'lever', 'workday', 'ashby', 'manual', 'extension', etc.). The browser
 * extension populates this when it captures a JD from a job board. The
 * `sourceUrl` is the canonical job-posting URL (handy for "open the original
 * posting" + analytics later).
 *
 * `status` is a free-text enum — we don't strictly enforce it at the DB
 * level (cheaper to evolve the lifecycle in code than to ship a migration
 * every time we add a state). The Zod input schema validates it.
 */
export const applications = pgTable(
  'applications',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** Job title (e.g. "Senior Software Engineer"). Required. */
    jobTitle: text('job_title').notNull(),
    /** Company name. Nullable — some JDs don't surface a company. */
    company: text('company'),
    /** The raw JD the user pasted. Never edited; the source of truth. */
    jdText: text('jd_text').notNull(),
    /**
     * The structured Zod-validated parsed shape. Nullable: the parser runs
     * on-demand (during creation) and the row can be re-parsed later if the
     * schema evolves. We re-validate on read (see queries.ts).
     */
    jdParsed: jsonb('jd_parsed').$type<unknown>(),
    /** Where the JD came from (e.g. a LinkedIn job URL). Nullable. */
    sourceUrl: text('source_url'),
    /** Job-board identifier (e.g. 'linkedin', 'greenhouse', 'manual'). */
    sourceBoard: text('source_board'),
    /** Lifecycle. 'draft' (just created) → 'applied' → ... */
    status: text('status').notNull().default('draft'),
    /** When the user marked this application as submitted. Nullable. */
    appliedAt: timestamp('applied_at'),
    /** User notes — phone screen dates, recruiter name, follow-ups, etc. */
    notes: text('notes').notNull().default(''),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow()
  },
  (table) => [
    index('applications_user_created_idx').on(
      table.userId,
      table.createdAt
    ),
    index('applications_user_status_idx').on(table.userId, table.status)
  ]
);

/**
 * Resume variant (Application-tailored) — the join between an Application
 * and the resume row that was tailored for it, plus the match score.
 *
 * The tailored resume data itself lives in `resumes` + `resume_revisions`
 * (a variant is just a regular resume with `isMaster = false` and
 * `parentResumeId` set to the master). This table is the "this resume
 * was tailored for this Application" link + the score.
 *
 * `matchScore` is a 0-100 single number (the headline). `matchBreakdown`
 * is the structured Zod-validated breakdown (skills / experience / keyword
 * subscores) so the UI can show a detail panel.
 */
export const resumeVariants = pgTable(
  'resume_variants',
  {
    id: text('id').primaryKey(),
    applicationId: text('application_id')
      .notNull()
      .references(() => applications.id, { onDelete: 'cascade' }),
    /** The resume row that was tailored (isMaster = false, parentResumeId = master). */
    resumeId: text('resume_id')
      .notNull()
      .references(() => resumes.id, { onDelete: 'cascade' }),
    /** Headline 0-100 match percentage. */
    matchScore: integer('match_score').notNull(),
    /** Structured breakdown: skills / experience / keyword subscores. */
    matchBreakdown: jsonb('match_breakdown').$type<unknown>(),
    /** AI-generated summary of what was changed + why. UI surfaces this. */
    tailoringNotes: text('tailoring_notes').notNull().default(''),
    createdAt: timestamp('created_at').notNull().defaultNow()
  },
  (table) => [
    index('resume_variants_application_idx').on(
      table.applicationId,
      table.createdAt
    ),
    index('resume_variants_resume_idx').on(table.resumeId)
  ]
);

// --- Inferred row types ---
export type Application = typeof applications.$inferSelect;
export type NewApplication = typeof applications.$inferInsert;
export type ResumeVariant = typeof resumeVariants.$inferSelect;
export type NewResumeVariant = typeof resumeVariants.$inferInsert;

/**
 * `score_snapshots` — point-in-time capture of an ATS scoring
 * pass for a single resume variant.
 *
 * One row per `recomputeScoreAction` invocation. The page RSC
 * reads the LATEST snapshot for the resume and uses it to:
 *
 *   1. Hydrate the scorecard's `initialMatchBreakdown` so the
 *      inline-issue surface knows the right per-leaf paths
 *      without re-deriving them from a heuristic on every click.
 *   2. (Future) Track score trajectory across edits — "you
 *      went from 72 → 78 after rewriting the Stripe bullet".
 *
 * The table is intentionally narrow. It does NOT duplicate the
 * full `ScoreBreakdown` (which is deterministically
 * recomputable from `resumes.revisions.data + jobContext`); it
 * only persists what the score pass PRODUCED that the next page
 * load needs to surface WITHOUT recomputing — primarily the
 * MatchBreakdown, plus the headline score + tips so the
 * scorecard can short-circuit the recompute on cold loads.
 *
 * Drift: this table was added in `feat/inline-issue-surface`
 * (commit a7e9c91-era) when the MatchBreakdown writer was
 * promoted from a returned-only value to a persisted snapshot.
 * See `docs/drift/2026-09-21-inline-issue-surface-shipped.md`
 * §"MatchBreakdown writer is not wired" (action item closed).
 */
export const scoreSnapshots = pgTable(
  'score_snapshots',
  {
    id: text('id').primaryKey(),
    resumeId: text('resume_id')
      .notNull()
      .references(() => resumes.id, { onDelete: 'cascade' }),
    /** Headline 0-100 match percentage at this snapshot. */
    matchScore: integer('match_score').notNull(),
    /**
     * Per-leaf MatchBreakdown JSONB the inline-issue surface
     * reads to anchor its popovers. Shape pinned at
     * `lib/db/queries.ts > MatchBreakdown`.
     */
    matchBreakdown: jsonb('match_breakdown').$type<unknown>(),
    /**
     * Dynamic improvement tips computed in the same pass as
     * `matchScore`. Server-rendered map (Partial<Record<key,
     * ReactNode>) used by `<DynamicTipInline />`. Stored as
     * `unknown` JSONB because the ReactNode shape serializes
     * cleanly but isn't a value type we want to model in SQL.
     */
    dynamicTips: jsonb('dynamic_tips').$type<unknown>(),
    /** Engine latency in milliseconds — for the "Computed in X ms" footer. */
    computedInMs: integer('computed_in_ms').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow()
  },
  (table) => [
    // "Latest snapshot per resume" lookups — used by the page
    // RSC on every cold load. DESC match supports
    // `ORDER BY created_at DESC LIMIT 1` without a sort step.
    index('score_snapshots_resume_created_idx').on(
      table.resumeId,
      table.createdAt.desc()
    )
  ]
);

export type ScoreSnapshot = typeof scoreSnapshots.$inferSelect;
export type NewScoreSnapshot = typeof scoreSnapshots.$inferInsert;