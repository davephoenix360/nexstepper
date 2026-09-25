# ATS Scoring Engine + Scorecard UI — Plan

> Plan template: [`AGENTS.md` § Planning discipline](../../AGENTS.md#planning-discipline).
> Branch: `feat/ats-scoring`. Commit footer: `Plan: docs/plans/ats-scoring.md`.
>
> **Depends on (must land first):**
> 1. [`docs/plans/variant-first-ux.md`](./variant-first-ux.md) (Plan A) —
>    the variant-first UX restructure, which provides the
>    `<JdPanel>` slot the Scorecard lives in.
> 2. [`docs/plans/jd-markdown-format.md`](./jd-markdown-format.md)
>    (Plan B) — JD Markdown formatting. Not strictly required for
>    scoring (the function reads `ResumeData.jobContext` regardless
>    of whether `formattedMarkdown` is set), but Scorecard looks
>    weird next to a raw-text JD panel. Ship B in the same PR
>    cycle for visual consistency.

## Objective

Port the 4-dimension weighted ATS scoring algorithm from the legacy
`nexstepper/src/lib/score.ts` into a **pure, deterministic, server-side
TypeScript module**, and surface it in the **variant editor** as a
**Scorecard panel that sits next to the JD panel** (provided by
[Plan A](./variant-first-ux.md)) so users can see, at a glance, how
well their resume matches the attached job description.

> **Why variant-only:** scoring requires an attached JD
> (`ResumeData.jobContext`). Only **variant** resumes have a JD —
> the master resume is the source library and stays unscored. This
> plan assumes the variant-first navigation from Plan A. The
> master editor does not show a Scorecard.

**Hard constraints** (confirmed with the user):

- **No LLM in the scoring loop.** Zero `generateObject` / `streamText`
  calls. The Optimize tool stays separate and AI-powered; scoring
  does not.
- **No external service.** No embedding API (OpenAI, Cohere, etc.), no
  keyword-extraction API, no readability API.
- **No background compute.** No Inngest function. No polling.
- **~$0 per call.** Scoring runs in-process on the Next.js server,
  computes in milliseconds, and is invoked only when the user clicks
  "Refresh score".
- **Deterministic.** Same `ResumeData` + `JobPostingData` → same
  `ScoreBreakdown` every time. No `Date.now()`, no `Math.random()`,
  no async IO.
- **No new npm dependencies.** Pure TypeScript + the Zod schemas we
  already have.

These constraints drop three things from the legacy algorithm:

1. `@xenova/transformers` (25 MB in-browser model + SHA-1 fallback
   embedding). Replaced with a Jaccard token-set similarity — same
   intuition, no model.
2. `flesch-kincaid` + `syllable` for readability. Dropped from v1.
   Loses one signal; saves a dep + ~3 ms per call. Trivial to add back
   in v1.1 if calibration says it matters.
3. `extractKeywordGroups` (which relied on LangChain keyword
   extraction). Replaced with a simple tokenize + lowercase + split
   on `/\W+/`. We get the same set-intersection behavior without the
   chain.

## User-visible behavior

A user opens a **variant** at `/dashboard/resumes/[variantId]` with
a JD attached (via the JD-parser flow that already exists).

The variant editor's right-rail (provided by [Plan A](./variant-first-ux.md))
holds two stacked panels: the **JD panel** (Plan B fills in
formatted Markdown) and, below it, the **ATS Score panel**:

```
┌─────────────────────────────────┐
│ Acme Corp                       │
│ Senior Software Engineer        │
│ ─────────────────────────────── │
│ ## About the role               │
│ We are looking for a senior…    │
│ ## Requirements                 │
│ - 5+ years TypeScript           │
│ - ...                           │
└─────────────────────────────────┘
┌─ ATS Score ────────────────────┐
│  Overall:  78 / 100  (good)    │
│  ┌──────────────────────────┐  │
│  │ ▮▮▮▮▮▮▮▮▯▯  80 Matching   │  │
│  │ ▮▮▮▮▮▮▯▯▯▯  60 Structure  │  │
│  │ ▮▮▮▮▮▮▮▯▯▯  70 Content   │  │
│  │ ▮▮▮▮▮▯▯▯▯▯  50 Alignment │  │
│  └──────────────────────────┘  │
│  Computed in 23 ms             │
│  [ Refresh score ]             │
└───────────────────────────────┘
```

- Each bar is color-coded: green ≥ 80, amber 50–79, red < 50.
- "Refresh score" recomputes via the Server Action (no page reload,
  spinner in the button while running).
- The **variant list card** (on `/dashboard/resumes`) shows the
  variant's current overall score as a single number on the card —
  links to the editor. Variant cards are read-only score surfaces.
- If no JD is attached, the JD panel from Plan A shows the empty
  state ("Paste a job description to score this variant"), and
  the Score panel is hidden — there's nothing to score against.
  Once a JD is attached, both panels light up together.

The **first render** computes the score server-side (cheap enough
that we don't need a separate `/score` request just to populate the
initial value). The Server Action exists for the user's explicit
refresh.

## Scope (in)

- **Pure scoring function** in `lib/scoring/score.ts`.
- **4 dimensions** with the legacy weights:
  - ATS Matching — 30%
  - Structure — 20%
  - Content Quality — 30%
  - Alignment — 20%
- **Per-dimension sub-criteria** ported from the legacy `criteriaScores`
  record, with the embedding-based ones replaced:
  - Matching: keyword match (was 60% of atsScore, embedding similarity
    was 20%, coverage was 20%). Embedding similarity → Jaccard token
    similarity on the full resume text vs. full JD text. Coverage
    stays as-is (basic-qualification bullet coverage).
  - Structure: section completeness (4 of basics + work + education +
    skills) + length score (500–800 word sweet spot).
  - Content Quality: accomplishment ratio (% of work highlights with
    numbers) + action-verb usage (% of bullets starting with a
    strong verb from the curated list of ~100 verbs). **No readability**
    in v1.
  - Alignment: tailoring (Jaccard similarity of summary tokens vs. job
    title tokens) + has-extras (projects / awards / publications) +
    soft-skill keyword hit count.
- **`<ScorecardPanel>`** client component in `components/scorecard/`.
  Sits below the `<JdPanel>` from Plan A in the variant editor's
  right rail. Renders nothing when `resume.jobContext` is null.
- **`<VariantCard>` enhancement** — adds an overall-score badge to
  each variant card on `/dashboard/resumes` (consumes the snapshot
  from the score panel — see § DB / schema note).
- **`recomputeScoreAction`** Server Action in
  `app/(dashboard)/dashboard/resumes/[id]/score-actions.ts`.
- **Variant editor sidebar wiring** in
  `app/(dashboard)/dashboard/resumes/[id]/page.tsx` — mount
  `<ScorecardPanel>` directly below the Plan A `<JdPanel>` when
  the resume has `isMaster = false` AND `jobContext !== null`.
- **Unit tests** in `tests/unit/scoring/`.
- **Golden-fixture regression tests** that confirm we match the
  legacy output for a known resume+JD pair.
- **Latency benchmark** test asserting < 100 ms for a typical 2-page
  resume (assertion: `Math.max(timing over 100 runs) < 100 ms`).

## Non-goals (out of this plan)

- LLM in scoring (explicit, see objective).
- External compute / embeddings API / keyword-extraction API.
- Background recompute via Inngest.
- Score snapshot persistence / trend history (no `score_snapshots`
  table in v1).
- Score in the public share link (`/r/{token]`).
- Tier gate (Free vs Pro) for scoring — scoring is free for all users.
- Real-time recompute as the user types — manual refresh only.
- Readability (Flesch–Kincaid) — drop from v1 to avoid the `syllable`
  + `flesch-kincaid` npm deps. Trivial follow-up if calibration
  warrants it.
- ATS-side calibration against a labeled dataset (the §4 of
  `RESUME_SCORING_PLAN.md` calls for calibrating against 50–100
  recruiter-rated resumes). Out of scope for this PR; defer to a
  v1.1 calibration pass when we have user feedback.

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│ Variant editor page (RSC)                                    │
│   /dashboard/resumes/[variantId]                             │
│                                                              │
│  ┌─ Left column (2/3) ──────┐  ┌─ Right rail (1/3) ──────┐ │
│  │ Breadcrumb:               │  │ <JdPanel />             │ │
│  │   Master > Acme variant   │  │   (Plan A + Plan B)     │ │
│  │                           │  │                         │ │
│  │ Action bar:               │  │ <ScorecardPanel />      │ │
│  │   [Share] [PDF] [Optimize]│  │   (THIS PLAN)           │ │
│  │                           │  │                         │ │
│  │ <EditableResume />        │  │   Overall: 78 / 100     │ │
│  │                           │  │   ▮▮▮▮▮▮▮▮▯▯ Matching   │ │
│  │ [Save]                    │  │   ▮▮▮▮▮▮▯▯▯▯ Structure │ │
│  │                           │  │   ...                   │ │
│  └───────────────────────────┘  │   [Refresh score]       │ │
│                                 └─────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│ Server Action: recomputeScoreAction(input)                  │
│   1. requireUser()                                           │
│   2. Zod-validate input                                      │
│   3. ownership check via getResume()                         │
│   4. scoreResume(resumeData, jobPostingData)  ─────┐         │
│   5. return ActionResult<ScoreBreakdown>          │         │
└──────────────────────────────────────────────────────────────┘
                                                     │
                                                     ▼
┌──────────────────────────────────────────────────────────────┐
│ lib/scoring/score.ts (PURE, sync, no IO)                     │
│   ├─ tokenize(text) → Set<string>                            │
│   ├─ jaccard(a: Set<string>, b: Set<string>) → number        │
│   ├─ scoreAtsMatching(resume, job)                           │
│   ├─ scoreStructure(resume)                                  │
│   ├─ scoreContentQuality(resume)                             │
│   ├─ scoreAlignment(resume, job)                             │
│   └─ scoreResume(resume, job) → ScoreBreakdown               │
└──────────────────────────────────────────────────────────────┘
```

> The `<JdPanel />` and `<EditorLayout />` come from Plan A (see
> [`docs/plans/variant-first-ux.md`](./variant-first-ux.md) § Files).
> This plan only adds `<ScorecardPanel />` and the Score wiring
> below the JD panel — it doesn't touch the layout shell.

### Key design decisions

1. **Pure function, no async.** The function is `scoreResume(r, j):
   ScoreBreakdown` — no `Promise`. The Server Action wraps it in an
   `await` only because Server Actions return Promises; the function
   itself is synchronous.
2. **Module split per dimension.** Each dimension lives in its own
   file (`lib/scoring/dimensions/{ats,structure,content,alignment}.ts`)
   so they're individually testable and individually tunable. The
   top-level `score.ts` composes them.
3. **Weights exported as constants.** So calibration can tune them
   without touching the function bodies:
   ```ts
   export const WEIGHTS = {
     matching: 0.30,
     structure: 0.20,
     contentQuality: 0.30,
     alignment: 0.20,
   } as const;
   ```
4. **Action verb list lives in `lib/scoring/dictionaries.ts`** —
   easy to extend, easy to import in tests, easy to swap for a
   different dictionary later.
5. **Scorecard UI is dumb.** It receives a `ScoreBreakdown`, renders
   it. No fetching, no state management beyond a single "computing"
   flag during refresh.
6. **First-render pattern.** The editor page Server Component calls
   `scoreResume` directly when the JD is attached, and passes the
   result to `<ScorecardPanel>` as a prop. Subsequent refreshes go
   through the Server Action. This way the user sees the score on
   first paint without a separate request.

## Files

### New

- `lib/scoring/score.ts` — top-level `scoreResume` + `ScoreBreakdown`
  type + `WEIGHTS` constant.
- `lib/scoring/dimensions/ats-matching.ts`
- `lib/scoring/dimensions/structure.ts`
- `lib/scoring/dimensions/content-quality.ts`
- `lib/scoring/dimensions/alignment.ts`
- `lib/scoring/dictionaries.ts` — `ACTION_VERBS`, `SOFT_SKILLS`,
  `STOP_WORDS`.
- `lib/scoring/similarity.ts` — `tokenize()`, `jaccard()`.
- `lib/scoring/index.ts` — barrel.
- `lib/scoring/scoring.test-fixtures.ts` — hand-crafted
  `ResumeData` + `JobPostingData` pairs for the golden tests.
- `components/scorecard/scorecard.tsx` — `<ScorecardPanel>` client
  component.
- `components/scorecard/dimension-bar.tsx` — `<DimensionBar>` (label,
  bar, numeric, color-coded).
- `components/scorecard/empty-state.tsx` — "attach a JD to see your
  score" placeholder.
- `app/(dashboard)/dashboard/resumes/[id]/score-actions.ts` —
  `recomputeScoreAction`.
- `tests/unit/scoring/score.test.ts` — top-level composition tests.
- `tests/unit/scoring/dimensions/ats-matching.test.ts`
- `tests/unit/scoring/dimensions/structure.test.ts`
- `tests/unit/scoring/dimensions/content-quality.test.ts`
- `tests/unit/scoring/dimensions/alignment.test.ts`
- `tests/unit/scoring/similarity.test.ts`
- `tests/unit/scoring/golden.test.ts` — legacy-output regression.
- `tests/unit/scoring/latency.bench.test.ts` — 100-run timing cap.

### Changed

- `app/(dashboard)/dashboard/resumes/[id]/page.tsx` — mount
  `<ScorecardPanel>` directly below `<JdPanel>` (provided by Plan A)
  in the right rail. **Only when `resume.isMaster === false` AND
  `resume.data.jobContext !== null`.** Master editor: no score panel.
- `app/(dashboard)/dashboard/resumes/[id]/page.tsx` — first-render
  call to `scoreResume(r, j)` when the variant has a JD attached.
- `components/resumes/variant-card.tsx` (new from Plan A) — render
  the variant's latest `overallScore` as a small badge. Pulled from
  the server-rendered score returned by the editor page (no
  separate fetch).
- `app/(dashboard)/dashboard/resumes/page.tsx` — pass the
  `latestScore` (from `scoreResume(r, j)` over the variants list)
  to each `<VariantCard>`. One query, one render — no extra
  round-trips.

### Deleted

None.

## DB / schema

**No changes.** v1 does not persist score history. The score is
computed on demand, displayed, and forgotten. A future v1.1 may add
`score_snapshots` (resumeId, jobPostingId, overallScore, dimensionScores,
createdAt) for trend display — out of scope for this plan.

No env vars. No migrations. No backfill.

## Dependencies

**No new npm packages.** Pure TypeScript over the existing
`ResumeData` + `JobPostingData` Zod schemas.

Confirmed by inspecting `package.json` after the plan is approved —
no `pnpm add` step.

## Risks

1. **Rubric subjectivity.** The 30/20/30/20 weights and the per-
   dimension sub-weights are judgment calls inherited from the
   legacy. Different weights would produce different overall scores.
   **Mitigation:** export the weights as constants, document the
   source (legacy `score.ts` line numbers), and write a test that
   asserts the top-level composition uses them — so a future
   calibration pass can `git diff` what changed.
2. **Jaccard vs embedding similarity.** Token-set Jaccard misses
   semantic similarity ("managed team" vs "led a group of engineers"
   score 0 with Jaccard but high with embeddings). v1 is OK with
   this — recruiter rubrics weight exact keyword match highly. If
   the scorecard feels too brittle in user testing, v1.2 can add
   an optional embedding-similarity dimension (behind an env flag).
   **Mitigation:** instrument the "Matching" dimension's three sub-
   criteria separately so we can see which is pulling the score
   down.
3. **`action-verb` dictionary brittleness.** The legacy's ~100-verb
   list is English-only and opinionated. A "spearheaded" bullet
   scores; a "drove" bullet doesn't (unless we add it). **Mitigation:**
   extract to `dictionaries.ts`, ship a test that asserts the list
   contains the most-common 20 verbs (so future PRs that remove a
   verb need to justify it).
4. **Empty JD edge cases.** If the JD parser returns an empty
   `basicQualifications` array (the user pasted a one-line JD), the
   coverage sub-criterion returns 0, which tanks the matching score.
   **Mitigation:** treat empty arrays as "skip this sub-criterion"
   and re-normalize the dimension weight across the remaining
   sub-criteria. Test this case explicitly.

## Acceptance criteria

A reviewer can verify each of these from the diff alone.

1. ✅ `lib/scoring/score.ts` exports a synchronous, pure function
   `scoreResume(r: ResumeData, j: JobPostingData): ScoreBreakdown`.
   No imports from `node:*`, no `fetch`, no `crypto.createHash` (we
   don't need hashing).
2. ✅ The function does not call any external service. **Asserted by
   a static test:** `tests/unit/scoring/purity.test.ts` reads the
   compiled module and greps for `fetch`, `http`, `https`, `crypto`,
   `Date.now`, `Math.random`. Test fails if any are found.
3. ✅ The function completes in < 100 ms for a typical 2-page
   resume. **Asserted by** `latency.bench.test.ts`: 100 runs, take
   the max, assert < 100 ms on the CI runner.
4. ✅ Unit tests cover each dimension independently + the
   composition + every documented edge case (empty resume, empty JD,
   oversized inputs, single-token inputs). Target: ≥ 30 unit tests.
5. ✅ Golden-fixture regression: for one fixed `ResumeData` +
   `JobPostingData` pair, the new function returns the same
   per-dimension and overall scores (within ±1 rounding) as the
   legacy `nexstepper/src/lib/score.ts` would have produced. Documented
   in `tests/unit/scoring/golden.test.ts`.
6. ✅ `<ScorecardPanel>` renders 4 dimension bars + overall, color-
   coded (green ≥ 80, amber 50–79, red < 50).
7. ✅ "Refresh score" button calls `recomputeScoreAction` via
   `useTransition`, shows a spinner, and updates the bars in place.
8. ✅ First render: when the resume has an attached JD, the editor
   page calls `scoreResume` server-side and passes the result to
   `<ScorecardPanel>` so the user sees a score on first paint
   without an extra round-trip.
9. ✅ When no JD is attached, the Score panel is hidden (the
   Plan A `<JdPanel>` shows the empty state). When a JD is attached,
   both panels appear together.
10. ✅ The master editor (no JD rail, per Plan A) does NOT show the
    Score panel. Master is unscored by definition.
11. ✅ Each `<VariantCard>` on `/dashboard/resumes` shows a
    single-number overall score badge.
12. ✅ `recomputeScoreAction` validates session + ownership before
    running. The action returns the standard `ActionResult<ScoreBreakdown>`
    discriminated union.
13. ✅ `pnpm typecheck` clean. `pnpm test` green (existing 379 tests
    + new ~30 + latency bench stay green).
14. ✅ `package.json` diff is **zero new entries** (this plan
    contributes only TypeScript).

## Test plan

- **Unit:** every dimension function in isolation; composition;
  similarity helpers; dictionary contents; edge cases (empty
  resume, empty JD, single-token inputs, oversized inputs > 8 K
  chars).
- **Purity:** static test that greps the compiled module for
  forbidden imports (`fetch`, `http`, `https`, `crypto`, `Date`,
  `Math.random`).
- **Golden regression:** one fixed `ResumeData` + `JobPostingData`
  pair checked against the legacy algorithm's output (re-implement
  the legacy's logic in a one-off test fixture to compute the
  expected numbers — we don't need to import the legacy at test
  time).
- **Latency bench:** 100 runs of `scoreResume` against a 2-page
  resume fixture, assert `max < 100 ms` on CI.
- **Manual smoke (Playwright):** click "Refresh score" with a known
  JD, capture the rendered score, compare to a baseline PNG
  (`output/playwright/14-scorecard.png`). Also: edit a work entry
  → click refresh → verify the content-quality bar moves.

## Rollback plan

- Remove the `<ScorecardPanel>` mount from the editor page (one
  line delete).
- Delete `lib/scoring/` and `components/scorecard/` directories.
- Delete the test files under `tests/unit/scoring/`.
- No DB to roll back. No migrations to revert. No env vars to
  unset. No `package.json` entries to remove.
- Estimated revert time: < 5 minutes.

## Open questions

1. **Starting weights.** Inherit the legacy's 30/20/30/20 as the
   starting point and tune later, or run a small calibration sweep
   (e.g., 25/25/25/25 or 35/15/30/20) before shipping? Default:
   inherit the legacy. Tune after user feedback.
2. **Color thresholds.** Green ≥ 80, amber 50–79, red < 50 — or
   stricter (90/70)? Default: 80/50. Easy to change later via
   constants.
3. **Soft-skill dictionary.** Inherit the legacy's `["team",
   "leadership", "collaborated", "communication"]` as-is, or expand
   it (e.g., add "mentored", "facilitated", "presented")? Default:
   inherit. Expand later if user testing says the alignment score
   is uniformly low.
4. **Variant card score refresh.** When the user clicks "Refresh
   score" in the editor, does the variant card on
   `/dashboard/resumes` also update? Default: full-page navigation
   after score refresh (one extra request, simple semantics). v1.1
   can switch to optimistic UI updates via server-action
   revalidation.
