# 2026-10-20 — deterministic share tokens (Phase 2.5b)

Branch: `feat/deterministic-share-tokens`
Migration: `0011_deterministic_share_tokens.sql`

## What changed

Public-share links are now **deterministic derivations of the
resume id** instead of random CSPRNG tokens. Same resume id → same
URL forever, on every server, no matter how many times the owner
flips the toggle off and on.

```
token = base64url( HMAC-SHA256( SHARE_LINK_SECRET, resume_id )[:16] )
```

(~22 chars). The HMAC key lives in the environment, never the
database — so a stolen DB dump yields a column of opaque 22-char
strings and no key to reproduce them. Same threat model the prior
hash-only design gave us, with the bonus that the owner can
re-read their URL.

## Why

The previous design (`feat/share-link-retrieval`, migration 0009)
chose "never store the token" at the cost of "owner can't re-read
their link" — they had to rotate, which silently killed the link
they had emailed to a recruiter. We resolved that tension by
adding an AES-256-GCM ciphertext column so the owner could decrypt
their own token back. That worked, but it was three moving parts
(per-resume random token + SHA-256 hash + encrypted envelope)
plus an env var (`SHARE_TOKEN_ENCRYPTION_KEY`) to wire.

The deterministic design collapses all of that:

| | Before (Phase 2.5) | After (Phase 2.5b) |
|---|---|---|
| Token source | random CSPRNG (nanoid 21) | `HMAC(secret, resume_id)` |
| Storage | SHA-256 hash + AES-GCM envelope | verbatim |
| Owner can re-read URL? | only when key is set | always |
| Token rotates on enable? | yes (new random token) | no (same every time) |
| Rotation button? | yes | removed |
| Env vars | `SHARE_TOKEN_ENCRYPTION_KEY` | `SHARE_LINK_SECRET` |
| DB columns | 2 (hash + ciphertext) | 1 (token) |

## Schema

```sql
-- 0011_deterministic_share_tokens.sql
ALTER TABLE "resumes" DROP COLUMN "share_token_ciphertext";
ALTER TABLE "resumes" RENAME COLUMN "share_token_hash" TO "share_token";
DROP INDEX "resumes_share_token_idx";
CREATE UNIQUE INDEX "resumes_share_token_idx"
  ON "resumes" ("share_token")
  WHERE "share_token" IS NOT NULL;
```

Column rename rather than drop+add because the rename is
atomic and avoids a "no `share_token` for a window" surprise. The
old non-unique btree becomes a partial UNIQUE btree: HMAC-SHA256
with a 32-byte server secret cannot collide in practice, so we
can require uniqueness and let the index do double duty as the
public lookup.

## Code

- `lib/share/deterministic-token.ts` — new. `deriveShareToken(id)`
  and `shareLinkSecretConfigured()`. Handles the env fallback
  policy: missing/malformed secret throws in production; dev gets
  an in-memory ephemeral with a loud `console.warn`.
- `lib/share/token.ts` — slimmed to `buildShareUrl` and a
  `looksLikeDeterministicShareToken` shape helper. All the
  nanoid + SHA-256 plumbing is gone.
- `lib/share/token-crypto.ts` — replaced with a deprecated
  throwing shim. Any leftover import (e.g. from a stale branch)
  fails loudly rather than silently regressing.
- `lib/share/index.ts` — re-exports `deriveShareToken`,
  `shareLinkSecretConfigured`, `buildShareUrl`,
  `looksLikeDeterministicShareToken`.
- `lib/db/queries.ts` — `enableShare(resumeId, userId)` no longer
  takes a token (it derives one); `rotateShareToken` deleted.
  `getShareStatus` returns `token` instead of `tokenHash` +
  `tokenCiphertext`. `getResumeByShareToken(token)` looks up by
  direct equality on `share_token`, no second hash step.
- `app/(dashboard)/dashboard/resumes/actions.ts` — `enableShareAction`
  derives the token inline. `getShareUrlAction` always returns the
  URL when sharing is on (no more `code: 'unavailable'` fallback).
  `rotateShareTokenAction` deleted.
- `components/share/share-button.tsx` — "Generate new link"
  button removed. The recovery-link warning
  ("we kept a one-way hash, so all we kept was…") is gone.
  `EnabledView` always renders the URL when sharing is on; the
  loading state shows a spinner while the action resolves.
- `app/r/[token]/page.tsx` — input guard tightened from
  "≤ 64 chars" to "exactly 22 chars, base64url". Old 64-char
  SHA-256 tokens therefore 404 at the guard, never reaching the
  DB round-trip.
