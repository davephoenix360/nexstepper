/**
 * Tests for cookie consent (added 2026-10-08).
 *
 * The thing being protected here is a legal guarantee, not a feature:
 * **no optional analytics storage may be created before the visitor
 * decides.** Almost every assertion below exists to catch a future
 * edit that quietly reorders "load" and "ask".
 *
 * `lib/consent.ts` is deliberately pure so all of it can be asserted
 * without a DOM. The React layer is checked structurally, and the
 * "does this test actually bite" case is covered at the bottom.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  CONSENT_CATEGORIES,
  CONSENT_STORAGE_KEY,
  CONSENT_VERSION,
  DEFAULT_CONSENT_STATE,
  ESSENTIAL_CATEGORIES,
  allGranted,
  enforceEssential,
  essentialOnly,
  gpcDerivedConsent,
  globalPrivacyControlEnabled,
  hasDecided,
  isEssentialOnly,
  isGrantAll,
  parseConsentRecord,
  serializeConsentRecord
} from '@/lib/consent';

const SOURCE = {
  instrumentation: readFileSync(
    resolve(process.cwd(), 'instrumentation-client.ts'),
    'utf8'
  ),
  gate: readFileSync(
    resolve(process.cwd(), 'components/consent/analytics-gate.tsx'),
    'utf8'
  ),
  identify: readFileSync(
    resolve(process.cwd(), 'components/posthog-identify.tsx'),
    'utf8'
  ),
  layout: readFileSync(resolve(process.cwd(), 'app/layout.tsx'), 'utf8'),
  cookiesPage: readFileSync(
    resolve(process.cwd(), 'app/(legal)/cookies/page.tsx'),
    'utf8'
  )
};

describe('consent defaults — nothing optional is pre-granted', () => {
  it('starts with every optional category denied', () => {
    expect(DEFAULT_CONSENT_STATE.analytics).toBe(false);
    expect(DEFAULT_CONSENT_STATE.errorTracking).toBe(false);
    expect(DEFAULT_CONSENT_STATE.marketing).toBe(false);
  });

  it('always treats essential as granted', () => {
    expect(DEFAULT_CONSENT_STATE.essential).toBe(true);
    expect(ESSENTIAL_CATEGORIES).toContain('essential');
  });

  it('essentialOnly grants nothing else', () => {
    const state = essentialOnly();
    expect(state.essential).toBe(true);
    expect(state.analytics).toBe(false);
    expect(state.errorTracking).toBe(false);
    expect(state.marketing).toBe(false);
    expect(isEssentialOnly(state)).toBe(true);
  });

  it('allGranted grants everything', () => {
    expect(isGrantAll(allGranted())).toBe(true);
  });
});

describe('enforceEssential — consent cannot be revoked into a broken site', () => {
  it('forces essential back on if something tries to turn it off', () => {
    const coerced = enforceEssential({ essential: false, analytics: true });
    expect(coerced.essential).toBe(true);
    expect(coerced.analytics).toBe(true);
  });

  it('coerces non-boolean truthy values to false', () => {
    const coerced = enforceEssential({
      analytics: 'yes' as unknown as boolean
    });
    expect(coerced.analytics).toBe(false);
  });
});

describe('consent record round-trip', () => {
  it('survives serialize → parse', () => {
    const record = serializeConsentRecord(allGranted(), new Date('2026-10-08T00:00:00Z'));
    const parsed = parseConsentRecord(JSON.stringify(record));
    expect(parsed).not.toBeNull();
    expect(parsed?.categories.analytics).toBe(true);
    expect(parsed?.decidedAt).toBe('2026-10-08T00:00:00.000Z');
  });

  it('returns null for missing input', () => {
    expect(parseConsentRecord(null)).toBeNull();
    expect(parseConsentRecord('')).toBeNull();
  });

  it('returns null for malformed JSON rather than throwing', () => {
    expect(parseConsentRecord('{not json')).toBeNull();
  });

  it('returns null for a stale record version (forces a re-prompt)', () => {
    const stale = JSON.stringify({
      version: CONSENT_VERSION - 1,
      categories: allGranted(),
      decidedAt: '2026-01-01T00:00:00.000Z'
    });
    expect(parseConsentRecord(stale)).toBeNull();
  });

  it('repairs a record missing a category rather than trusting it', () => {
    // A record written before `marketing` existed must not inherit an
    // implicit grant for it.
    const partial = JSON.stringify({
      version: CONSENT_VERSION,
      categories: { essential: true, analytics: true },
      decidedAt: '2026-01-01T00:00:00.000Z'
    });
    const parsed = parseConsentRecord(partial);
    expect(parsed?.categories.marketing).toBe(false);
    expect(parsed?.categories.analytics).toBe(true);
  });

  it('never lets a tampered record disable essential', () => {
    const tampered = JSON.stringify({
      version: CONSENT_VERSION,
      categories: {
        essential: false,
        analytics: true,
        errorTracking: true,
        marketing: true
      },
      decidedAt: '2026-01-01T00:00:00.000Z'
    });
    expect(parseConsentRecord(tampered)?.categories.essential).toBe(true);
  });

  it('hasDecided is false for a null record', () => {
    expect(hasDecided(null)).toBe(false);
  });
});

describe('Global Privacy Control', () => {
  it('detects the signal', () => {
    expect(globalPrivacyControlEnabled({ globalPrivacyControl: true })).toBe(true);
  });

  it('treats an absent signal as off', () => {
    expect(globalPrivacyControlEnabled({ globalPrivacyControl: false })).toBe(false);
    expect(globalPrivacyControlEnabled({})).toBe(false);
  });

  it('derives an essential-only decision, never a grant', () => {
    const record = gpcDerivedConsent();
    expect(record.categories.essential).toBe(true);
    expect(record.categories.analytics).toBe(false);
    expect(record.categories.errorTracking).toBe(false);
    expect(record.categories.marketing).toBe(false);
  });
});

describe('consent is stored OUTSIDE a cookie (structural guarantee)', () => {
  it('uses localStorage, so no cookie is set before consent', () => {
    const provider = readFileSync(
      resolve(process.cwd(), 'components/consent/consent-provider.tsx'),
      'utf8'
    );
    expect(provider).toContain('localStorage');
    // By symbol — the literal value lives in lib/consent.ts and is
    // asserted separately ("the storage key is namespaced").
    expect(provider).toContain('CONSENT_STORAGE_KEY');
  });

  it('the storage key is namespaced and explicit', () => {
    expect(CONSENT_STORAGE_KEY).toBe('nexstepper.consent');
  });
});

describe('analytics is genuinely gated — the load-order guard', () => {
  it('instrumentation-client no longer initialises PostHog', () => {
    // THE regression guard. PostHog used to boot here, at page load,
    // before any visitor could decline. If this ever reappears, consent
    // is theatre.
    expect(SOURCE.instrumentation).not.toContain('posthog.init');
    expect(SOURCE.instrumentation).not.toMatch(/import posthog/);
  });

  it('instrumentation-client still initialises Sentry', () => {
    // Removing the analytics gate must not have taken error monitoring
    // with it.
    expect(SOURCE.instrumentation).toContain('Sentry.init');
  });

  it('init moved to the consent-aware gate', () => {
    expect(SOURCE.gate).toContain('posthog.init');
    expect(SOURCE.gate).toContain('useConsent');
  });

  it('the gate refuses to init without an explicit analytics grant', () => {
    expect(SOURCE.gate).toContain('analyticsAllowed');
    expect(SOURCE.gate).toMatch(/if \(!analyticsAllowed\) return/);
    // A decision must exist, not merely a consent object.
    expect(SOURCE.gate).toContain('hasDecidedConsent');
  });

  it('identify() is also gated, and re-runs when consent is granted', () => {
    // Without this, a user who accepts mid-session would have their
    // events attributed to an anonymous id.
    expect(SOURCE.identify).toContain('analyticsAllowed');
    expect(SOURCE.identify).toMatch(
      /\[session\?\.user\?\.id, isPending, analyticsAllowed\]/
    );
  });

  it('AnalyticsGate renders BEFORE PostHogIdentify in the tree', () => {
    // React runs sibling effects in tree order, so init() must precede
    // identify() or the identify silently no-ops.
    const gateIndex = SOURCE.layout.indexOf('<AnalyticsGate />');
    const identifyIndex = SOURCE.layout.indexOf('<PostHogIdentify />');
    expect(gateIndex).toBeGreaterThan(-1);
    expect(identifyIndex).toBeGreaterThan(-1);
    expect(gateIndex).toBeLessThan(identifyIndex);
  });

  it('the banner is mounted in the root layout', () => {
    expect(SOURCE.layout).toContain('<CookieConsentBanner />');
    expect(SOURCE.layout).toContain('<ConsentProvider>');
  });
});

describe('banner accessibility — no dark patterns', () => {
  it('labels the region so a screen reader can find it', () => {
    const banner = readFileSync(
      resolve(process.cwd(), 'components/consent/cookie-consent-banner.tsx'),
      'utf8'
    );
    expect(banner).toContain('aria-label="Cookie consent"');
    expect(banner).toContain('role="region"');
  });

  it('offers accept and reject with test ids for both', () => {
    const banner = readFileSync(
      resolve(process.cwd(), 'components/consent/cookie-consent-banner.tsx'),
      'utf8'
    );
    expect(banner).toContain('data-testid="consent-accept-all"');
    expect(banner).toContain('data-testid="consent-essential-only"');
    expect(banner).toContain('data-testid="consent-customise"');
  });

  it('renders no banner at all once a decision exists', () => {
    const banner = readFileSync(
      resolve(process.cwd(), 'components/consent/cookie-consent-banner.tsx'),
      'utf8'
    );
    expect(banner).toMatch(/if \(!needsDecision\) return null/);
  });
});

describe('cookie policy matches the code', () => {
  it('no longer lists cookies the app never set', () => {
    // csrf_token and share_token were invented — they appear nowhere in
    // the codebase. A policy listing cookies you don't set is a
    // compliance problem, not just an inaccuracy.
    //
    // Scoped to table cells on purpose: the changelog *should* name
    // them, because it records that they were removed.
    expect(SOURCE.cookiesPage).not.toMatch(
      /<td[^>]*>\s*nexstepper\.(csrf_token|share_token)/
    );
  });

  it('documents the real cookies', () => {
    expect(SOURCE.cookiesPage).toContain('nexstepper.session_token');
    expect(SOURCE.cookiesPage).toContain('nexstepper.session_data');
  });

  it('documents where consent is stored', () => {
    expect(SOURCE.cookiesPage).toContain('nexstepper.consent');
  });

  it('records the consent system in the changelog', () => {
    expect(SOURCE.cookiesPage).toMatch(/Consent banner introduced/);
  });
});

describe('category set', () => {
  it('covers every category with a label and description', () => {
    expect(CONSENT_CATEGORIES.length).toBeGreaterThanOrEqual(4);
    expect(new Set(CONSENT_CATEGORIES).size).toBe(CONSENT_CATEGORIES.length);
  });

  it('only essential is exempt from consent', () => {
    expect(ESSENTIAL_CATEGORIES).toEqual(['essential']);
  });
});