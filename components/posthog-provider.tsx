'use client';

import posthog from 'posthog-js';
import { PostHogProvider as Provider } from 'posthog-js/react';

/**
 * Client-side React context wrapper for PostHog.
 *
 * Init lives in `instrumentation-client.ts` (Next.js 15.3+ pattern),
 * which runs once before the app renders. This component only provides
 * the React context (`posthog-js/react`'s `usePostHog`, `useFeatureFlag`,
 * etc.) — it does NOT call `posthog.init()`.
 *
 * If NEXT_PUBLIC_POSTHOG_KEY is not set, `posthog-js` is still importable
 * but the SDK was never initialized; calling `posthog.capture(...)` in
 * that case is a silent no-op, which is the desired dev-without-keys UX.
 */
export function PostHogProvider({ children }: { children: React.ReactNode }) {
  return <Provider client={posthog}>{children}</Provider>;
}