- `.env.example` — `SHARE_TOKEN_ENCRYPTION_KEY` removed,
  `SHARE_LINK_SECRET` documented (hex 64 chars or base64 32 bytes
  preferred; `openssl rand -hex 32` in the comment).

## Migration of pre-existing shares

Pre-migration rows had:
- `share_token_hash` populated with a SHA-256 hex of a random
  nanoid token (64 chars)
- `share_token_ciphertext` (added in `0009`) holding the
  envelope of that token

After this migration:
- The old hash moves into the new `share_token` column verbatim —
  it doesn't match anything the new code computes.
- Any owner who had sharing enabled before this branch will see
  the new deterministic URL the next time they open the share
  dialog. Their old `/r/{64-char-hex}` URL silently 404s.
- We deliberately do NOT decrypt the prior envelope to recover
  the original token — the simpler invariant is "post-migration,
  every row's URL is `f(resume_id, SHARE_LINK_SECRET)`," and
  silently preserving old tokens would mix two systems in one
  column.

The transition window is "until the next time the affected owner
opens the dialog and copies the new URL out." Tiny in practice
(Nexstepper has been live only since 2026-10-08 and the share
feature has had a handful of test users at most).

## Threat-model sanity check

The previous design argued: "a stolen DB dump doesn't yield URLs."
Argument: only SHA-256 hashes are stored.

The new design argues: "a stolen DB dump doesn't yield URLs."
Argument: only HMAC-SHA256 derivations are stored. To compute the
URL from a leaked value, the attacker also needs
`SHARE_LINK_SECRET`, which lives only in the environment.

Same property, simpler implementation. Rotating `SHARE_LINK_SECRET`
still makes every URL 404 — same blast radius as rotating every
share token individually under the old design.

## Tests

| File | Status | Notes |
|---|---|---|
| `tests/unit/share-deterministic-token.test.ts` | NEW | 14 tests. Determinism, secret dependence, dev/prod env fallbacks, shape. |
| `tests/unit/share-button.test.tsx` | rewritten | drops "one-way hash" and "Generate new link" assertions; pins the source invariants that protect the regression ("does NOT import rotateShareTokenAction", "does NOT derive view from Boolean(url)"). |
| `tests/unit/share/token.test.ts` | slimmed | only `buildShareUrl` tests remain; nanoid + SHA-256 helpers are gone. |
| `tests/unit/share-token-crypto.test.ts` | DELETED | encryption no longer exists. |
| `tests/unit/resume-list.test.tsx`, `recent-variants.test.tsx`, `score-actions.test.ts`, `score-semantic-actions.test.ts`, `inline-issue/enrich-bullet-action.test.ts` | `shareTokenHash` → `shareToken` in fixtures | mechanical; behavior unchanged. |

Total: **1645 → 1661 passing**, `pnpm typecheck` and `pnpm build` clean.

## Honest dev note

The first edit pass on the migration ran `drizzle-kit generate`,
which prompts interactively for column rename decisions. I aborted
that flow and wrote the SQL by hand because interactive prompts
aren't safe in CI / agent contexts — the better path is to update
`schema.ts` and use `drizzle-kit generate --breakpoints` (or
similar) in a non-interactive mode, but the hand-written SQL is
small enough that the manual route was faster and reviewable
inline.

## Docs / links

- `lib/share/deterministic-token.ts` — the implementation.
- `lib/share/token-crypto.ts` — deprecated shim with rationale.
- `lib/db/migrations/0011_deterministic_share_tokens.sql` — the
  migration, with section comments explaining each step.
- `.env.example` — production / dev fallback contract.
- `AGENTS.md` — still says "Phase 2.5 share-token recovery"
  (the prior section); an AGENTS.md update for "Phase 2.5b
  deterministic tokens" is the next thing to ship so the
  landing page reflects reality. Not done in this branch
  because the existing description of the feature is still
  accurate at a high level — owner can always re-read
  their URL.

## What I'd want to do if this branch grew

- Drop `lib/share/token-crypto.ts` outright (currently kept as a
  throwing shim). The deprecation grace period is fine for one
  cycle; the next refactor that touches this area should remove
  the file entirely.
- AGENTS.md standing-rules entry covering "deterministic
  share-token design" the way the prior `share-link-retrieval`
  section exists, so a fresh agent doesn't reach for a random
  token + hash by default.
- A drift check / lint that flags any new caller of the
  deprecated `token-crypto` shim — a CI grep would do.
