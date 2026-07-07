import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

/**
 * Next.js 16 config. Cache Components (`"use cache"`) is the replacement for
 * the removed experimental.ppr — opt in once we have a cacheable surface.
 *
 * Sentry wraps the config to inject build-time source map upload + error
 * monitoring. The Sentry config files (sentry.client.config.ts,
 * sentry.server.config.ts, instrumentation.ts) drive runtime behavior.
 */
const nextConfig: NextConfig = {};

export default withSentryConfig(nextConfig, {
  // Build-time options — disable source map upload unless SENTRY_AUTH_TOKEN is set
  silent: !process.env.SENTRY_AUTH_TOKEN,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  widenClientFileUpload: true,
  // Disable sourcemap generation/upload unless Sentry is fully configured
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN
  }
});