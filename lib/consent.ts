/**
 * Cookie consent core (added 2026-10-08).
 *
 * Pure, framework-free logic. The React layer (`components/consent/`)
 * only renders this; everything testable lives here so it can be
 * asserted without a DOM.
 *
 * ## What actually needs consent
 *
 * ePrivacy Art. 5(3) / UK PECR reg. 6 exempt cookies that are
 * strictly necessary to deliver a service the user explicitly
 * requested. Everything else needs **prior** consent.
 *
 * In Nexstepper that splits cleanly:
 *
 * | Category            | Cookie / storage                        | Consent? |
 * |---------------------|-----------------------------------------|---------|
 * | `essential`         | `nexstepper.session_token` (Better Auth)| No — exempt |
 * | `analytics`         | PostHog distinct-id                    | **Yes**  |
 * | `errorTracking`     | Sentry (no cookies by default here)     | **Yes**  |
 * | `marketing`         | nothing set today                       | **Yes** (accepted if ever added) |
 *
 * The session cookie is exempt. PostHog analytics is not, which is
 * why `instrumentation-client.ts` refuses to initialise PostHog
 * until consent is recorded — the banner is the visible half of this
 * module, the gate is the part that creates compliance.
 *
 * ## Storage choice
 *
 * Consent is stored in **`localStorage`**, deliberately, *not* in a
 * cookie. A consent cookie would itself be a non-essential cookie
 * being set before the user could consent — an own-goal. Storing the
 * decision in localStorage keeps the "before consent" cookie footprint
 * at exactly zero non-essential cookies.
 *
 * ## Versioning
 *
 * `CONSENT_VERSION` is bumped whenever the category set changes, which
 * invalidates old decisions and re-prompts. Without this, adding a new
 * category would silently inherit an old "accept all" — the exact
 * failure GDPR Art. 6(4) cares about.
 */

/** Current consent-record format. Bump when categories change. */
export const CONSENT_VERSION = 1;

/** Categories a visitor can control. */
export type ConsentCategory = 'essential' | 'analytics' | 'errorTracking' | 'marketing';

export const CONSENT_CATEGORIES: readonly ConsentCategory[] = [
  'essential',
  'analytics',
  'errorTracking',
  'marketing'
] as const;

/**
 * Categories exempt from consent under ePrivacy Art. 5(3) because the
 * service cannot function without them. Always `true`, and the UI
 * renders them as locked rather than as a toggle.
 */
export const ESSENTIAL_CATEGORIES: readonly ConsentCategory[] = ['essential'] as const;

/** Human-facing labels + why we set them. Rendered in the banner. */
export const CONSENT_CATEGORY_COPY: Record<
  ConsentCategory,
  { label: string; description: string }
> = {
  essential: {
    label: 'Strictly necessary',
    description:
      'Session cookie that keeps you signed in. Required for the site to work, so it is exempt from consent under ePrivacy.'
  },
  analytics: {
    label: 'Analytics',
    description:
      'PostHog, to understand which features get used. Anonymous by default — person profiles are only built for signed-in users. Not set until you allow it.'
  },
  errorTracking: {
    label: 'Error monitoring',
    description:
      'Sentry, so we can find out when a page breaks instead of guessing from support emails. Sets no cookies.'
  },
  marketing: {
    label: 'Marketing',
    description:
      'No marketing or advertising cookies are set today. This category exists so that adding one later cannot silently bypass your choice.'
  }
};

/** The stored decision. Every category is explicit — never `undefined`. */
export type ConsentState = Record<ConsentCategory, boolean>;

export const CONSENT_STORAGE_KEY = 'nexstepper.consent';

/** Nothing has been decided yet — the banner must show. */
export type ConsentRecord = {
  version: number;
  categories: ConsentState;
  /** ISO timestamp of the decision. */
  decidedAt: string;
};

