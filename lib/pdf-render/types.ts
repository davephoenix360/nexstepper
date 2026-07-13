/**
 * Shared types for the PDF render adapter.
 *
 * Phase 2.2: minimum set needed to wire the orchestrator, provider, cache,
 * and telemetry together. Phase 2.3 will add a higher-level `RenderResumeInput`
 * that takes `{ resumeId, templateId, data }` and walks through the template
 * registry to produce the HTML before calling the renderer.
 */

/** Provider names known to the orchestrator. Add a new one here + in
 *  `provider.ts` when adopting a new vendor. `'unknown'` is a defensive
 *  sentinel returned by `getProviderName()` when env parsing fails —
 *  callers should treat it as "env is misconfigured, render disabled". */
export type ProviderName = 'stub' | 'browserless' | 'unknown';

/** Options that affect the rendered PDF output. These are forwarded to the
 *  provider's API; not all providers honor every option (Browserless maps
 *  them to Puppeteer's `page.pdf()` options). */
export type RenderOptions = {
  /** Page format. 'letter' = US (8.5"x11"), 'a4' = international. */
  format?: 'letter' | 'a4';
  /** Landscape orientation. */
  landscape?: boolean;
  /** Whether to render CSS backgrounds. Templates often need this on. */
  printBackground?: boolean;
  /** Page margin in millimeters. Defaults to ~10mm (matches globals.css). */
  marginMm?: number;
};

/** Input to the renderer. `html` is the full HTML document to render.
 *  Use `wrapHtml()` from `./html-shell` to turn a fragment into a doc. */
export type RenderInput = {
  html: string;
  options?: RenderOptions;
};

/** Discriminated union result. See AGENTS.md — every public action returns
 *  this shape; clients narrow on `ok`. */
export type RenderResult =
  | {
      ok: true;
      /** The PDF as a Node Buffer. */
      pdf: Buffer;
      /** Convenience: `pdf.length`. Set even on cache hit so callers don't
       *  have to reach into the buffer to size. */
      bytes: number;
      /** Wall-clock time the renderer spent on this call (including cache
       *  lookup, provider call, and store). */
      durationMs: number;
      /** True if the PDF came from cache — no provider was billed. */
      cacheHit: boolean;
      /** Which provider produced (or would have produced) this PDF. */
      provider: ProviderName;
    }
  | {
      ok: false;
      /** Stable error code for callers to switch on. */
      code:
        | 'INVALID_INPUT'
        | 'PROVIDER_UNAVAILABLE'
        | 'TIMEOUT'
        | 'UPSTREAM_4XX'
        | 'UPSTREAM_5XX'
        | 'CACHE_ERROR'
        | 'UNKNOWN';
      message: string;
    };
