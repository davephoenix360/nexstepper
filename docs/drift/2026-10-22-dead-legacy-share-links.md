# Drift — three share links in production were dead, and the owner couldn't tell

Date: 2026-10-22
Branch: `main`
Harness: `scripts/backfill-share-tokens.cjs` (dry run, read-only)

## What was found

While smoke-testing the print fix against the public share route,
three of the four resumes in production that have sharing enabled
were serving a **404** to everyone — including the owner.

The owner was never told. The share dialog showed a URL, the Copy
button worked, and the recipient got a 404.

## The two shapes a share token can have

`resumes.share_token` has held two different things over the
product's life:

| | shape | when |
|---|---|---|
| legacy | 64-char SHA-256 hex digest | pre-Phase-2.5b |
| deterministic | 22-char base64url HMAC | Phase 2.5b onwards |

`deriveShareToken(resumeId)` produces the second one:
`base64url(HMAC-SHA256(SHARE_LINK_SECRET, resumeId)[:16])`.

**The lookup has always been direct equality on the column.** The
legacy design hashed the URL token before looking it up; the
deterministic design stores the URL token itself. Either way, the
column value IS the URL. Both shapes work.

## The two bugs

### 1. The route's input guard only accepted one shape

`app/r/[token]/page.tsx` had:

```ts
if (!token || token.length !== 22 || !/^[A-Za-z0-9_-]+$/.test(token)) {
  notFound();
}
```

A 64-char legacy digest never got as far as the database. The comment
called this a "pre-migration safety net" — old URLs holding 64-char
digests "fail here before they hit a query plan" — but a 64-char
digest in the URL is not a malformed URL, it is the URL the column
holds. The guard was rejecting working links.

### 2. The owner's link was re-derived instead of read

`getShareUrlAction` returned:

```ts
buildShareUrl(deriveShareToken(parsed.data.id))
```

A derived token is **always 22 chars**. A legacy row's column holds
64. They can never be equal — so the derived URL could never match
the row the lookup reads, and the owner got a link that 404'd for
everyone, including themselves.

The two bugs masked each other: the guard rejected the stored token,
and the action refused to hand out the stored token.

### The helper that would have caught it

`looksLikeDeterministicShareToken` — added with the deterministic
design, documented as existing "so we can hand the owner an honest
'this row hasn't been refreshed yet' copy during the transition
window" — was **exported and never called anywhere**. The transition
window it was written for never closed, and nothing used it.

## Measured, not assumed

Probed the live route with both token shapes (`scripts` in `.trash/`,
read-only, no database write):

```
PROBE legacy 64-char column value: token length 64 -> HTTP 404  (DEAD)
PROBE current 22-char column value: token length 22 -> HTTP 200  (LIVE)
```

And the production row census:

```
totals: {"total":24,"with_token":4,"enabled":4}
legacy (64-char) rows: 3 — all shareEnabled = true
canonical (22-char) rows: 1 — the only one that works
```

The three dead rows were the user's own resumes: "Benefit
Administrator", "My Original General Resume" and "Website — Variant".

## The fix

### `lib/share/token.ts` — one place that knows the shapes

- `classifyShareToken(token)` → `'deterministic' | 'legacy' | 'invalid'`
- `isAcceptedShareToken(token)` → the route's input guard, covering
  **both** shapes
- `selectShareToken(storedToken, derivedToken)` → the stored value
  wins when there is a usable one, the derivation is the fallback

### `app/r/[token]/page.tsx`

The inline 22-char check is replaced by `isAcceptedShareToken(token)`.
The guard is still cheap — both shapes are fixed-length and
fixed-alphabet, so junk is rejected before the database.

### `app/(dashboard)/dashboard/resumes/actions.ts`

`getShareUrlAction` now uses `selectShareToken(status.token,
deriveShareToken(id))` — the URL comes from the column the lookup
actually reads.

### Is accepting the legacy shape a security regression?

No. The column value was already a working URL for every canonical
row, so a leaked database dump already yielded working share links —
the deterministic token is a derivation, not a secret. Accepting the
64-char shape adds no capability that was not already there.

The route still 404s identically for "unknown token" and "sharing
disabled", so the change leaks nothing about which half was wrong.

## The data half

The code fix makes the three links work again, but the column still
holds a digest that is not derived from anything — so those rows
would break if `SHARE_LINK_SECRET` ever rotated, and they do not
match what the design says the column should hold.

`scripts/backfill-share-tokens.cjs` rewrites the legacy rows to the
canonical derived token:

```
node scripts/backfill-share-tokens.cjs           # dry run
node scripts/backfill-share-tokens.cjs --apply   # write
```

**It was NOT run against production.** The dry run was:

```
[backfill] mode=DRY RUN  legacy=3  already-canonical=1
[backfill] resume 95d7e5be-… (Benefit Administrator) shareEnabled=true storedShape=legacy-64 -> canonical(22) [dry run]
[backfill] resume 205804d1-… (My Original General Resume) shareEnabled=true storedShape=legacy-64 -> canonical(22) [dry run]
[backfill] resume caacb0b2-… (Website — Variant) shareEnabled=true storedShape=legacy-64 -> canonical(22) [dry run]
[backfill] rows still holding a non-canonical token: 3
```

The tool follows the repo's existing script → opt-in-test pattern
(the same one `scripts/measure-jev-corpus.cjs` uses) so it calls the
REAL `deriveShareToken` rather than carrying its own copy of the
HMAC. It is skipped unless `BACKFILL_SHARE_TOKENS` is set, dry-runs
by default, refuses to run without the target environment's secret,
and never prints a token.

## Post-deploy verification

The fix is deployed and **verified against the live site** (read-only
probe of every shared resume in production, no database write):

```
  PASS  My Original General Resume   tokenLen=64 enabled=true -> HTTP 200 (renders=true noError=true)
  PASS  Website — Variant            tokenLen=64 enabled=true -> HTTP 200 (renders=true noError=true)
  PASS  Benefit Administrator        tokenLen=64 enabled=true -> HTTP 200 (renders=true noError=true)
  PASS  SWE CleerDental              tokenLen=22 enabled=true -> HTTP 200 (renders=true noError=true)

SHARE ROUTE: 4 live, 0 dead (of 4 shared resumes)
```

Before the deploy it was 1 live and 3 dead. All four now render the
resume with no error boundary.

**The backfill was still not run** — the code fix is what made these
links work, and the data half remains the user's call.

## Tests

- `tests/unit/share/token.test.ts` (+13) — the classification, the
  guard, the selection rule, and two anti-drift assertions: the route
  must use `isAcceptedShareToken` and must not go back to an inline
  length check, and the action must use `selectShareToken` and must
  not go back to `buildShareUrl(deriveShareToken(…))`.
- `tests/unit/share/backfill-share-tokens.test.ts` — the backfill
  itself, skipped unless `BACKFILL_SHARE_TOKENS` is set.

## The lesson

The route and the action each had their own idea of what a token is,
and a helper that knew about both shapes sat unused. The failure was
not a wrong line — every line was locally reasonable. It was two
copies of a rule, one of which was stale.
