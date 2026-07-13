/**
 * Content-hash utilities for the PDF cache.
 *
 * Goal: given a `(html, options)` pair, produce a stable cache key that
 * changes iff the rendered output would change. We want:
 *
 *   - Order-independent on object keys (so `{ a, b }` and `{ b, a }` hash equal).
 *   - Independent of irrelevant whitespace in the HTML.
 *   - Resistant to accidental key order swaps in options.
 *
 * Strategy: canonicalize to a JSON string with sorted keys, hash with SHA-256.
 * Returns a 64-char hex digest.
 */

import { createHash } from 'node:crypto';

import type { RenderInput, RenderOptions } from './types';

/**
 * Recursively sort object keys. Arrays preserve order (their ORDER is
 * semantically meaningful — e.g., work history, bullet lists). Functions,
 * undefined, and symbol values are dropped (they don't survive JSON anyway).
 */
function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      const v = obj[key];
      if (v === undefined) continue;
      sorted[key] = sortKeysDeep(v);
    }
    return sorted;
  }
  return value;
}

/**
 * Canonicalize an input to a stable string. Two inputs that would render
 * to the same PDF (modulo JSON key order) produce the same canonical string.
 */
export function canonicalize(input: RenderInput): string {
  // Normalize options — fill in defaults so missing keys don't change the hash.
  const opts: Required<RenderOptions> = {
    format: input.options?.format ?? 'letter',
    landscape: input.options?.landscape ?? false,
    printBackground: input.options?.printBackground ?? true,
    marginMm: input.options?.marginMm ?? 10
  };

  return JSON.stringify(sortKeysDeep({ html: input.html, options: opts }));
}

/**
 * SHA-256 of the canonicalized input. 64 hex chars.
 *
 * Used as the cache file name (`<hash>.pdf`) — collision-resistant, fixed
 * length, filesystem-safe.
 */
export function hashInput(input: RenderInput): string {
  return createHash('sha256').update(canonicalize(input)).digest('hex');
}
