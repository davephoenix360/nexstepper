import { PostHog } from 'posthog-node';

/**
 * Server-side PostHog. Used to capture server events (API calls, webhooks,
 * background jobs). Lazy-init so missing keys in dev don't crash the app.
 */
export const posthogServer = process.env.POSTHOG_KEY
  ? new PostHog(process.env.POSTHOG_KEY, {
      host: process.env.POSTHOG_HOST ?? 'https://us.i.posthog.com',
      // Don't block the request lifecycle on analytics
      flushInterval: 1000
    })
  : null;

/**
 * Capture a server-side event. No-op when PostHog isn't configured (dev).
 */
export function trackServer(
  distinctId: string,
  event: string,
  properties?: Record<string, unknown>
) {
  if (!posthogServer) return;
  posthogServer.capture({ distinctId, event, properties });
}