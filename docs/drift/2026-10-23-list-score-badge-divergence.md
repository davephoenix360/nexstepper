# Drift — the score badge in the resume list showed a different number than the scorecard

Date: 2026-10-23
Branch: `main`

## What was found

The user reported that the ATS score in the chip on `/dashboard/resumes` — the
badge on each variant row — "isn't updating".

It was not a stale number. It was a **different number**.

## The two surfaces, and the two engines

| Surface | Where the number came from |
|---|---|
| **The scorecard**, on the variant's own page | The breakdown the last **Recompute** persisted (`score_snapshots.breakdown`), via `resolveRenderedBreakdown` |
| **The badge**, on the resume list | A **fresh score computed on every render**, with the **SYNC** engine (`scoreResumeFromEnvelope`) |

The page was fixed on 2026-10-22 (see
`docs/drift/2026-10-22-recompute-score-flicker.md`): it used to recompute the
score with the sync engine too, which made the enhanced score flash and then
snap back. That fix moved the PAGE onto the persisted breakdown — and left
the LIST on the old path.

So after the Recompute work, the two surfaces had drifted apart:

- The page showed the **enhanced (Jev)** score.
- The list showed the **older token-based** score.
- A Recompute moved the scorecard's number and left the badge where it was.

**Measured in production** (the signed-in account):

```
variant                        persisted snapshot   badge on the list
SWE CleerDental                        66                 47
Test Resume 1 — Variant                39                 45
My Linkedin Generated Resume —         45                 (n/a)
```

The badge was showing a number the user had never seen.

## A second half: the list was never revalidated

Both recompute actions called

```ts
revalidatePath(`/dashboard/resumes/${parsed.data.resumeId}`);
```

— the EDITOR path only. So even with the right number, the list's RSC
payload was not invalidated after a recompute.

## The fix

### 1. The list reads the persisted breakdown

`lib/db/queries.ts > listResumes` now resolves the score through the SAME
helper the page uses:

```ts
const snapshots = await getLatestScoreSnapshots(allVariants.map((v) => v.id));
// …
const breakdown = resolveRenderedBreakdown({
  persisted: snapshots.get(variant.id)?.breakdown ?? null,
  compute: () => scoreResumeFromEnvelope(data, data.jobContext!, new Date())
});
family.variantScores[variant.id] = breakdown.overallScore;
```

One rule, one helper, two surfaces — so they agree **by construction**
rather than by two implementations happening to match. The page's fallback
(a variant that has never been scored) is unchanged and is still the sync
engine, which is pure, instant and free.

### 2. A batched snapshot query

`getLatestScoreSnapshots(resumeIds)` returns the latest snapshot for EACH
of several resumes in ONE query, using `SELECT DISTINCT ON (resume_id)`.
Calling `getLatestScoreSnapshot` per row would have been N+1.

Verified against production:

```
variants: 5
distinct-on returned 3 row(s):
  My Linkedin Generated Resume —   match_score= 45 breakdown=null
  Test Resume 1 — Variant          match_score= 39 breakdown=null
  SWE CleerDental                  match_score= 66 breakdown=66
distinct resumes: 3 (rows: 3)
OK — one row per resume
```

The index `score_snapshots_resume_created_idx` (resume_id ASC, created_at
DESC) satisfies the ORDER BY, so this is an index scan.

### 3. The list is revalidated

Both score actions now also call `revalidatePath('/dashboard/resumes')`.

## The lesson

The page was fixed in isolation. The rule it was fixed to — "render the
breakdown the last recompute produced" — was never stated as a SHARED rule,
so the list kept its own copy of "the score for this variant". The same
shape as the share-token bug: two copies of a rule, one of them stale.

The fix is not "remember to also update the list". It is **one helper,
called by both surfaces**, so the next surface that wants a score cannot
quietly invent a different one.

## Tests

`tests/unit/db/list-variant-scores.test.ts` (6):

- The batch query returns one row per resume, keyed by resume id, in one
  round trip.
- The list resolves through `resolveRenderedBreakdown` and reads
  `getLatestScoreSnapshots` — and does NOT compute a fresh score of its
  own.
- The page resolves through the same helper.
- Both recompute actions revalidate the list path.
