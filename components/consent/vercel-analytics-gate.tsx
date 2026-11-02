'use client';

/**
 * The Vercel Web Analytics gate.
 *
 * ## Why this is gated at all
 *
 * The app already has a consent architecture (`lib/consent.ts`): no
 * optional category is granted until the visitor decides, GPC is
 * honoured in code, and the cookies + privacy pages promise that
 * *"one analytics tool runs only if you say yes"* and that *"PostHog is
 * not initialised at all until you allow analytics"*.
 *
 * `<Analytics />` has no consent awareness of its own — mounting it
 * unconditionally starts collecting page views immediately and sets its
 * cookie before anyone has said yes. That would make a promise the
 * legal pages currently make false, so Vercel Analytics goes through the
 * SAME gate as PostHog: it is not loaded, and nothing is sent, until
 * the visitor grants analytics.
 *
 * ## Why the app wanted it
 *
 * PostHog runs with `capture_pageview: false` (see
 * `components/consent/analytics-gate.tsx`), so the app sends **no
 * page-view events at all** today — only button and form events. The
 * scorecard, the JD panel and the chat all care about whether a visitor
 * reached the page at all. Vercel Analytics fills that gap: it reports
 * page views and visitors, including SPA route changes, which the
 * PostHog setup does not.
 *
 * It is a complement, not a replacement: PostHog keeps the rich
 * product events, Vercel Analytics adds the traffic.
 *
 * ## If it should run regardless of consent
 *
 * That is a legal-posture decision, not a code one: it also means the
 * cookies and privacy pages have to stop saying "only if you say yes".
 * Say the word and it is a two-line change here plus an edit to those
 * two pages.
 */
import { Analytics } from '@vercel/analytics/next';

import { useConsent } from './consent-provider';

export function VercelAnalyticsGate() {
  const { consent, hasDecidedConsent } = useConsent();

  // Same rule PostHog uses: nothing optional runs until there is a
  // decision AND that decision granted analytics.
  const analyticsAllowed = hasDecidedConsent && consent.analytics === true;

  if (!analyticsAllowed) return null;

  return <Analytics />;
}
