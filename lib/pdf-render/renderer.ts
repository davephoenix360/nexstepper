/**
 * The PDF render orchestrator. The one and only entry point (re-exported
 * from `./index.ts` as `renderPdf`).
 *
 * Pipeline:
 *   1. Validate input
 *   2. Hash → check cache
 *   3. On miss: call provider
 *   4. On success: write to cache
 *   5. Always: emit a telemetry event
 *   6. Return the discriminated union result
 *
 * The orchestrator is a class (not a free function) for two reasons:
 *   - It memoizes the provider/cache per env read, so the env doesn't
 *     get re-parsed on every call. (Cheap, but the test suite calls
 *     renderPdf hundreds of times.)
 *   - It exposes a `reset()` hook so tests can drop memoized state
 *     between cases after mutating process.env.
 *
 * NOT memoized: the result of a render. Cache yes, result no — the
 * renderer always re-checks the cache; the cache is fast.
 */

import 'server-only';

import { getPdfEnv } from './env';
import { createProvider, type PdfProvider } from './provider';
import { createCache, type PdfCache } from './cache';
import type {
  ProviderName,
  RenderInput,
  RenderOptions,
  RenderResult
} from './types';

class Renderer {
  private provider: PdfProvider | null = null;
  private cache: PdfCache | null = null;
  private lastEnvKey: string | null = null;

  /** Build (or rebuild) the provider and cache from the current env. */
  private ensureStack(): { provider: PdfProvider; cache: PdfCache; providerName: ProviderName } {
    const env = getPdfEnv();
    // Re-parse env only if the vars that affect the stack have changed.
    // Cheap key — concatenates the values we actually depend on.
    const envKey = [
      env.PDF_PROVIDER,
      env.BROWSERLESS_TOKEN ?? '',
      env.BROWSERLESS_REGION,
      env.PDF_CACHE_DIR,
      env.PDF_CACHE_DISABLED
    ].join('|');
    if (this.provider && this.cache && this.lastEnvKey === envKey) {
      return { provider: this.provider, cache: this.cache, providerName: this.provider.name };
    }
    this.provider = createProvider(env);
    this.cache = createCache(env.PDF_CACHE_DIR, env.PDF_CACHE_DISABLED);
    this.lastEnvKey = envKey;
    return { provider: this.provider, cache: this.cache, providerName: this.provider.name };
  }

  /**
   * Render HTML to a PDF. Pure with respect to telemetry — we don't know
   * the per-call `userId`/`resumeId`/`templateId`, so the caller (route
   * handler or Server Action) is responsible for emitting the
   * `pdf_rendered` PostHog event. See `telemetry.ts` for the shape.
   */
  async render(input: RenderInput): Promise<RenderResult> {
    const startedAt = Date.now();

    // ── Validate ────────────────────────────────────────────────────────
    if (!input || typeof input.html !== 'string' || input.html.length === 0) {
      return {
        ok: false,
        code: 'INVALID_INPUT',
        message: 'renderPdf requires a non-empty `html` string.'
      };
    }
    if (input.html.length > 5_000_000) {
      // 5 MB HTML → almost certainly a mistake (a multi-page resume
      // rarely exceeds 50 KB). Reject loudly instead of letting the
      // provider bill us for a 5 MB upload.
      return {
        ok: false,
        code: 'INVALID_INPUT',
        message: `HTML is ${input.html.length} bytes; the hard cap is 5 MB.`
      };
    }
    const options = withDefaults(input.options);

    // ── Resolve provider + cache ────────────────────────────────────────
    let stack: { provider: PdfProvider; cache: PdfCache; providerName: ProviderName };
    try {
      stack = this.ensureStack();
    } catch (err) {
      return {
        ok: false,
        code: 'UNKNOWN',
        message: err instanceof Error ? err.message : 'env setup failed'
      };
    }

    // ── Cache lookup ────────────────────────────────────────────────────
    // Provider is part of the cache key so a switch (stub → browserless)
    // can't return a stub from cache as if it were a real render.
    const cached = await this.safeGet(stack.cache, input, stack.providerName);
    if (cached) {
      return {
        ok: true,
        pdf: cached,
        bytes: cached.length,
        durationMs: Date.now() - startedAt,
        cacheHit: true,
        provider: stack.providerName
      };
    }

    // ── Provider call ───────────────────────────────────────────────────
    const result = await stack.provider.render(input.html, options);
    const durationMs = Date.now() - startedAt;

    if (!result.ok) {
      return {
        ok: false,
        code: providerCodeToRenderCode(result.code),
        message: result.message
      };
    }

    // ── Store in cache (best effort) ────────────────────────────────────
    await this.safePut(stack.cache, input, result.pdf, stack.providerName);

    return {
      ok: true,
      pdf: result.pdf,
      bytes: result.pdf.length,
      durationMs,
      cacheHit: false,
      provider: stack.providerName
    };
  }

