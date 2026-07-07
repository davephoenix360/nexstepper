'use client';

import { useEffect } from 'react';
import posthog from 'posthog-js';
import { PostHogProvider as Provider } from 'posthog-js/react';

/**
 * Client-side PostHog provider. Wraps the app to enable session recording
 * + autocapture. Reads NEXT_PUBLIC_POSTHOG_KEY at runtime — if missing,
 * becomes a transparent passthrough.
 */
export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key || posthog.__loaded) return;

    posthog.init(key, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? '/ingest',
      ui_host: 'https://us.posthog.com',
      person_profiles: 'identified_only',
      capture_pageview: false, // we'll do this manually for SPA route changes
      capture_pageleave: true,
      autocapture: true
    });
  }, []);

  return <Provider client={posthog}>{children}</Provider>;
}