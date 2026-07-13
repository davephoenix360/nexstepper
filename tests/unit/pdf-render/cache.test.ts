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

describe('FileSystemCache', () => {
  it('returns null on miss', async () => {
    const cache = new FileSystemCache(tempDir);
    expect(await cache.get(input)).toBeNull();
  });

  it('returns the stored bytes on hit', async () => {
    const cache = new FileSystemCache(tempDir);
    const pdf = Buffer.from('%PDF-1.4 fake');
    await cache.put(input, pdf);
    const got = await cache.get(input);
    expect(got?.equals(pdf)).toBe(true);
  });

  it('isolates entries by their hash (different inputs → different files)', async () => {
    const cache = new FileSystemCache(tempDir);
    const a = Buffer.from('A');
    const b = Buffer.from('B');
    await cache.put({ html: '<a/>' }, a);
    await cache.put({ html: '<b/>' }, b);
    expect((await cache.get({ html: '<a/>' }))?.equals(a)).toBe(true);
    expect((await cache.get({ html: '<b/>' }))?.equals(b)).toBe(true);
  });

  it('clear() empties the cache directory', async () => {
    const cache = new FileSystemCache(tempDir);
    await cache.put({ html: '<a/>' }, Buffer.from('A'));
    await cache.put({ html: '<b/>' }, Buffer.from('B'));
    await cache.clear();
    expect(await cache.get({ html: '<a/>' })).toBeNull();
    expect(await cache.get({ html: '<b/>' })).toBeNull();
  });
});

describe('NullCache', () => {
  it('always misses', async () => {
    const cache = new NullCache();
    expect(await cache.get(input)).toBeNull();
  });

  it('put is a no-op (no throw, no state)', async () => {
    const cache = new NullCache();
    await cache.put(input, Buffer.from('whatever'));
    expect(await cache.get(input)).toBeNull();
  });

  it('clear is a no-op', async () => {
    const cache = new NullCache();
    await expect(cache.clear()).resolves.toBeUndefined();
  });
});