export const DEFAULT_CONSENT_STATE: ConsentState = {
  essential: true,
  analytics: false,
  errorTracking: false,
  marketing: false
};

/** State used before a decision: essential on, everything else off. */
export const PENDING_CONSENT_STATE: ConsentState = {
  essential: true,
  analytics: false,
  errorTracking: false,
  marketing: false
};

/** "Accept all" — what the green button applies. */
export function allGranted(): ConsentState {
  return {
    essential: true,
    analytics: true,
    errorTracking: true,
    marketing: true
  };
}

/** "Essential only" — what the decline button applies. */
export function essentialOnly(): ConsentState {
  return { ...DEFAULT_CONSENT_STATE, essential: true };
}

/**
 * Forces `essential` to `true` in any state. Consent can be withdrawn
 * from optional categories, but the service cannot be handed out
 * without the session cookie — so this invariant guards every write.
 */
export function enforceEssential(state: Partial<ConsentState>): ConsentState {
  return {
    essential: true,
    analytics: state.analytics === true,
    errorTracking: state.errorTracking === true,
    marketing: state.marketing === true
  };
}

export function isGrantAll(state: ConsentState): boolean {
  return CONSENT_CATEGORIES.every((category) => state[category] === true);
}

export function isEssentialOnly(state: ConsentState): boolean {
  return CONSENT_CATEGORIES.every((category) => state[category] === (category === 'essential'));
}

/** Has the visitor made a current-version decision? */
export function hasDecided(record: ConsentRecord | null): boolean {
  return record !== null && record.version === CONSENT_VERSION;
}

/**
 * Reads and validates a stored decision.
 *
 * Defensive on purpose: localStorage is user-writable, so this treats
 * every field as untrusted. Unknown versions, malformed JSON and
 * half-objects all resolve to `null`, which re-prompts.
 */
export function parseConsentRecord(raw: string | null): ConsentRecord | null {
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null) return null;

  const candidate = parsed as Partial<ConsentRecord>;
  if (candidate.version !== CONSENT_VERSION) return null;
  if (typeof candidate.decidedAt !== 'string') return null;

  const categories = candidate.categories as Partial<ConsentState> | undefined;
  if (typeof categories !== 'object' || categories === null) return null;

  // Re-normalise rather than trusting the stored booleans — this also
  // repairs records written before a category existed.
  const decisions: ConsentState = {
    essential: true,
    analytics: categories.analytics === true,
    errorTracking: categories.errorTracking === true,
    marketing: categories.marketing === true
  };

  return {
    version: CONSENT_VERSION,
    categories: decisions,
    decidedAt: candidate.decidedAt
  };
}

/**
 * Global Privacy Control (GPC) — California CCPA/CPRA opt-out signal.
 *
 * Browsers send `Sec-GPC: 1` when a user has GPC enabled in, e.g.,
 * California or Firefox's privacy settings. The legal expectation is
 * that such users are treated as having opted out of *sale or sharing*
 * of their data — for us that means analytics must stay off.
 *
 * The cookie policy already promised this was honoured, so it is
 * implemented rather than quietly dropped from the page. Takes a
 * `navigator`-shaped argument so it can be tested.
 */
export function globalPrivacyControlEnabled(
  navigatorLike?: { globalPrivacyControl?: boolean }
): boolean {
  const source =
    navigatorLike ??
    (typeof navigator === 'undefined' ? undefined : (navigator as unknown as { globalPrivacyControl?: boolean }));

  return source?.globalPrivacyControl === true;
}

/** The record written when GPC is on but the visitor never chose. */
export function gpcDerivedConsent(): ConsentRecord {
  return serializeConsentRecord(essentialOnly());
}

export function serializeConsentRecord(
  categories: ConsentState,
  now: Date = new Date()
): ConsentRecord {
  return {
    version: CONSENT_VERSION,
    categories: enforceEssential(categories),
    decidedAt: now.toISOString()
  };
}