import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { _resetForTests, renderPdf, getActiveProvider } from '@/lib/pdf-render';

/**
 * Renderer integration tests. The orchestrator is exercised end-to-end
 * with the StubProvider (env default) and the FileSystemCache pointed
 * at a temp dir.
 *
 * The tests verify the contract that the rest of the app relies on:
 *   - renderPdf always returns a discriminated union
 *   - cacheHit is true on the second call with the same input
 *   - validation errors come back as { ok: false, code: 'INVALID_INPUT' }
 *   - provider failures come back as { ok: false, code: '...' }
 */

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'pdf-render-test-'));
  process.env.PDF_PROVIDER = 'stub';
  process.env.PDF_CACHE_DIR = tempDir;
  process.env.PDF_CACHE_DISABLED = 'false';
  process.env.POSTHOG_KEY = ''; // make telemetry a no-op
  _resetForTests();
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
  _resetForTests();
});

describe('renderPdf', () => {
  it('uses the stub provider by default', () => {
    expect(getActiveProvider()).toBe('stub');
  });

  it('returns the PDF Buffer on success', async () => {
    const result = await renderPdf({ html: '<h1>hi</h1>' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Buffer.isBuffer(result.pdf)).toBe(true);
      expect(result.bytes).toBe(result.pdf.length);
      expect(result.provider).toBe('stub');
      expect(result.cacheHit).toBe(false);
    }
  });

  it('hits the cache on the second call with the same input', async () => {
    const first = await renderPdf({ html: '<h1>cached</h1>' });
    expect(first.ok && first.cacheHit).toBe(false);

    const second = await renderPdf({ html: '<h1>cached</h1>' });
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.cacheHit).toBe(true);
      // Same bytes come back from cache.
      if (first.ok) {
        expect(second.pdf.equals(first.pdf)).toBe(true);
      }
    }
  });

  it('produces different cache entries for different HTML', async () => {
    const a = await renderPdf({ html: '<p>A</p>' });
    const b = await renderPdf({ html: '<p>B</p>' });
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(a.cacheHit).toBe(false);
      expect(b.cacheHit).toBe(false);
      expect(a.pdf.equals(b.pdf)).toBe(false);
    }
  });

  it('rejects empty HTML with INVALID_INPUT', async () => {
    const result = await renderPdf({ html: '' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('INVALID_INPUT');
    }
  });

  it('rejects HTML over the 5 MB cap with INVALID_INPUT', async () => {
    const huge = 'x'.repeat(5_000_001);
    const result = await renderPdf({ html: huge });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('INVALID_INPUT');
    }
  });

  it('passes options through and they change the cache key', async () => {
    const a = await renderPdf({
      html: '<h1>same</h1>',
      options: { format: 'letter' }
    });
    const b = await renderPdf({
      html: '<h1>same</h1>',
      options: { format: 'a4' }
    });
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      // Both are first-time renders → both cache misses.
      expect(a.cacheHit).toBe(false);
      expect(b.cacheHit).toBe(false);
      // The hash differs because options differ; subsequent identical
      // calls would hit the cache for *their* entry.
      const aAgain = await renderPdf({
        html: '<h1>same</h1>',
        options: { format: 'letter' }
      });
      expect(aAgain.ok && aAgain.cacheHit).toBe(true);
    }
  });
});
