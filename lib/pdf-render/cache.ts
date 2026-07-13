/**
 * PDF cache abstraction.
 *
 * Phase 2.2 ships a FileSystemCache. In dev/CI, the workspace's
 * `.cache/pdf-render/` directory persists between runs and the same
 * input gets a cache hit immediately. In Vercel production, the
 * filesystem is ephemeral so this cache effectively no-ops — Phase 3
 * will add a Vercel KV / Upstash Redis impl behind the same interface.
 *
 * Cache failures must NOT fail the render. If the disk is full or the
 * directory is unwritable, we log and continue. The render is the
 * product; caching is an optimization.
 */

import 'server-only';

import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import { hashInput } from './hash';
import type { RenderInput } from './types';

/** Read-through PDF cache. Implementations may be no-ops in prod (Vercel
 *  serverless) without breaking the contract. */
export interface PdfCache {
  /** Returns the cached PDF Buffer or null. */
  get(input: RenderInput): Promise<Buffer | null>;
  /** Stores a PDF Buffer. Throws only on programming errors, not I/O. */
  put(input: RenderInput, pdf: Buffer): Promise<void>;
  /** Used by tests to clear the cache between cases. No-op in prod. */
  clear(): Promise<void>;
}

const FILE_EXT = '.pdf';

/**
 * Disk-backed cache. One file per hash under `baseDir`. Atomic via the
 * rename-after-write pattern: write to `<hash>.pdf.tmp`, then rename to
 * `<hash>.pdf` so a concurrent reader never sees a partial file.
 */
export class FileSystemCache implements PdfCache {
  constructor(private readonly baseDir: string) {}

  private pathFor(input: RenderInput): string {
    // hashInput is collision-resistant; we don't namespace by anything else
    // because the (html, options) pair is the natural key.
    return join(this.baseDir, `${hashInput(input)}${FILE_EXT}`);
  }

  async get(input: RenderInput): Promise<Buffer | null> {
    const path = this.pathFor(input);
    try {
      return await readFile(path);
    } catch (err) {
      // ENOENT → not cached. Anything else is a real failure; surface
      // so the orchestrator can log + skip cache, not retry forever.
      if (isEnoent(err)) return null;
      throw err;
    }
  }

  async put(input: RenderInput, pdf: Buffer): Promise<void> {
    const finalPath = this.pathFor(input);
    // Per-call-unique tmp filename. Two concurrent put() calls for the
    // same input would otherwise write to the same `.tmp` path; the
    // winner of `writeFile` could interleave/truncate the loser's
    // bytes, then `rename` could promote a corrupted partial file into
    // the final cache slot. (pid + timestamp → effectively zero
    // collision window in any realistic concurrent-render scenario.)
    const tmpPath = `${finalPath}.${process.pid}.${Date.now()}.tmp`;
    try {
      await mkdir(dirname(finalPath), { recursive: true });
      await writeFile(tmpPath, pdf);
      await rename(tmpPath, finalPath);
    } catch (err) {
      // Cache write failed (disk full, permission denied). Log and move on.
      // The render is the source of truth; the cache is an optimization.
      console.warn(
        `[pdf-render] cache write failed for ${pathBase(finalPath)}:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  async clear(): Promise<void> {
    // Best-effort: readdir + unlink each. Tests use this; prod doesn't.
    try {
      const { readdir, unlink } = await import('node:fs/promises');
      const files = await readdir(this.baseDir).catch(() => []);
      await Promise.all(
        files
          .filter((f) => f.endsWith(FILE_EXT))
          .map((f) => unlink(join(this.baseDir, f)).catch(() => {}))
      );
    } catch {
      // Ignore — tests assert state, not logs.
    }
  }
}

/**
 * No-op cache. Used in Vercel prod (filesystem is ephemeral) until Phase 3
 * adds a real distributed cache. The orchestrator installs this when
 * `PDF_CACHE_DISABLED=true` or when the env says we're on a serverless
 * runtime.
 */
export class NullCache implements PdfCache {
  async get(_input: RenderInput): Promise<Buffer | null> {
    return null;
  }
  async put(_input: RenderInput, _pdf: Buffer): Promise<void> {
    // no-op
  }
  async clear(): Promise<void> {
    // no-op
  }
}

/** Build the right cache for the current runtime. Serverless → NullCache. */
export function createCache(
  baseDir: string,
  disabled: boolean
): PdfCache {
  if (disabled) return new NullCache();
  if (isServerless()) return new NullCache();
  return new FileSystemCache(resolve(baseDir));
}

/** True when running in a serverless environment where the FS is ephemeral.
 *  Detection is conservative — better to skip cache than to crash on write. */
function isServerless(): boolean {
  return Boolean(
    process.env.VERCEL ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.NETLIFY
  );
}

// ─── helpers ──────────────────────────────────────────────────────────────

function isEnoent(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === 'ENOENT'
  );
}

function pathBase(p: string): string {
  return p.split(/[\\/]/).pop() ?? p;
}
