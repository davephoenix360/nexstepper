/**
 * PostHog product-analytics event catalog.
 *
 * Single source of truth for every business event we fire. Adding a new
 * event means:
 *   1. Add the constant below.
 *   2. Fire it via `trackServer(distinctId, PostHogEvents.X, props)` in
 *      the relevant action / route.
 *   3. (Optional) Add a Zod-validated `XProps` shape if the event has
 *      non-trivial properties you want to keep typed.
 *
 * Why centralize instead of inlining string literals: PostHog's event
 * names become the contract for downstream dashboards, funnels, and
 * alerts. Renaming an event later is a breaking change (you have to
 * migrate historical dashboards). Catching typos at the call site is
 * cheap if every event is a named constant.
 *
 * Naming convention: snake_case verb_noun[_modifier]. Avoid $ prefixes
 * (those are reserved by PostHog for system events like $pageview,
 * $identify, $delete_user — we have $delete_user already via
 * `lib/data-rights/posthog-user-delete.ts`).
 */

export const PostHogEvents = {
  // ── Resume + variant lifecycle ──────────────────────────────────────────
  RESUME_CREATED: 'resume_created',
  RESUME_IMPORTED: 'resume_imported',
  RESUME_UPDATED: 'resume_updated',
  RESUME_RENAMED: 'resume_renamed',
  VARIANT_CREATED: 'variant_created',
  VARIANT_CREATED_FROM_JD: 'variant_created_from_jd',

  // ── Scoring + AI features ───────────────────────────────────────────────
  SCORE_COMPUTED: 'score_computed',
  CHAT_MESSAGE_SENT: 'chat_message_sent',
  BULLET_ENRICHED: 'bullet_enriched',
  JD_PARSED: 'jd_parsed',
  APPLICATION_CREATED: 'application_created',
  APPLICATION_PARSE_FAILED: 'application_parse_failed',

  // ── Sharing ─────────────────────────────────────────────────────────────
  SHARE_LINK_CREATED: 'share_link_created',
  SHARE_LINK_VIEWED: 'share_link_viewed',
  SHARE_LINK_ROTATED: 'share_link_rotated',
  SHARE_LINK_DISABLED: 'share_link_disabled',

  // ── Subscription ────────────────────────────────────────────────────────
  SUBSCRIPTION_UPGRADED: 'subscription_upgraded',
  SUBSCRIPTION_DOWNGRADED: 'subscription_downgraded',
  SUBSCRIPTION_CANCELED: 'subscription_canceled',

  // ── Data rights + account ───────────────────────────────────────────────
  EXPORT_DATA: 'export_data',
  DELETE_ACCOUNT: 'delete_account',
  ACCOUNT_SIGNED_IN: 'account_signed_in'
} as const;

export type PostHogEventName =
  (typeof PostHogEvents)[keyof typeof PostHogEvents];

/**
 * Discriminated property shapes per event. These aren't enforced at
 * runtime (PostHog's API is loose — it accepts arbitrary property bags),
 * but the types document the expected shape and let `trackServer`
 * callers get autocomplete on the right keys.
 *
 * Add a new entry only when the property bag has 2+ non-trivial fields;
 * a one-property event can use `Record<string, unknown>` at the call
 * site.
 */
export type EventPropsByName = {
  [PostHogEvents.RESUME_CREATED]: {
    resumeId: string;
    /** true = master, false = variant (though usually we expect master here) */
    isMaster: boolean;
  };
  [PostHogEvents.RESUME_IMPORTED]: {
    resumeId: string;
    source: 'pdf' | 'docx' | 'text';
    pageCount?: number;
  };
  [PostHogEvents.RESUME_UPDATED]: {
    resumeId: string;
    revisionId: string;
  };
  [PostHogEvents.RESUME_RENAMED]: {
    resumeId: string;
  };
  [PostHogEvents.VARIANT_CREATED]: {
    resumeId: string;
    masterId: string;
  };
  [PostHogEvents.VARIANT_CREATED_FROM_JD]: {
    resumeId: string;
    masterId: string;
    jdLength: number;
  };
  [PostHogEvents.SCORE_COMPUTED]: {
    resumeId: string;
    overallScore: number;
    computedInMs: number;
  };
  [PostHogEvents.CHAT_MESSAGE_SENT]: {
    sessionId: string;
    resumeId: string;
    isNewSession: boolean;
  };
  [PostHogEvents.BULLET_ENRICHED]: {
    resumeId: string;
    modelUsed: string;
  };
  [PostHogEvents.JD_PARSED]: {
    applicationId: string;
    jdLength: number;
    inputTokens: number;
    outputTokens: number;
  };
  [PostHogEvents.APPLICATION_CREATED]: {
    applicationId: string;
    sourceBoard: string;
    jdLength: number;
  };
  [PostHogEvents.APPLICATION_PARSE_FAILED]: {
    errorCode: string;
    jdLength: number;
  };
  [PostHogEvents.SHARE_LINK_CREATED]: {
    resumeId: string;
  };
  [PostHogEvents.SHARE_LINK_VIEWED]: {
    /** Resolved resume id of the owner (not the viewer's — there is no viewer). */
    ownerResumeId: string;
  };
  [PostHogEvents.SHARE_LINK_ROTATED]: {
    resumeId: string;
  };
  [PostHogEvents.SHARE_LINK_DISABLED]: {
    resumeId: string;
  };
  [PostHogEvents.SUBSCRIPTION_UPGRADED]: {
    fromPlan: 'free' | 'pro';
    toPlan: 'free' | 'pro';
    stripePriceId: string;
  };
  [PostHogEvents.SUBSCRIPTION_DOWNGRADED]: {
    fromPlan: 'free' | 'pro';
    toPlan: 'free' | 'pro';
  };
  [PostHogEvents.SUBSCRIPTION_CANCELED]: {
    plan: 'free' | 'pro';
  };
  [PostHogEvents.EXPORT_DATA]: {
    /** ISO date for the export run. */
    exportedAt: string;
  };
  [PostHogEvents.DELETE_ACCOUNT]: {
    /** ISO timestamp the purge started. */
    erasedAt?: string;
  };
  [PostHogEvents.ACCOUNT_SIGNED_IN]: {
    /** No-op placeholder — useful as a "user just hit the app" signal. */
    freshSignIn: boolean;
  };
};
