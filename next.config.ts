import { withSentryConfig } from '@sentry/nextjs/config';
import type { NextConfig } from 'next';

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
 *
 * `serverExternalPackages` excludes `@huggingface/transformers` (and its
 * `onnxruntime-node` native binary) from the server bundle so the heavy
 * native module is loaded at runtime via `require()` rather than webpack-
 * bundled. Phase 3 of the ATS engine review introduced this dep — see
 * `docs/drift/2026-09-19-ats-engine-review.md`.
 */
const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb'
    }
  },
  serverExternalPackages: ['@huggingface/transformers']
};

export default withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // Suppress upload logs in local dev (no auth token).
  silent: !process.env.SENTRY_AUTH_TOKEN,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces
  // (increases build time). No-op when `sourcemaps.disable` is true below.
  widenClientFileUpload: true,

  // Don't generate or upload source maps unless we actually have the
  // auth token to upload with. Without this, dev builds try to push
  // sourcemaps to Sentry with no credentials and emit noisy warnings.
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN
  },

  // Uncomment to route browser requests to Sentry through a Next.js
  // rewrite to circumvent ad-blockers. Increases server load + hosting
  // bill, and the rewrite must not collide with our (future) middleware.
  // tunnelRoute: '/monitoring',

  webpack: {
    // Enables automatic instrumentation of Vercel Cron Monitors.
    // (Does not yet work with App Router route handlers.)
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,

    // Tree-shake Sentry logger statements to reduce bundle size.
    treeshake: {
      removeDebugLogging: true
    }
  }
});
