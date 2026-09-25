/**
 * Next.js 15.3+ client instrumentation entry. Loaded once per client boot,
 * before the app renders. PostHog's recommended init location because:
 *
 *  - Captures the very first $pageview before React mounts.
 *  - Doesn't depend on any component being mounted in the tree.
 *  - Surfaces init errors early (during dev startup, not first interaction).
 *
 * The `instrumentation.ts` sibling handles the server side (Sentry).
 * PostHog's server singleton lives at `lib/posthog/server.ts` and is
 * imported directly where needed (it's lazy-init, not auto-loaded).
 *
 * If NEXT_PUBLIC_POSTHOG_KEY isn't set, this is a no-op — the rest of
 * the app keeps working without analytics. Same shape as the server
 * singleton's lazy-init guard.
 */
import * as Sentry from '@sentry/nextjs';
import posthog from 'posthog-js';

/**
 * Sentry App Router navigation instrumentation. Next.js calls this
 * hook before each client-side route transition; Sentry uses it to
 * create a span + breadcrumb so navigations show up in the trace
 * waterfall and error breadcrumbs. Without it, Sentry prints
 * `[@sentry/nextjs] ACTION REQUIRED: To instrument navigations,
 * the Sentry SDK requires you to export an onRouterTransitionStart
 * hook from your instrumentation-client file`.
 *
 * Safe to export unconditionally — if NEXT_PUBLIC_SENTRY_DSN /
 * SENTRY_DSN is not set, Sentry isn't initialized (see
 * `sentry.client.config.ts`) and `captureRouterTransitionStart`
 * is a no-op.
 */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

if (process.env.NEXT_PUBLIC_POSTHOG_KEY) {
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
}