  getProviderName(): ProviderName {
    // Diagnostics endpoint — must not throw if env is broken. Surface
    // 'unknown' so the caller can render "PDF render: misconfigured"
    // instead of crashing the route.
    try {
      return this.ensureStack().providerName;
    } catch {
      return 'unknown';
    }
  }

  /** Test-only: drop memoized provider + cache. */
  reset(): void {
    this.provider = null;
    this.cache = null;
    this.lastEnvKey = null;
  }

  // ─── helpers ──────────────────────────────────────────────────────────

  private async safeGet(
    cache: PdfCache,
    input: RenderInput,
    provider: ProviderName
  ): Promise<Buffer | null> {
    try {
      return await cache.get(input, provider);
    } catch (err) {
      // Cache failures must not fail the render. Log and continue.
      console.warn(
        '[pdf-render] cache get failed:',
        err instanceof Error ? err.message : err
      );
      return null;
    }
  }

  private async safePut(
    cache: PdfCache,
    input: RenderInput,
    pdf: Buffer,
    provider: ProviderName
  ): Promise<void> {
    try {
      await cache.put(input, pdf, provider);
    } catch (err) {
      // Symmetric with safeGet. Cache put failures are already swallowed
      // inside FileSystemCache.put; this is belt-and-suspenders.
      console.warn(
        '[pdf-render] cache put failed:',
        err instanceof Error ? err.message : err
      );
    }
  }
}

// ─── Internal helpers (not exported) ─────────────────────────────────────

/** Default options. Mirrors `hash.ts` so the cache key matches the render. */
function withDefaults(options?: RenderOptions): Required<RenderOptions> {
  return {
    format: options?.format ?? 'letter',
    landscape: options?.landscape ?? false,
    printBackground: options?.printBackground ?? true,
    marginMm: options?.marginMm ?? 10
  };
}

/** Map provider error codes → renderer error codes. Mostly 1:1 except
 *  the renderer collapses 'NETWORK' and 'INVALID_HTML' into
 *  'PROVIDER_UNAVAILABLE' so the public surface is small. */
function providerCodeToRenderCode(
  code:
    | 'TIMEOUT'
    | 'UPSTREAM_4XX'
    | 'UPSTREAM_5XX'
    | 'NETWORK'
    | 'INVALID_HTML'
    | 'UNKNOWN'
): 'PROVIDER_UNAVAILABLE' | 'TIMEOUT' | 'UPSTREAM_4XX' | 'UPSTREAM_5XX' | 'UNKNOWN' {
  switch (code) {
    case 'TIMEOUT':
      return 'TIMEOUT';
    case 'UPSTREAM_4XX':
      return 'UPSTREAM_4XX';
    case 'UPSTREAM_5XX':
      return 'UPSTREAM_5XX';
    case 'NETWORK':
    case 'INVALID_HTML':
      return 'PROVIDER_UNAVAILABLE';
    case 'UNKNOWN':
      return 'UNKNOWN';
  }
}

export const renderer = new Renderer();
