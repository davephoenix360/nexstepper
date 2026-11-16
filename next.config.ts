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
/**
 * The Linux native artifacts `onnxruntime-node` needs at runtime.
 *
 * The paths point at pnpm's **physical store** (`node_modules/.pnpm/…`)
 * because the symlinked `node_modules/onnxruntime-node` path does not
 * exist for a transitive dependency — and the glob is resolved by
 * Next's tracer, which does not follow symlinks out of the store.
 *
 * `linux/x64` only: Vercel builds linux/x64, and the other platforms
 * are excluded by `outputFileTracingExcludes` below.
 */
const ONNX_LINUX_FILES = [
  './node_modules/.pnpm/onnxruntime-node@*/node_modules/onnxruntime-node/bin/napi-v6/linux/x64/**/*',
  './node_modules/.pnpm/onnxruntime-common@*/node_modules/onnxruntime-common/**/*'
];

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
   * Force the ONNX runtime's native binary into the function bundle —
   * but ONLY for the routes that actually run the scorer.
   *
   * `onnxruntime-node/dist/binding.js` loads its binding with
   * `require(`../bin/napi-v6/${process.platform}/${process.arch}/onnxruntime_binding.node`)`
   * — a template-literal path. No file tracer can follow that, so the
   * `.node` addon (and the `libonnxruntime.so` it links against) never
   * reaches the deployment, and the runtime fails with
   * `ERR_DLOPEN_FAILED` — or, if the package itself is missing,
   * `Cannot find module 'onnxruntime-node'`.
   *
   * ## Why these two routes and not `/**`
   *
   * The native binaries are **44 MB** (libonnxruntime.so alone is
   * 43.7 MB). Adding them to EVERY route would add 44 MB to every
   * function — and, more importantly, it would change every route's
   * output bundle. Vercel groups routes into Serverless Functions when
   * their output is identical, so changing every route's bundle
   * changes the grouping, and the app ran straight into the Hobby
   * plan's ceiling of 12 functions:
   *
   *   "No more than 12 Serverless Functions can be added to a
   *    Deployment on the Hobby plan."
   *
   * Only two routes run the hybrid scorer:
   *
   *   - `/api/chat` — the `getAtsScore` tool.
   *   - `/dashboard/resumes/[id]` — the Recompute server action.
   *
   * So only those two get the runtime. Everything else keeps the small
   * bundle it had, the grouping is preserved, and the deployment stays
   * small.
   *
   * The globs point at pnpm's **physical store paths** — the symlinked
   * `node_modules/onnxruntime-node` path does not exist for a
   * transitive dependency, so the glob has to name the store directory.
   * `linux/**` covers x64 and arm64; Vercel builds x64 today, but an
   * arm64 build would otherwise deploy a function with no binding.
   */
  /**
   * Force the ONNX runtime's native binary into the function bundle —
   * but ONLY for the routes that actually run the scorer.
   *
   * ## The gap
   *
   * `onnxruntime-node/dist/binding.js` loads its addon with
   * `require(`../bin/napi-v6/${process.platform}/${process.arch}/onnxruntime_binding.node`)`
   * — a template-literal path. Next's tracer resolves the ADDON (it can
   * see the template) but not the shared library the addon dlopens, so
   * `libonnxruntime.so.1` never reaches the deployment and the runtime
   * fails with `ERR_DLOPEN_FAILED`.
   *
   * ## Why the key is escaped
   *
   * The keys of `outputFileTracingIncludes` are ROUTE GLOBS, matched
   * with picomatch — and in a glob, `[id]` is a CHARACTER CLASS, not a
   * literal segment. Next's own docs escape it
   * (`'/api/login/\\[\\[\\.\\.\\.slug\\]\\]'`), and a project shipping
   * this exact package does the same (`"/\\[user\\]"`).
   *
   * Empirically, the unescaped key did NOT apply to the variant page's
   * trace: the binding was there (the tracer found it) and the library
   * was not (the include never fired).
   *
   * ## Why only these two routes
   *
   * The native binaries are 44 MB, and adding them to every route
   * changes every route's output bundle — which is what moved Vercel's
   * route grouping and took the deployment over the Hobby plan's
   * 12-function ceiling. Only two routes run the hybrid scorer:
   *
   *   - `/api/chat` — the `getAtsScore` tool.
   *   - `/dashboard/resumes/[id]` — the Recompute server action.
   */
  outputFileTracingIncludes: {
    '/api/chat': ONNX_LINUX_FILES,
    '/dashboard/resumes/\\[id\\]': ONNX_LINUX_FILES
  },
  /**
   * And drop the platforms we will never run on. Vercel builds
   * linux/x64; shipping darwin, win32 and arm64 costs ~60 MB per
   * function for nothing, and `onnxruntime-web` is the browser build.
   */
  outputFileTracingExcludes: {
    '*': [
      './node_modules/onnxruntime-node/bin/napi-v6/darwin/**',
      './node_modules/onnxruntime-node/bin/napi-v6/win32/**',
      './node_modules/onnxruntime-node/bin/napi-v6/linux/arm64/**',
      './node_modules/onnxruntime-web/**'
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
