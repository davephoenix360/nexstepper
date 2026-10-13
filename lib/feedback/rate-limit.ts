/**
 * Lightweight per-IP rate limiter for the public feedback form.
 *
 * Why not Upstash / Vercel KV: the limit is per-IP per-minute and
 * we already have a Postgres connection. A 1-row write is cheaper
 * than a new dependency + a separate billing line. If the limiter
 * ever needs to be globally distributed (it won't, until we're
 * multi-region), this is the one piece that swaps to a KV store.
 *
 * Why per-IP rather than per-user: anonymous visitors are the
 * majority of footer submissions; per-user would do nothing for them.
 * Per-IP is best-effort (proxies / NAT compress many users behind one
 * IP) but it raises the cost of "submit 1000 spammy forms" to the
 * point where an attacker has to use a real botnet. Combined with
 * the URL-count and message-length caps, the public form is
 * unfriendly to abuse without being hostile to legitimate users.
 */
import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/drizzle';

/** Default cap: 5 submissions per IP per minute. */
export const FEEDBACK_RATE_LIMIT_PER_MINUTE = 5;

/**
 * Returns the count of feedback rows from this IP in the last
 * `windowSeconds` seconds. Uses a server-side timestamp comparison
 * so the limiter survives clock skew between Node and the DB.
 */
export async function countRecentByIp(
  ip: string,
  windowSeconds: number
): Promise<number> {
  // `db.execute<T>()` against postgres-js returns a `RowList<T[]>`,
  // which is the array itself (intersected with `Iterable<T>` +
  // `ResultQueryMeta`) — so we index it directly, not `.rows[0]`.
  // (Confusingly, `node-postgres`-style drivers return `{ rows: [...] }`,
  // but the project uses `postgres-js` end-to-end.)
  const rows = await db.execute<{ count: string }>(sql`
    SELECT COUNT(*)::text AS count
    FROM feedback
    WHERE ip_address = ${ip}
      AND created_at > now() - (${windowSeconds}::int * interval '1 second')
  `);
  const first = rows[0];
  if (!first) return 0;
  return Number.parseInt(first.count, 10) || 0;
}

/**
 * Returns `true` when the IP is under the limit, `false` when it
 * should be throttled. The caller maps `false` to a user-facing
 * "you're sending these too quickly, try again in a minute" message.
 */
export async function ipUnderRateLimit(
  ip: string | null,
  limit: number = FEEDBACK_RATE_LIMIT_PER_MINUTE
): Promise<boolean> {
  if (!ip) return true; // No IP captured — fail open; abuse is rare in this state.
  const recent = await countRecentByIp(ip, 60);
  return recent < limit;
}
