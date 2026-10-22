# Drift — the score changed twice on Recompute

Date: 2026-10-22
Branch: `feat/chat-agent-v3-phase-a`
Plan: `docs/plans/ats-scoring-v3-jev.md`

## What prompted it

The user, on the live site:

> *"when I press recompute, it shows fifty seven, then it goes back to
> fifty one… the keywords change to sixty six, then change back in less
> than a second to thirty seven."*

A score that moves twice, in opposite directions, a second apart.

## The mechanism

Three pieces lined up to produce it.

**1. The Recompute action runs the ENHANCED engine.** It calls
`scoreResumeHybridFromEnvelope`, which now includes Jev's requirement
measurement — so it returns keywords 66 and an overall 57. It returns
that breakdown to the client, which renders it. This is correct.

**2. The page RSC recomputed the score itself.** The variant page did
this:

```ts
const breakdown =
  !resume.isMaster && data.jobContext
    ? scoreResumeFromEnvelope(data, data.jobContext, new Date())
    : null;
```

`scoreResumeFromEnvelope` is the **sync** engine — pure, instant, and
with no Jev evaluation available, so it produced the old token-based
numbers: keywords 37, overall 51.

**3. The client replaces its state when the prop changes.** The
scorecard client holds the breakdown in local state and resets it in a
`useEffect` keyed on `initialBreakdown`. The action's `revalidatePath`
re-rendered the page, the RSC handed the client the *sync* breakdown, the
effect fired, and the number snapped back.

So the persisted headline (`match_score` = 57) and the rendered headline
(51) disagreed the whole time, and the user watched the transition.

This was pre-existing — the page has always recomputed the score rather
than reading the snapshot — but it only became visible when the two paths
started producing different numbers. Before the Jev work they agreed
(both were the sync engine), so the double-change was invisible: both
renderings showed the same number.

## The fix

**The page renders the breakdown the last recompute produced.**

- `score_snapshots` gains a nullable `breakdown` JSONB column
  (migration `0013_lively_randall.sql`) — the full `ScoreBreakdown`, not
  just the headline.
- The Recompute action persists it.
- The page reads it, and only computes a score itself when there is no
  snapshot yet (a resume that has never been scored, or one scored before
  this column existed).

The decision is a pure function, `resolveRenderedBreakdown` in
`lib/scoring/snapshot-breakdown.ts`, so it can be tested without a
database and without rendering a page. It ignores a malformed persisted
row rather than rendering it — a truncated row must not blank the
scorecard.

## Why not the alternatives

**Compute the enhanced score in the RSC.** That would mean running the
MiniLM embedding (a 25MB model, 2–5s cold start) plus a Jev call on
every page load. The scorecard's first paint would go from instant to
several seconds. Not acceptable.

**Store the enhanced numbers in the existing `match_score` column and
recompute the dimensions on the page.** The headline and the dimensions
would then disagree — a scorecard showing "57" next to a keywords
dimension of 37, with no way to tell which is right. That is worse than
the bug.

**Keep the recompute out of the page's props.** The client already
renders the action's result; the problem is the re-render that follows.
Suppressing the re-render would leave the page showing stale data on the
next navigation.

## What a user sees now

Press Recompute → the score updates once and stays. The persisted
headline and the rendered headline are the same number, because they are
the same breakdown.

For a resume that has never been recomputed since this shipped, the
first paint still shows the sync-engine score (keywords ~37) until the
user recomputes — then it shows the enhanced one and keeps it.

## Tests

- `tests/unit/scoring/snapshot-breakdown.test.ts` (4) — the page's
  decision: the persisted breakdown wins, the compute path does not run
  when there is one, and a malformed row falls back rather than rendering.
- `tests/unit/db/score-snapshots.test.ts` (+2) — the snapshot write
  carries the breakdown, and writes `null` when there is none.

Suite: 1910 → 1923.

## Honest note

This bug was found by the user, in the live product, within an hour of
the Jev work shipping. It was not caught by the test suite because
nothing tested that the page render and the recompute agreed — they were
two different code paths that happened to produce the same number, so
the disagreement was invisible until the numbers diverged.
