/**
 * PDF provider abstraction.
 *
 * `PdfProvider` is the contract every render backend implements. Swapping
 * vendors (Browserless → Cloudflare / DocRaptor / Gotenberg) is one new
 * class file + one new case in the factory below.
 *
 * ─── Vendor switch-when matrix (live in code, see `factory()` below) ───
 *
 *   'stub'         — Deterministic fake. Use in tests and local dev without
 *                    a real provider. Never set this in prod.
 *   'browserless'  — Headless Chromium over REST. Picked for launch.
 *                    Free tier 1k units/mo, $25/mo for 20k units.
 *                    SOC 2 Type II, GDPR, BAA + DPA available.
 *                    Switch away when:
 *                      - We move hosting to Cloudflare Workers/Pages.
 *                        → use Cloudflare Browser Rendering (same API shape,
 *                          just different endpoint + auth).
 *                      - Monthly API bill crosses ~$50/mo.
 *                        → evaluate Gotenberg self-host (Fly.io, ~$30/mo
 *                          infra + ops time). We are NOT there yet.
 *                      - A future feature needs true CSS Paged Media
 *                        (footnotes, complex page breaks Chromium can't do).
 *                        → evaluate DocRaptor (Prince engine, expensive).
 *                      - A regulated-industry sale (HIPAA) lands.
 *                        → DocRaptor has a one-click HIPAA mode. Free on
 *                          every paid plan.
 *                      - We add a "designers edit templates in browser"
 *                        feature in Phase 4+.
 *                        → evaluate PDF4.dev (Handlebars + visual editor)
 *                          as a complement, not a replacement.
 *
 * The rest of the renderer doesn't know who's underneath. The discriminated
 * `ProviderResult` keeps the failure shape stable so callers don't care
 * which vendor errored.
 */

import 'server-only';

import { StubProvider } from './stub-provider';

import type { ProviderName, RenderOptions } from './types';

/** Successful render. The Buffer is the raw PDF bytes. */
export type ProviderSuccess = {
  ok: true;
  pdf: Buffer;
  /** Wall-clock duration the provider reported (or we measured). */
  durationMs: number;
};

/** Failed render. Code is stable across vendors; message is the upstream
 *  detail for logs. */
export type ProviderFailure = {
  ok: false;
  code:
    | 'TIMEOUT'
    | 'UPSTREAM_4XX'
    | 'UPSTREAM_5XX'
    | 'NETWORK'
    | 'INVALID_HTML'
    | 'UNKNOWN';
  message: string;
  /** For 4xx, the upstream status code — helps debug auth/wrong-format issues. */
  statusCode?: number;
};

export type ProviderResult = ProviderSuccess | ProviderFailure;

/** Common contract every provider implements. */
export interface PdfProvider {
  readonly name: ProviderName;
  render(html: string, options: Required<RenderOptions>): Promise<ProviderResult>;
}

// ─── Browserless ───────────────────────────────────────────────────────────

/**
 * Browserless.io REST API. Docs: https://docs.browserless.io/rest-apis/pdf-api
 *
 * Auth: `?token=...` query parameter. We send HTML (not URL) so the
 * template's data never leaves our infra except for the render call.
 * Response is `application/pdf` binary.
 */
class BrowserlessProvider implements PdfProvider {
  readonly name = 'browserless' as const;

  constructor(
    private readonly token: string,
    private readonly region: string,
    private readonly timeoutMs: number
  ) {}

  async render(
    html: string,
    options: Required<RenderOptions>
  ): Promise<ProviderResult> {
    const url = `https://${this.region}.browserless.io/pdf?token=${this.token}`;
    const startedAt = Date.now();

    // Map our neutral options to Puppeteer page.pdf() options.
    // Reference: https://pptr.dev/api/puppeteer.page.pdf
    const pdfOptions = {
      format: options.format === 'a4' ? 'A4' : 'Letter',
      landscape: options.landscape,
      printBackground: options.printBackground,
      margin: {
        top: `${options.marginMm}mm`,
        bottom: `${options.marginMm}mm`,
        left: `${options.marginMm}mm`,
        right: `${options.marginMm}mm`
      },
      // We don't want a Chromium-rendered header/footer — the template
      // is self-contained. (Browserless lets you supply HTML templates here
      // if a future feature needs page numbers etc.)
      displayHeaderFooter: false
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html, options: pdfOptions }),
        signal: controller.signal
      });

      if (!response.ok) {
        // 4xx: client error (bad HTML, bad token, bad options). 5xx: their fault.
        // Body may include a JSON error message; we try to extract it but
        // don't fail if the body isn't JSON.
        const body = await response.text().catch(() => '');
        return {
          ok: false,
          code: response.status >= 500 ? 'UPSTREAM_5XX' : 'UPSTREAM_4XX',
          message: `Browserless ${response.status}: ${body.slice(0, 200)}`,
          statusCode: response.status
        };
      }

      const arrayBuffer = await response.arrayBuffer();
      return {
        ok: true,
        pdf: Buffer.from(arrayBuffer),
        durationMs: Date.now() - startedAt
      };
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return {
          ok: false,
          code: 'TIMEOUT',
          message: `Browserless render exceeded ${this.timeoutMs}ms`
        };
      }
      return {
        ok: false,
        code: 'NETWORK',
        message: err instanceof Error ? err.message : 'Unknown network error'
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

// ─── Factory ───────────────────────────────────────────────────────────────

/**
 * Construct the provider for the current env. Called by the orchestrator
 * on every render (cheap; no I/O) so env-var changes mid-process are
 * honored without a restart. Tests rely on this — set PDF_PROVIDER=stub
 * in vitest, swap in mock providers freely.
 *
 * Add a new vendor: import the class above, add a `case` here, done.
 */
export function createProvider(env: ReturnType<typeof import('./env').getPdfEnv>): PdfProvider {
  switch (env.PDF_PROVIDER) {
    case 'stub': {
      // Static import is fine — Next.js's webpack bundler tree-shakes
      // unused exports in prod. The stub-provider file is tiny (~80 lines).
      return new StubProvider();
    }
    case 'browserless':
      return new BrowserlessProvider(
        env.BROWSERLESS_TOKEN!,
        env.BROWSERLESS_REGION,
        env.PDF_RENDER_TIMEOUT_MS
      );
    default: {
      // Exhaustiveness check — TS will error if a new ProviderName is added
      // without updating this switch.
      const _exhaustive: never = env.PDF_PROVIDER;
      throw new Error(`Unknown PDF_PROVIDER: ${String(_exhaustive)}`);
    }
  }
}
