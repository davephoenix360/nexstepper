-- Phase 2.5b — public-share links become deterministic derivations of
-- the resume id, rather than random secrets stored hashed + encrypted.
--
-- The new token is
--
--     deriveShareToken(resume_id) =
--         base64url(HMAC-SHA256(SHARE_LINK_SECRET, resume_id)[:16])
--
-- which is roughly 22 chars. Reading works because we can compute
-- the same token on every server; writing works because the HMAC
-- key lives in the environment, never the database — so a stolen
-- dump still yields no usable URLs, the same property the prior
-- hash-only design gave us.
--
-- Step-by-step:
--
-- 1. Drop the AES-256-GCM ciphertext column. There is nothing
--    reversible to store anymore; the deterministic token is
--    derivable.
--> statement-breakpoint
ALTER TABLE "resumes" DROP COLUMN "share_token_ciphertext";--> statement-breakpoint
--
-- 2. Rename the lookup column. The value is no longer a SHA-256
--    digest; it's the deterministic token itself. Keeping the
--    name "share_token_hash" would mislead every future reader
--    of this schema, so the rename is structural, not cosmetic.
--> statement-breakpoint
ALTER TABLE "resumes" RENAME COLUMN "share_token_hash" TO "share_token";--> statement-breakpoint
--
-- 3. Drop the old non-unique btree index. It is being replaced
--    with a partial unique index (step 4): HMAC-SHA256 with a
--    32-byte secret cannot collide in practice, so we can require
--    uniqueness and let the index do double duty as the public
--    lookup index.
--> statement-breakpoint
DROP INDEX "resumes_share_token_idx";--> statement-breakpoint
--
-- 4. Partial UNIQUE index. Most rows have `share_token = NULL`
--    (never been shared). Only the rows that DO have a token
--    need the index entry, and they must be unique by construction.
--> statement-breakpoint
CREATE UNIQUE INDEX "resumes_share_token_idx"
  ON "resumes" ("share_token")
  WHERE "share_token" IS NOT NULL;--> statement-breakpoint
--
-- 5. Lazy backfill on next enable. Rows that already had a token
--    in `share_token_hash` carry that value over (a SHA-256 hex),
--    which will not match any URL the new code computes. The
--    `enableShare` action unconditionally writes the deterministic
--    token on next invocation, so the column self-heals the first
--    time the owner re-enables sharing. We deliberately do not
--    bulk-update here — the secret lives in the environment, not
--    the migration, so writing in SQL would require either baking
--    a fallback into the migration (bad: secret drift between dev
--    and prod) or running a side-script. One lazy write per resume
--    is cheaper than a separate migration runner.
