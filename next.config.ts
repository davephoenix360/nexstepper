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
  /**
   * Keep the ONNX stack out of the server bundle.
   *
   * `@huggingface/transformers` loads a native ONNX runtime and, since
   * sharp 0.34, a native image library — both are native code the
   * bundler chokes on, so they are resolved at runtime from
   * node_modules instead.
   *
   * `onnxruntime-node` is listed too because the transformers package
   * requires it DYNAMICALLY (a computed specifier), which the file
   * tracer cannot follow — so without it here the module would be
   * missing from the deployed function and the embedding model would
   * never load. See `lib/scoring-async/semantic-similarity.ts` for the
   * side-effect import that makes the tracer follow it, and the drift
   * memo `docs/drift/2026-11-16-role-fit-and-the-silent-semantic-signal.md`.
   */
  serverExternalPackages: ['@huggingface/transformers', 'onnxruntime-node'],
  /**
   * Force the ONNX runtime's native binary into the function bundle.
   *
   * `onnxruntime-node/dist/binding.js` loads its binding with
   * `require(`../bin/napi-v6/${process.platform}/${process.arch}/onnxruntime_binding.node`)`
   * — a template-literal path. No file tracer can follow that, so the
   * `.node` addon (and the `libonnxruntime.so` it links against) never
   * reaches the deployment, and the runtime fails with
   * `ERR_DLOPEN_FAILED` — or, if the package itself is missing,
   * `Cannot find module 'onnxruntime-node'`.
   *
   * These globs are the supported way to add files a tracer cannot
   * discover. They point at pnpm's physical store paths (the symlinked
   * `node_modules/onnxruntime-node` path does not exist for a
   * transitive dependency) and cover the Linux x64 + arm64 binaries.
   *
   * Why `linux/**` and not just `linux/x64`: Vercel builds for x64
   * today, but an arm64 build would otherwise deploy a function with
   * no binding at all.
   */
  outputFileTracingIncludes: {
    '/**': [
      './node_modules/.pnpm/onnxruntime-node@*/node_modules/onnxruntime-node/bin/napi-v6/linux/**/*',
      './node_modules/.pnpm/onnxruntime-common@*/node_modules/onnxruntime-common/**/*'
    ]
  }
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
