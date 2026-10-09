'use client';

import { useEffect } from 'react';
import posthog from 'posthog-js';

import { useSession } from '@/lib/auth-client';
import { useConsent } from '@/components/consent/consent-provider';

/**
 * Ties PostHog's anonymous distinct_id to the signed-in user's id, and
 * resets it on sign-out.
 *
 * Why this lives in a tiny no-render component instead of inside
 * `<PostHogProvider>`: the provider is a Server-renderable wrapper
 * (we want it to mount even when PostHog isn't initialized, so it
 * doesn't break the app in dev without keys). `useSession()` is a
 * client-only hook, so the identify logic needs its own `'use client'`
 * boundary.
 *
 * On session change:
 *  - signed in: `posthog.identify(userId)` — all subsequent events are
 *    attributed to the user. Per the privacy policy, we don't pass
 *    person properties (email/name) here — the user id is enough to
 *    join events for funnel / cohort analysis.
 *  - signed out: `posthog.reset()` — clears the distinct_id cookie
 *    and emits a fresh anonymous id, so the next visitor on the same
 *    browser doesn't inherit the previous user's identity.
 *
 * Silent no-op when PostHog isn't initialized (`posthog-js` is a
 * pass-through SDK when `init()` was never called).
 *
 * **Consent-gated (2026-10-08).** PostHog is no longer initialised in
 * `instrumentation-client.ts`, so it may not exist yet when this
 * component first mounts. Identifying before consent would attribute a
 * signed-in user's events to the wrong distinct_id — or worse, record
 * them before the visitor could decline. So we wait for
 * `analyticsAllowed`, which flips true both when a stored decision
 * already allows analytics AND when the visitor grants it mid-session
 * by clicking "Accept all" on the consent banner.
 */
export function PostHogIdentify() {
  const { data: session, isPending } = useSession();
  const { consent, hasDecidedConsent } = useConsent();

  const analyticsAllowed = hasDecidedConsent && consent.analytics === true;

  useEffect(() => {
    if (isPending) return; // wait for the session query to settle
    // Not merely a perf guard: `identify()` would be a no-op before
    // `init()`, silently losing the attribution.
    if (!analyticsAllowed) return;
    if (session?.user) {
      posthog.identify(session.user.id);
    } else {
      posthog.reset();
    }
  }, [session?.user?.id, isPending, analyticsAllowed]);

  return null;
}
