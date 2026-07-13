/**
 * PDF render adapter — public API.
 *
 * Phase 2.2 scaffold. The render pipeline is:
 *
 *   1. `renderPdf(input)` is the only export callers need.
 *   2. It hashes the input, checks the cache, calls the provider if needed,
 *      stores the result, emits a telemetry event, and returns the PDF.
 *   3. The provider is selected by `PDF_PROVIDER` env var. 'stub' is the
 *      deterministic fake used in tests; 'browserless' is the production
 *      path (https://browserless.io).
 *
 * Provider-agnostic: swapping vendors is one file change in `provider.ts`
 * + one env var. See the comment block in `provider.ts` for the full
 * swap-when matrix (Browserless → Cloudflare / DocRaptor / Gotenberg).
 *
 * Phase 2.3 will add a higher-level entry point that takes
 * `{ resumeId, templateId, data }` and walks through the template registry
 * to produce the HTML before calling the renderer. For now, callers pass
 * raw HTML — good enough for the smoke test and for any internal use.
 */

import 'server-only';

import type { RenderInput, RenderResult, ProviderName } from './types';
export type { RenderInput, RenderResult, RenderOptions, ProviderName } from './types';

import { renderer } from './renderer';

/**
 * Render HTML to a PDF. Provider-agnostic. Returns a discriminated union
 * — see `RenderResult` for the shape.
 *
 * @example
 *   const result = await renderPdf({
 *     html: '<h1>Hello</h1>',
 *     options: { format: 'letter' }
 *   });
 *   if (result.ok) {
 *     // result.pdf is a Buffer, result.bytes is its length
 *   } else {
 *     // result.code, result.message
 *   }
 */
export async function renderPdf(input: RenderInput): Promise<RenderResult> {
  return renderer.render(input);
}

/** Reset the renderer (used by tests to drop memoized state). */
export function _resetForTests(): void {
  renderer.reset();
}

/** Which provider is currently selected. Useful for diagnostics endpoints. */
export function getActiveProvider(): ProviderName {
  return renderer.getProviderName();
}
