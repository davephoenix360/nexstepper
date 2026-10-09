'use client';

/**
 * Consent provider + hook (added 2026-10-08).
 *
 * Owns the single source of truth for "has the visitor decided, and
 * what did they allow". Analytics consumers read `consent` rather than
 * touching localStorage, so gating logic never leaks into feature
 * code.
 *
 * Note on the localStorage decision: consent lives in localStorage,
 * not a cookie. A consent cookie would be a non-essential cookie set
 * before consent — see the header comment in `lib/consent.ts`.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from 'react';

import {
  CONSENT_STORAGE_KEY,
  allGranted,
  enforceEssential,
  essentialOnly,
  gpcDerivedConsent,
  globalPrivacyControlEnabled,
  hasDecided,
  parseConsentRecord,
  serializeConsentRecord,
  DEFAULT_CONSENT_STATE,
  type ConsentCategory,
  type ConsentRecord,
  type ConsentState
} from '@/lib/consent';

type ConsentContextValue = {
  /** Current grants. Pre-decision this is essential-only, never undefined. */
  consent: ConsentState;
  /** False until the visitor has made a current-version decision. */
  ready: boolean;
  /** True when the banner should be visible. */
  needsDecision: boolean;
  /** True once a valid decision exists (so consumers can fire once). */
  hasDecidedConsent: boolean;
  grantAll: () => void;
  grantEssentialOnly: () => void;
  save: (next: Partial<ConsentState>) => void;
  reset: () => void;
};

const ConsentContext = createContext<ConsentContextValue | null>(null);

/**
 * Reads the stored decision outside React. Used by `instrumentation-
 * client.ts` (which runs before any component mounts) and available
 * to any non-React consumer that must respect the gate.
 *
 * Returns `null` before any decision has been recorded.
 */
export function readStoredConsent(): ConsentRecord | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = parseConsentRecord(
      window.localStorage.getItem(CONSENT_STORAGE_KEY)
    );
    if (stored) return stored;

    // No explicit choice yet. If the browser sends GPC, record an
    // essential-only decision so the banner doesn't nag a user who has
    // already told us at the browser level. The cookie policy promises
    // this is honoured.
    if (globalPrivacyControlEnabled()) {
      return gpcDerivedConsent();
    }

    return null;
  } catch {
    // Private-mode Safari and hardened browsers throw on access.
    return null;
  }
}

export function ConsentProvider({ children }: { children: React.ReactNode }) {
  // Nothing granted until we know what was decided. Essential-only is
  // the safe default: no optional category starts enabled.
  const [record, setRecord] = useState<ConsentRecord | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setRecord(readStoredConsent());
    setReady(true);
  }, []);

  const persist = useCallback((categories: Partial<ConsentState>) => {
    const next = serializeConsentRecord(enforceEssential(categories));
    try {
      window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage unavailable — keep the in-memory decision so the UI
      // still reflects it, but it will re-prompt next load.
    }
    setRecord(next);
  }, []);

  const value = useMemo<ConsentContextValue>(
    () => ({
      consent: record?.categories ?? DEFAULT_CONSENT_STATE,
      ready,
      needsDecision: ready && !hasDecided(record),
      hasDecidedConsent: hasDecided(record),
      grantAll: () => persist(allGranted()),
      grantEssentialOnly: () => persist(essentialOnly()),
      save: (next) => persist({ ...(record?.categories ?? {}), ...next }),
      reset: () => {
        try {
          window.localStorage.removeItem(CONSENT_STORAGE_KEY);
        } catch {
          /* ignore */
        }
        setRecord(null);
      }
    }),
    [record, ready, persist]
  );

  return <ConsentContext.Provider value={value}>{children}</ConsentContext.Provider>;
}

/**
 * Access the consent decision. Safe to call outside the provider —
 * returns a "not decided, nothing optional granted" value rather than
 * throwing, so a component rendered on an unmounted subtree degrades
 * to the safe default instead of crashing.
 */
export function useConsent(): ConsentContextValue {
  const context = useContext(ConsentContext);

  if (context) return context;

  return {
    consent: DEFAULT_CONSENT_STATE,
    ready: false,
    needsDecision: false,
    hasDecidedConsent: false,
    grantAll: () => {},
    grantEssentialOnly: () => {},
    save: () => {},
    reset: () => {}
  };
}

/** Convenience predicate for one category. */
export function useConsentGranted(category: ConsentCategory): boolean {
  const { consent } = useConsent();
  return consent[category] === true;
}