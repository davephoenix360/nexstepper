# Drift — the documentation was wrong in seven places, and two of those numbers rot by hand

Date: 2026-11-16
Branch: `main`

## What prompted this

The architecture review (`docs/architecture-review.html`) produced a P2 finding:
**six documentation artefacts disagree with the tree**. The review's own
recommendation was *"One drift sweep. Generate the test count and the
migration range from the tree rather than typing them."*

This memo records that sweep, plus a seventh artefact the review could not
have found — because it was created by the previous session's own work.

## The seven

| # | Where | Was | Now |
|---|---|---|---|
| 1 | `README.md` | "970/970 green across 78 files" | 2,228 across 175 files, dated, with a generator behind it |
| 2 | `README.md` | "970+ unit tests must stay green" | "2,200+ unit tests" |
| 3 | `AGENTS.md` | migrations `0000`–`0008` | `0000`–`0013` |
| 4 | `docs/setup/production.md` | migrations `0000`–`0008` (two places) | `0000`–`0013` |
| 5 | `posthog-ai-observability-report.md` | `posthogPrivacyMode: false` — "prompt and completion recording is enabled" | `true` — recording is **disabled**; prompts and responses never leave the app |
| 6 | `docs/decisions/0002` | describes `?print=1` auto-print on the preview page | that flow is gone; the ADR now carries a dated update table |
| 7 | `docs/plans/demo-video.md` | "⚠️ Role fit cannot move off 50" | re-measured; the whole plan re-pointed (below) |

Plus two **code** comments that were lying the same way:

- `lib/scoring/score.ts` — the `WEIGHTS_V2` doc comment said the weights were
  `0.68 / 0.32`. The constants are `0.70 / 0.30` and sum to 1.00. The comment
  was wrong.
- `components/resume-templates/template-gallery-modal.tsx` — "Five templates
  today". There are six. The comment now names the registry as the source of
  truth instead of counting them, so it cannot rot the same way again.

## The one that was not in the review

The review was written on 2026-11-10, and the demo-video plan's warning banner
was written on 2026-11-10 too — but the Role Fit fix landed **later the same
day**, after the review and after the video's numbers were measured.

So `docs/plans/demo-video.md` opened with:

> **⚠️ Before shooting: Role fit cannot move off 50.**

and the video's storyboard was built on a bar that now moves. The plan would
have produced a video that contradicts the product.

**This is the same bug class the review was about**, in a different costume: a
document quoting a value the code no longer produces. It is why the sweep
included a re-measurement rather than a find-and-replace.

## Re-measuring instead of re-typing

`scripts/measure-demo-score.ts` (new, `pnpm measure:demo-score`) reproduces
the seeded variant's envelope **in memory** — the same three steps
`scripts/seed-demo.ts` takes — and scores it with the shipped hybrid engine.
It writes nothing, so it can be run against a production checkout without
touching a database.

Measured on 2026-11-16:

| | Overall | Keywords | Format | Impact | Experience match | Intent coverage | Role fit | Seniority fit |
|---|---|---|---|---|---|---|---|---|
| **Before** | **78** | 68 | 82 | 74 | 69 | 90 | 84 | 100 |
| **After** (one truthful edit) | **79** | **71–72** | 82 | 74 | 69 | 90 | 84 | 100 |

The second posting — the "refusal" beat — reads **57** (Keywords 18,
Experience match 32, Intent coverage 100, Role fit 72).

**The score moved 75 → 78 and nothing moved but the dimension we fixed.**
Role Fit went from a pinned 50 to a measured 84; on a dimension worth 0.10 of
the score, that is 3.4 points, and 75 + 3 = 78. Every other bar is identical
to the pre-fix measurement.

### Two things the re-measurement turned up

1. **The story got better.** The weakest bar is now **Keywords — 68**, and
   Keywords is exactly the bar the honest edit moves (68 → 71). So the cold
   open, the fix and the payoff all point at the same dimension. The plan's
   Beats 1, 5 and 6 are re-pointed accordingly.
2. **The engine is not bit-for-bit deterministic.** Jev is a **probabilistic
   judge** — it returns probability-weighted evidence, not a verdict — so two
   runs of the identical fixture landed on Keywords 71 and 72. Everything else
   was stable. The plan's determinism checklist said "same score, every time";
   that is now true for six dimensions and the overall, and **±1 on Keywords
   is expected**. The plan says to read the number off the screen at
   rehearsal, which was already its rule.

### The inline-issue anchor is a fact, not a guess

Re-pointing Beat 5 at the Keywords bar surfaced a detail the old plan had
hand-waved ("confirm which field it anchors to"). It is knowable:

- the Keywords dimension maps to the `ATS Coverage` criterion
  (`lib/inline-issue/build-match-breakdown.ts:58`);
- `ATS Coverage` falls into `defaultPathForCriterion`'s default branch
  (`lib/inline-issue/criterion-to-path.ts:76-77`) — the **first** work bullet.

So the plan now says which bullet it is, and notes that it is deliberately a
*different* bullet from the one Scout edits in Beat 4: Beat 4 is the agent
finding a gap on its own, Beat 5 is the user taking the pen.

## Stop typing the numbers that rot

The test count was wrong three separate times because three files each held
their own hand-typed figure. `scripts/test-count.mjs` (new,
`pnpm test:count`) runs the suite with the JSON reporter and prints the real
file and case counts. The docs now carry a **dated** number plus a pointer to
the command, instead of a bare figure that silently ages.

## Also

- `README.md` no longer claims the database driver is "auto-detected" — it is
  `postgres-js` only. (The review found this in `AGENTS.md`; the README
  repeated it.)
- `README.md`'s verification block now lists the same four gates CI runs,
  including `pnpm lint`.
- `AGENTS.md`'s "Now (in flight)" header was pinned at `7f0d320`
  (2026-10-09). It now says `554afa1` (2026-11-16) and `0000`–`0013`.
- `docs/architecture-review.html` — the P2 finding's own wording said "the
  pricing page … advertise[s] a capability that does not exist". The pricing
  **copy** was corrected on 2026-10-21; only the plan constant still claims
  it. Corrected, because a review that overstates a finding is as useless as
  one that misses one.

## Verification

- `pnpm lint` — 0 errors.
- `pnpm typecheck` — clean.
- `pnpm test` — 2,228 passed, 3 skipped.
- `pnpm measure:demo-score` — prints the table above; run twice to see the
  ±1 on Keywords.
