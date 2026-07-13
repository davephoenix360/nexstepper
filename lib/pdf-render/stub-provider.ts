/**
 * Stub provider — deterministic, no-network fake for tests and local dev.
 *
 * The "PDF" it returns is just the SHA-256 of the input HTML with a
 * 4-byte `%PDF-1.4` magic prefix and a `%%EOF` trailer so it parses
 * as a (tiny, useless) PDF. The point is to exercise the orchestrator
 * + cache + telemetry path without touching the real provider.
 *
 * Test assertions: any test that cares about the actual PDF bytes
 * should use the StubProvider. Anything that cares about the *shape*
 * of the result (cache hit, duration, telemetry event) can use it too.
 */

import 'server-only';

import { createHash } from 'node:crypto';

import type { PdfProvider, ProviderResult } from './provider';
import type { ProviderName, RenderOptions } from './types';

export class StubProvider implements PdfProvider {
  readonly name: ProviderName = 'stub';

  /** How long the fake render "takes". Tests assert against this. */
  private readonly simulatedDurationMs: number;

  /** Optional override for the response. Tests can use this to inject
   *  failures without monkey-patching. */
  private readonly override: ProviderResult | null;

  constructor(opts: { simulatedDurationMs?: number; override?: ProviderResult } = {}) {
    this.simulatedDurationMs = opts.simulatedDurationMs ?? 25;
    this.override = opts.override ?? null;
  }

  async render(
    html: string,
    _options: Required<RenderOptions>
  ): Promise<ProviderResult> {
    if (this.override) return this.override;

    // Simulate I/O latency so cache-hit/timing telemetry is meaningful.
    await new Promise((resolve) => setTimeout(resolve, this.simulatedDurationMs));

    const hash = createHash('sha256').update(html).digest('hex');
    // 4-byte PDF magic + 64 hex chars of hash + minimal trailer.
    // Not a real PDF — just stable bytes tests can assert on.
    const body = `%PDF-1.4\n${hash}\n%%EOF\n`;
    return {
      ok: true,
      pdf: Buffer.from(body, 'utf8'),
      durationMs: this.simulatedDurationMs
    };
  }
}
