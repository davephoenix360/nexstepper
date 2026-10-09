'use client';

import posthog from 'posthog-js';
import { PostHogProvider as Provider } from 'posthog-js/react';

/**
 * Client-side React context wrapper for PostHog.
 *
 * Init lives in `components/consent/analytics-gate.tsx` — which only
 * calls `posthog.init()` once analytics consent is recorded (it used
 * to live in `instrumentation-client.ts`, which started analytics the
 * instant the page loaded, before anyone could decline). This
 * component only provides the React context (`posthog-js/react`'s
 * `usePostHog`, `useFeatureFlag`, etc.) — it does NOT call
 * `posthog.init()`.
 *
 * If NEXT_PUBLIC_POSTHOG_KEY is not set, `posthog-js` is still importable
 * but the SDK was never initialized; calling `posthog.capture(...)` in
 * that case is a silent no-op, which is the desired dev-without-keys UX.
 */
export function PostHogProvider({ children }: { children: React.ReactNode }) {
  return <Provider client={posthog}>{children}</Provider>;
}