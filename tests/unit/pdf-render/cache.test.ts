import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { FileSystemCache, NullCache } from '@/lib/pdf-render/cache';

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'pdf-cache-test-'));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

const input = { html: '<h1>hi</h1>' };
const provider = 'stub' as const;

describe('FileSystemCache', () => {
  it('returns null on miss', async () => {
    const cache = new FileSystemCache(tempDir);
    expect(await cache.get(input, provider)).toBeNull();
  });

  it('returns the stored bytes on hit', async () => {
    const cache = new FileSystemCache(tempDir);
    const pdf = Buffer.from('%PDF-1.4 fake');
    await cache.put(input, pdf, provider);
    const got = await cache.get(input, provider);
    expect(got?.equals(pdf)).toBe(true);
  });

  it('isolates entries by their hash (different inputs → different files)', async () => {
    const cache = new FileSystemCache(tempDir);
    const a = Buffer.from('A');
    const b = Buffer.from('B');
    await cache.put({ html: '<a/>' }, a, provider);
    await cache.put({ html: '<b/>' }, b, provider);
    expect((await cache.get({ html: '<a/>' }, provider))?.equals(a)).toBe(true);
    expect((await cache.get({ html: '<b/>' }, provider))?.equals(b)).toBe(true);
  });

  it('isolates entries by provider (stub hit does not satisfy browserless lookup)', async () => {
    // A real bug we hit during smoke testing: a cache populated by the
    // stub provider (deterministic fake) was being returned as a hit
    // after the user switched to browserless — same input, different
    // provider, completely different output. The cache key now includes
    // the provider so this can't happen.
    const cache = new FileSystemCache(tempDir);
    const stub = Buffer.from('STUB_OUTPUT');
    await cache.put(input, stub, 'stub');
    const stubHit = await cache.get(input, 'stub');
    expect(stubHit?.equals(stub)).toBe(true);
    expect(await cache.get(input, 'browserless')).toBeNull();
  });

  it('clear() empties the cache directory', async () => {
    const cache = new FileSystemCache(tempDir);
    await cache.put({ html: '<a/>' }, Buffer.from('A'), provider);
    await cache.put({ html: '<b/>' }, Buffer.from('B'), provider);
    await cache.clear();
    expect(await cache.get({ html: '<a/>' }, provider)).toBeNull();
    expect(await cache.get({ html: '<b/>' }, provider)).toBeNull();
  });
});

describe('NullCache', () => {
  it('always misses', async () => {
    const cache = new NullCache();
    expect(await cache.get(input, provider)).toBeNull();
  });

  it('put is a no-op (no throw, no state)', async () => {
    const cache = new NullCache();
    await cache.put(input, Buffer.from('whatever'), provider);
    expect(await cache.get(input, provider)).toBeNull();
  });

  it('clear is a no-op', async () => {
    const cache = new NullCache();
    await expect(cache.clear()).resolves.toBeUndefined();
  });
});
