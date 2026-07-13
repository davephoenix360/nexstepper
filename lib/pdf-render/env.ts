/**
 * PDF render env validation. Parsed lazily so missing vars in dev don't
 * crash the app on import — the renderer asks for what it needs at call time.
 *
 * Convention: this file is the *only* place the PDF render subsystem reads
 * `process.env`. Every other file imports the parsed `pdfEnv` object.
 */

import 'server-only';

import { z } from 'zod';

const pdfEnvSchema = z.object({
  /**
   * Which provider to use. 'stub' is the deterministic fake — only useful
   * for local dev without network access and for the test suite. In prod
   * this should be 'browserless'.
   *
   * Default 'stub' is intentional: the tests need to import the renderer
   * and the orchestrator without a real provider, and dev-mode calls
   * without a token would 401 from Browserless. Flip it to 'browserless'
   * in Vercel env vars.
   */
  PDF_PROVIDER: z.enum(['stub', 'browserless']).default('stub'),

  /**
   * Browserless API token. Required when PDF_PROVIDER=browserless.
   * Get one at https://browserless.io/account/ — free tier is 1k units/mo.
   */
  BROWSERLESS_TOKEN: z.string().optional(),

  /**
   * Browserless region. 'production-sfo' is San Francisco. Other options:
   * 'production-lon' (London), 'production-ams' (Amsterdam). EU endpoints
   * matter for GDPR-sensitive users.
   */
  BROWSERLESS_REGION: z.string().default('production-sfo'),

  /**
   * Where the FileSystemCache stores PDFs. Relative to the project root.
   * In Vercel this won't actually persist (serverless functions are
   * ephemeral) — Phase 3 will add a Vercel KV cache for prod.
   */
  PDF_CACHE_DIR: z.string().default('.cache/pdf-render'),

  /**
   * Timeout in ms for a single provider call. Browserless's hard cap is
   * much higher (15-60 min depending on plan) but we don't want a hung
   * request to block the request handler forever.
   */
  PDF_RENDER_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),

  /**
   * Whether to skip the cache entirely. Useful for local debugging when
   * you change a template and want to see the new render immediately.
   */
  PDF_CACHE_DISABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true')
});

/** Parsed env, cached. Re-read on every call so tests can override. */
export function getPdfEnv() {
  const parsed = pdfEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    // Throw, don't log-and-continue: a malformed env is a deployment bug.
    throw new Error(
      `[pdf-render] invalid env: ${parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`
    );
  }

  const env = parsed.data;

  // Cross-field check: 'browserless' needs a token.
  if (env.PDF_PROVIDER === 'browserless' && !env.BROWSERLESS_TOKEN) {
    throw new Error(
      '[pdf-render] PDF_PROVIDER=browserless requires BROWSERLESS_TOKEN. ' +
        'Either set it or switch PDF_PROVIDER=stub for local dev.'
    );
  }

  return env;
}
