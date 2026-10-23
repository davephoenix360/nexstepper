import { describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';

import { resumes } from '@/lib/db/schema';
import { deriveShareToken } from '@/lib/share/deterministic-token';

/**
 * Backfill legacy `resumes.share_token` values to the deterministic token.
 *
 * ## Why this exists
 *
 * `resumes.share_token` has held two different things:
 *
 *   - a 64-char SHA-256 hex digest (pre-Phase-2.5b)
 *   - a 22-char base64url HMAC token (today)
 *
 * The lookup has always been direct equality on the column, so BOTH
 * shapes are working URLs — but the route's input guard only accepted
 * the 22-char one, so every legacy row 404'd, and the owner-facing
 * action re-derived a token that could never equal a 64-char column
 * value. The code fix (`isAcceptedShareToken` + `selectShareToken`)
 * makes those links work again.
 *
 * This script is the DATA half: it rewrites the legacy rows so the
 * column holds the canonical derived token, which is what the design
 * says it should hold. Without it, those rows keep working only
 * because of the compatibility branch — and they would break if
 * `SHARE_LINK_SECRET` ever rotated, because a 64-char digest is not
 * derived from anything.
 *
 * ## Safety
 *
 * - **Skipped unless `BACKFILL_SHARE_TOKENS` is set**, so CI never
 *   touches a database.
 * - **Dry run unless `BACKFILL_SHARE_TOKENS=apply`.** The dry run
 *   prints what it WOULD change and changes nothing.
 * - Only rows whose stored token is not the canonical shape are
 *   touched. Rows that are already correct are left alone.
 * - It never prints a token. The report is resume id + old shape.
 *
 * ## Usage
 *
 *   node scripts/backfill-share-tokens.cjs           # dry run
 *   node scripts/backfill-share-tokens.cjs --apply   # write
 *
 * `POSTGRES_URL` and `SHARE_LINK_SECRET` must point at the target
 * environment. The prod secret lives in Vercel, not in a file:
 *
 *   vercel env pull .env.production.local
 *
 * (the script reads `.env.production.local` first, and honours an
 * already-set `POSTGRES_URL` / `SHARE_LINK_SECRET` in the
 * environment).
 */

const MODE = process.env.BACKFILL_SHARE_TOKENS;
const APPLY = MODE === 'apply';

const run = MODE === '1' || APPLY;

describe('share token backfill', () => {
  it.skipIf(!run)('rewrites legacy share tokens to the derived value', async () => {
    // The DRY RUN needs no secret: it reports which rows hold a
    // non-canonical token and what would change, without computing
    // the replacement. The secret is only required to actually
    // WRITE, because only the write needs the derived value.
    if (APPLY && !process.env.SHARE_LINK_SECRET) {
      throw new Error(
        'SHARE_LINK_SECRET is not set. The backfill must run with the secret of the environment it is fixing — pull it with `vercel env pull .env.production.local` or export it. Refusing to guess.'
      );
    }

    // Imported lazily, inside the test body: `lib/db/drizzle` opens
    // a connection at MODULE LOAD and throws when `POSTGRES_URL` is
    // missing. A static import would make an ordinary `pnpm vitest
    // run` on a machine (or CI runner) with no database fail to
    // collect this file, even though the test is skipped.
    const { db } = await import('@/lib/db/drizzle');

    const legacy = await db
      .select({
        id: resumes.id,
        name: resumes.name,
        token: resumes.shareToken,
        enabled: resumes.shareEnabled
      })
      .from(resumes)
      .where(
        sql`${resumes.shareToken} is not null and length(${resumes.shareToken}) <> 22`
      );

    const canonical = await db
      .select({ id: resumes.id })
      .from(resumes)
      .where(
        sql`${resumes.shareToken} is not null and length(${resumes.shareToken}) = 22`
      );

    console.log(
      `[backfill] mode=${APPLY ? 'APPLY' : 'DRY RUN'}  ` +
        `legacy=${legacy.length}  already-canonical=${canonical.length}`
    );

    if (legacy.length === 0) {
      console.log('[backfill] nothing to do');
      return;
    }

    for (const row of legacy) {
      const shape = row.token && row.token.length === 64 ? 'legacy-64' : 'other';
      console.log(
        `[backfill] resume ${row.id} (${row.name}) shareEnabled=${row.enabled} ` +
          `storedShape=${shape} -> canonical(22)` +
          (APPLY ? ' [writing]' : ' [dry run]')
      );

      if (!APPLY) continue;

      const next = deriveShareToken(row.id);
      const updated = await db
        .update(resumes)
        .set({ shareToken: next })
        .where(eq(resumes.id, row.id))
        .returning({ id: resumes.id });

      expect(updated).toHaveLength(1);
    }

    // Post-condition: after an APPLY, every shared row holds a
    // canonical token. In a dry run nothing was written, so the
    // legacy rows are still there — that IS the report.
    const remaining = await db
      .select({ id: resumes.id })
      .from(resumes)
      .where(
        sql`${resumes.shareToken} is not null and length(${resumes.shareToken}) <> 22`
      );

    console.log(`[backfill] rows still holding a non-canonical token: ${remaining.length}`);
    if (APPLY) {
      expect(remaining).toHaveLength(0);
    } else {
      expect(remaining).toHaveLength(legacy.length);
    }
  }, 120_000);
});
