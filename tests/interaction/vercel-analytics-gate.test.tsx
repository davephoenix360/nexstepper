/**
 * @vitest-environment jsdom
 *
 * The Vercel Web Analytics gate.
 *
 * ## What is being protected
 *
 * The cookies and privacy pages promise that optional analytics runs
 * **only after the visitor says yes**. `<Analytics />` has no consent
 * awareness of its own — mounting it unconditionally starts collecting
 * page views and loading Vercel's script before anyone has decided.
 *
 * So this gate makes the same decision PostHog's gate makes: nothing
 * optional runs until there is a decision AND that decision granted
 * analytics.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('@vercel/analytics/next', () => ({
  Analytics: () => <div data-testid="vercel-analytics" />
}));

import { ConsentProvider } from '@/components/consent/consent-provider';
import { VercelAnalyticsGate } from '@/components/consent/vercel-analytics-gate';
import {
  CONSENT_STORAGE_KEY,
  CONSENT_VERSION,
  allGranted,
  essentialOnly
} from '@/lib/consent';

function seed(categories: Record<string, boolean>) {
  window.localStorage.setItem(
    CONSENT_STORAGE_KEY,
    JSON.stringify({
      version: CONSENT_VERSION,
      categories,
      decidedAt: new Date().toISOString()
    })
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
});

describe('VercelAnalyticsGate', () => {
  it('does not load Vercel Analytics before a decision is made', async () => {
    // No stored decision at all — the visitor has not seen the banner.
    render(
      <ConsentProvider>
        <VercelAnalyticsGate />
      </ConsentProvider>
    );
    await waitFor(() => {
      expect(screen.queryByTestId('vercel-analytics')).toBeNull();
    });
  });

  it('does not load Vercel Analytics when analytics was declined', async () => {
    seed(essentialOnly());
    render(
      <ConsentProvider>
        <VercelAnalyticsGate />
      </ConsentProvider>
    );
    await waitFor(() => {
      expect(screen.queryByTestId('vercel-analytics')).toBeNull();
    });
  });

  it('loads Vercel Analytics once analytics is granted', async () => {
    seed(allGranted());
    render(
      <ConsentProvider>
        <VercelAnalyticsGate />
      </ConsentProvider>
    );
    await waitFor(() => {
      expect(screen.getByTestId('vercel-analytics')).toBeTruthy();
    });
  });

  it('degrades to the safe default outside a provider', async () => {
    // `useConsent()` outside the provider returns "not decided, nothing
    // optional granted" rather than throwing — so a subtree rendered
    // without the provider cannot silently start collecting.
    render(<VercelAnalyticsGate />);
    await waitFor(() => {
      expect(screen.queryByTestId('vercel-analytics')).toBeNull();
    });
  });
});
