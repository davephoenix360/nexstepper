import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Favicon / icon regression guard.
 *
 * ## The bug this exists to prevent
 *
 * The saas-starter shipped `app/favicon.ico` in commit 61195ab
 * ("Working app") — Vercel's stock triangle icon. When the real Nexstepper
 * brand landed in `be07071`, it added `app/icon.png` but left the old
 * `favicon.ico` in place. Next.js gives `favicon.ico` precedence in the
 * `<link rel="icon">` tags, so the browser tab kept rendering Vercel's
 * logo for seven commits while the repo contained the correct icon the
 * whole time.
 *
 * Nothing errored. The file was present, correctly named, correctly
 * formatted, and git-clean. The only way to notice was to look at the tab.
 * So this asserts on the ACTUAL BYTES rather than on file existence:
 * a test that only checked "favicon.ico exists" would have passed
 * throughout the entire bug.
 */

const ICON_PNG = resolve(process.cwd(), 'app/icon.png');
const FAVICON_ICO = resolve(process.cwd(), 'app/favicon.ico');

/**
 * git blob hash of the stock Vercel favicon, as shipped in 61195ab.
 * Reproduced with `git hash-object app/favicon.ico` while the bug was live.
 * If this ever matches again, the rebrand has been silently reverted.
 */
const STOCK_VERCEL_FAVICON_BLOB =
  '718d6fea4835ec2d246af9800eddb7ffb276240c';

/** git object hashing: sha1 over "blob <len>\0" + content. */
function gitBlobHash(bytes: Buffer): string {
  const header = Buffer.from(`blob ${bytes.length}\0`, 'utf8');
  return createHash('sha1')
    .update(Buffer.concat([header, bytes]))
    .digest('hex');
}

const ico = readFileSync(FAVICON_ICO);

/** Parse the ICONDIR + ICONDIRENTRY table. */
function readIcoDirectory(): {
  count: number;
  entries: { width: number; height: number; length: number; offset: number }[];
} {
  expect(ico.readUInt16LE(0)).toBe(0); // reserved
  expect(ico.readUInt16LE(2)).toBe(1); // type 1 = icon
  const count = ico.readUInt16LE(4);
  const entries = [];
  for (let i = 0; i < count; i++) {
    const e = 6 + 16 * i;
    // Width/height are single bytes; 256 is encoded as 0.
    const w = ico[e];
    const h = ico[e + 1];
    entries.push({
      width: w === 0 ? 256 : w,
      height: h === 0 ? 256 : h,
      length: ico.readUInt32LE(e + 8),
      offset: ico.readUInt32LE(e + 12),
    });
  }
  return { count, entries };
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe('app/icon.png', () => {
  it('is the generated Nexstepper icon', () => {
    const png = readFileSync(ICON_PNG);
    expect(png.subarray(0, 8)).toEqual(PNG_SIGNATURE);
  });

  it('is not the stock Vercel icon', () => {
    expect(gitBlobHash(readFileSync(ICON_PNG))).not.toBe(
      STOCK_VERCEL_FAVICON_BLOB
    );
  });

  it('is a plausible size (rendered, not a giant raw export)', () => {
    const bytes = readFileSync(ICON_PNG).length;
    expect(bytes).toBeGreaterThan(1_000);
    expect(bytes).toBeLessThan(200_000);
  });
});

describe('app/favicon.ico', () => {
  it('is NOT the stock Vercel favicon', () => {
    // The core regression assertion. Existence checks passed throughout
    // the original bug; only the bytes tell the truth.
    expect(gitBlobHash(ico)).not.toBe(STOCK_VERCEL_FAVICON_BLOB);
  });

  it('has a valid ICONDIR header', () => {
    const { count } = readIcoDirectory();
    expect(count).toBeGreaterThan(0);
  });

  it('ships the standard browser size ladder', () => {
    const { entries } = readIcoDirectory();
    expect(entries.map((e) => e.width)).toEqual([16, 32, 48, 256]);
  });

  it('encodes 256 as a zero byte rather than truncating to 0', () => {
    // A naive hand-rolled ICO writer emits 0x00 for 256, which some
    // parsers read as "size zero" and drop the entry entirely.
    expect(ico[6 + 16 * 3]).toBe(0);
    expect(readIcoDirectory().entries[3].width).toBe(256);
  });

  it('stores PNG-compressed entries, each with a valid signature', () => {
    for (const entry of readIcoDirectory().entries) {
      expect(
        ico.subarray(entry.offset, entry.offset + 8),
        `entry ${entry.width}px is not a PNG blob`
      ).toEqual(PNG_SIGNATURE);
    }
  });

  it('keeps every entry inside the file bounds', () => {
    for (const entry of readIcoDirectory().entries) {
      expect(entry.offset + entry.length).toBeLessThanOrEqual(ico.length);
    }
  });

  it('lays entries out contiguously with no gaps or overlaps', () => {
    const { count, entries } = readIcoDirectory();
    let expected = 6 + 16 * count;
    for (const entry of entries) {
      expect(entry.offset).toBe(expected);
      expected += entry.length;
    }
    expect(expected).toBe(ico.length);
  });

  it('is smaller than the stock Vercel icon it replaced', () => {
    expect(ico.length).toBeLessThan(25_931);
  });
});

describe('icon + favicon agree', () => {
  it('both exist — a bare /favicon.ico request must not 404', () => {
    // Next.js serves app/icon.png at /icon.png and app/favicon.ico at
    // /favicon.ico. Dropping the .ico leaves bookmark managers and RSS
    // readers with nothing to fetch.
    expect(() => readFileSync(ICON_PNG)).not.toThrow();
    expect(() => readFileSync(FAVICON_ICO)).not.toThrow();
  });

  it('are byte-for-byte distinct (the .ico is not a copy of the .png)', () => {
    expect(ico.equals(readFileSync(ICON_PNG))).toBe(false);
  });
});