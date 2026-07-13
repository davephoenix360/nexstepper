import { describe, expect, it } from 'vitest';

import { StubProvider } from '@/lib/pdf-render/stub-provider';

const opts = {
  format: 'letter' as const,
  landscape: false,
  printBackground: true,
  marginMm: 10
};

describe('StubProvider', () => {
  it('reports its name as "stub"', () => {
    expect(new StubProvider().name).toBe('stub');
  });

  it('returns a Buffer that starts with the PDF magic and ends with %%EOF', async () => {
    const p = new StubProvider({ simulatedDurationMs: 0 });
    const result = await p.render('<h1>hi</h1>', opts);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const text = result.pdf.toString('utf8');
      expect(text.startsWith('%PDF-1.4')).toBe(true);
      expect(text).toContain('%%EOF');
    }
  });

  it('produces identical bytes for identical HTML (deterministic)', async () => {
    const p = new StubProvider({ simulatedDurationMs: 0 });
    const a = await p.render('<h1>hi</h1>', opts);
    const b = await p.render('<h1>hi</h1>', opts);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(a.pdf.equals(b.pdf)).toBe(true);
    }
  });

  it('produces different bytes for different HTML', async () => {
    const p = new StubProvider({ simulatedDurationMs: 0 });
    const a = await p.render('<h1>hi</h1>', opts);
    const b = await p.render('<h1>bye</h1>', opts);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(a.pdf.equals(b.pdf)).toBe(false);
    }
  });

  it('respects the configured simulated duration', async () => {
    const p = new StubProvider({ simulatedDurationMs: 50 });
    const start = Date.now();
    const result = await p.render('<h1>hi</h1>', opts);
    const elapsed = Date.now() - start;
    expect(result.ok).toBe(true);
    expect(elapsed).toBeGreaterThanOrEqual(45); // 5ms tolerance for CI
  });

  it('returns the override result when configured (failure injection)', async () => {
    const p = new StubProvider({
      override: {
        ok: false,
        code: 'UPSTREAM_5XX',
        message: 'simulated outage',
        statusCode: 503
      }
    });
    const result = await p.render('<h1>hi</h1>', opts);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('UPSTREAM_5XX');
      expect(result.message).toBe('simulated outage');
    }
  });
});
