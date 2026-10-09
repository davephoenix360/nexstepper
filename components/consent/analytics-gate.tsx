'use client';

/**
 * Analytics gate (added 2026-10-08).
 *
 * PostHog initialisation moved out of `instrumentation-client.ts` and
 * in here, because consent can be granted *at runtime* — a visitor
 * who clicks "Accept all" on the banner must start being tracked
 * without a reload. Mounting inside `<ConsentProvider>` means the
 * subscription fires on the decision, not just on first load.
 *
 * Init options are carried over verbatim from the previous
 * instrumentation-client location (including `capture_pageview: false`
 * and the comment explaining why), so this changes *when* PostHog
 * starts, never *what* it records.
 *
 * `posthog.init` is called at most once per page load: the ref guard
 * survives React strict-mode double-effects and re-renders.
 */
import { useEffect, useRef } from 'react';
import posthog from 'posthog-js';

import { useConsent } from './consent-provider';

export function AnalyticsGate() {
  const { consent, hasDecidedConsent } = useConsent();
  const started = useRef(false);

  const analyticsAllowed = hasDecidedConsent && consent.analytics === true;

  useEffect(() => {
    if (!analyticsAllowed) return;
    if (started.current) return;
    // No key configured (local dev, self-hosters) — stay a no-op, same
    // shape as the old instrumentation-client guard.
    if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;

    started.current = true;

    posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
      api_host:
        process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com',
      ui_host: 'https://us.posthog.com',
      // PostHog's recommended baseline (autocapture, session recording
      // defaults, etc.). We override the pageview flag below — see why.
      defaults: '2026-05-30',
      // `capture_pageview: false` — we don't have a SPA-route-change
      // listener wired today. Until we add one (or switch to
      // `capture_pageview: true` + accept the duplicate initial event
      // in App Router), the app doesn't emit $pageview events. Buttons
      // + form submits still auto-capture via the `autocapture` flag
      // in the defaults baseline.
      capture_pageview: false,
      // Pageleave is fine to autocapture — it's a window-level event.
      capture_pageleave: true,
      // Only build person profiles for identified users. Anonymous
      // visitors still get event capture, but no person record.
      person_profiles: 'identified_only'
    });
  }, [analyticsAllowed]);

  return null;
}