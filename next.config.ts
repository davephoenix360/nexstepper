import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

/**
 * Next.js 16 config. Cache Components (`"use cache"`) is the replacement for
 * the removed experimental.ppr — opt in once we have a cacheable surface.
 *
 * Sentry wraps the config to inject build-time source map upload + error
 * monitoring. The Sentry config files (sentry.client.config.ts,
 * sentry.server.config.ts, instrumentation.ts) drive runtime behavior.
 *
 * `serverActions.bodySizeLimit` is bumped to 10 MB to support the
 * resume-import flow (PDFs up to ~10 MB). The Vercel default is 1 MB
 * which is too small for scanned / image-heavy resumes. We also cap
 * server-side in `lib/resume-parser/extract-file-text.ts` (MAX_FILE_BYTES)
 * so this limit is defense-in-depth, not the only guard.
 */
const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb'
    }
  }
};

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