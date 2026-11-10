# Drift — one score, three surfaces: the agent was quoting a different number than the scorecard

Date: 2026-11-10
Branch: `main`

## What prompted this

A full architecture review of the repo (`docs/architecture-review.html`) read the
tree end to end and produced a findings register. Two findings were rated P0 and
three P1. This memo records the work that closed them.

The review's own verdict: **"the failure mode of this codebase is not a crash —
it is a number that disagrees with itself."** That is now fixed, in the one place
it was true.

---

## P0 #1 — Role Fit was a constant, not a measurement

### What was found

Role Fit is one of the seven scored dimensions, and under the v2 weights it
carries **0.10** — five points out of a hundred.

The enhanced scorer handed the sync engine a null similarity:

- `lib/scoring-async/score-hybrid.ts:93-100` — `scoreResumeFromEnvelope(resume, job, now, { roleFitSimilarity: null }, ...)`.
- `lib/scoring/score.ts:584` — the engine reads `precomputed.roleFitSimilarity`.
- `lib/scoring/dimensions/role-fit.ts:45-50` — a null similarity returns
  `NEUTRAL_ROLE_FIT_SCORE` (50) with `fallback: true`.

So every resume, in every production path, scored exactly `0.10 × 50 = 5.0`
points from a dimension no candidate could move and no edit could change. The
scorecard showed a flat bar and called it a dimension.

The implementation was **not missing**. `roleFitSimilarity()` in
`lib/scoring-async/role-fit.ts` computes the cosine between the JD title and the
candidate's best-matching work title, and it was covered by tests. A repo-wide
search found exactly one caller: the test file. The wrapper never called it.

This was independently confirmed by the launch-video work earlier the same day —
`docs/drift/2026-11-10-brag-video-and-the-pinned-role-fit-dimension.md` — which
measured the dimension across four experiments and found it never moved, and
recommended exactly this fix as a product decision left open.

### The fix

`scoreResumeHybridFromEnvelope` now computes Role Fit alongside the two Jev
evaluations and passes the result in:

```ts
const [evaluation, contentEvaluation, roleFit] = await Promise.all([
  evaluateJevRequirements(resume, job),
  evaluateJevContentQuality(resume),
  roleFitSimilarity(resume, job).catch(() => NEUTRAL_ROLE_FIT)
]);
```

Three deliberate details:

1. **In parallel with the other two.** The MiniLM pipeline is a module-level
   singleton with a single-flight promise, so Role Fit reuses the pipeline the
   hybrid similarity already warms — it costs a handful of extra embeddings on an
   already-warm pipeline, not another model load.
2. **`.catch(() => NEUTRAL_ROLE_FIT)`.** `roleFitSimilarity` swallows its own
   model errors, but a malformed envelope (a missing `sections.work`) throws
   before its own try/catch — and an unhandled rejection inside `Promise.all`
   takes the **whole score** down with it. The dimension degrades to its neutral
   50 instead, which is what it did before it was ever computed.
3. **The embedding cache** (`lib/scoring-async/semantic-similarity.ts`). Role
   Fit compares one JD title against every work title, and `semanticSimilarity`
   embeds *both* sides — so the same JD title was being re-embedded once per
   work title, for the same answer. Embeddings are now memoised by input text
   (bounded at 64 entries, FIFO-evicted). The JD title is embedded once.

### What it costs

Nothing per request beyond the embeddings described above. **The score changes**
for everyone with v2 weights — that is the point. A resume whose titles match
the JD well gains up to ~5 points; one that does not loses them. Scores that
were computed before this change are snapshots and stay as they are; the next
Recompute produces the new number.

### Tests

`tests/unit/scoring/role-fit-hybrid.test.ts` — 4 tests. The anti-drift one is
the point: "the function exists" is exactly what was true before, so the test
asserts the **call**, not the implementation.

---

## P0 #2 — the chat agent quoted a different score than the scorecard

### What was found

Three surfaces show or quote a variant's ATS score:

| Surface | Where the number came from (before) |
|---|---|
| The scorecard, on the variant's page | The **persisted** breakdown — the enhanced (Jev) score |
| The badge, on the resume list | The **persisted** breakdown (fixed 2026-10-23) |
| **The chat agent's system prompt** | A **fresh score computed with the SYNC engine**, every turn |

The sync engine and the hybrid engine differ exactly where the hybrid engine is
built to disagree — ATS keyword evidence, content quality, intent coverage — so
this was the **normal case**, not an edge case. A user could look at a scorecard
saying 57, ask the agent "what's my score?", and be told 51.

The agent was not wrong. It was answering from a different engine. The chat
route's own comment said as much:

> *"The ATS score is re-computed here from the envelope rather than read from the
> latest `score_snapshots` row, so the model sees numbers that reflect any
> in-memory edits the user just made."*

The reasoning was sound — the snapshot is only written by `recomputeScoreAction`,
which the user may not have clicked since their last edit. But the cost was a
number that disagreed with the one on screen.

### The fix

**One resolver, three surfaces.** New module `lib/variant-score.ts`:

```ts
resolveVariantScore({ resumeId, resume, job })
  → { breakdown, source: 'snapshot' | 'computed', snapshot }
```

It reads the latest snapshot and resolves it through the existing pure rule
(`resolveRenderedBreakdownWithSource` in `lib/scoring/snapshot-breakdown.ts`),
falling back to the sync engine only for a variant that has never been scored.
The page and the chat both call it. The list keeps using the pure helper
directly, because it needs a batched query (`SELECT DISTINCT ON`).

**The fallback still agrees.** When there is no snapshot, the page and the chat
both compute the sync-engine score from the same envelope — so they agree with
each other, and they agree with the badge (which falls back the same way).

**The agent is told where the number came from.** `buildAtsContext` takes the
provenance and, when the score was computed on the fly, tells the model plainly:

> *"this score was computed on the fly because no score has been saved yet for
> this resume. It is a keyword-only estimate and is NOT the number on the
> scorecard. If the user asks for their score, call getAtsScore to measure it
> with the same engine the scorecard uses."*

The "measure my own edit" case is what `getAtsScore` is for, and it is now the
only path that recomputes — deliberately.

### Tests

`tests/unit/scoring/variant-score.test.ts` — 9 tests, including the
anti-drift assertions: the page and the chat both go through `resolveVariantScore`,
the chat does **not** call `scoreResumeFromEnvelope` any more, and the resolver
goes through the shared snapshot rule.

---

## P1 #1 — the chat's own ATS tool wrote a snapshot the page could not see

### What was found

`lib/chat/tools/get-ats-score.ts` persisted a snapshot **without** the
`breakdown` column:

```ts
await recordScoreSnapshot(resumeId, userId, {
  matchScore: breakdown.overallScore,
  matchBreakdown: buildMatchBreakdown(breakdown),
  dynamicTips: tips,
  computedInMs: breakdown.computedInMs
  // ← no `breakdown`
});
```

Both snapshot readers select the **newest** row. `resolveRenderedBreakdown`
rejects a snapshot with no breakdown and falls back to the sync engine — so
after the agent computed a score, that snapshot became "latest", the page
rejected it, and the scorecard fell back to the sync engine. The divergence
returned, by the back door.

### The fix

The tool now writes the full breakdown, and uses the same
`maybeAppendSkillGapEntry` wrapper the Recompute action uses, so the
inline-issue surface gets the same per-leaf rows:

```ts
await recordScoreSnapshot(resumeId, userId, {
  matchScore: breakdown.overallScore,
  matchBreakdown: maybeAppendSkillGapEntry(buildMatchBreakdown(breakdown), breakdown),
  dynamicTips: tips,
  breakdown,          // ← now written
  computedInMs: breakdown.computedInMs
});
```

A snapshot that the page cannot render is a snapshot that does not exist.

---

## P1 #2 — a failed payment did not cost the user their Pro plan

### What was found

`lib/billing/types.ts` documents the policy:

> **Past-due / unpaid:** Stripe sets these statuses when payment fails. We
> demote to Free immediately so the user is nudged back to billing.

The webhook handler had two branches — `active | trialing` → keep Pro,
`canceled | unpaid` → demote — and **`past_due` fell through both of them**,
untouched. The local row kept `plan = 'pro', status = 'active'`, so
`isProEffective` stayed true and the user kept Pro access after their card
failed. Indefinitely, because nothing else ever rewrote the row.

The policy and the code disagreed, and the code was what ran.

### The fix

`past_due`, `incomplete` and `incomplete_expired` now demote, alongside
`canceled` and `unpaid`. Two details:

- **`stripeCustomerId` is not cleared.** The lookup key is the customer id, so
  the next `customer.subscription.updated` — the payment succeeding, or the
  subscription being reactivated — finds the row again and restores Pro.
- **`paused` is deliberately NOT demoted.** Stripe uses `paused` for
  promotional pauses, where the customer is still entitled to the product.
  Demoting them would take access away from someone who did nothing wrong.

A payment failure fires `subscription_downgraded` (the subscription still exists
on Stripe's side); a real cancellation fires `subscription_canceled`. They mean
different things in the product analytics.

`invoice.payment_failed` is an explicit no-op in the webhook: the demotion
happens on `customer.subscription.updated`, which carries the authoritative
status. Handling both would mean two code paths deciding the same thing.

### Tests

`tests/unit/billing/stripe-subscription-status.test.ts` — 10 tests, one per
status, plus the customer-id-survival assertion.

---

## P1 #3 — CI never compiled the route graph, and the repo had no linter

### What was found

`.github/workflows/ci.yml` ran `pnpm typecheck` and `pnpm test`. Nothing else.
The build step was a commented-out TODO, on the grounds that:

> *"it would need a live Postgres (the root layout calls getUser() at request
> time, which the build also evaluates)"*

**That reason was wrong, and it was checked rather than assumed.** `getUser()`
reads the session via `headers()`, and `headers()` is a dynamic API — Next.js
bails out of prerendering any route that touches it. So every route that needs
the database is already dynamic, and the build never opens a connection.
Verified by running the build against an unreachable database: it succeeds, and
the route table comes back entirely `ƒ (Dynamic)`.

That mattered because **the deploy is the worst place to find a broken route**:
`prebuild` runs `pnpm db:migrate` before `next build`, so a build failure on
`main` is also a migration failure against production.

### The fix — CI

Three gates, in increasing order of cost: **lint → typecheck → test → build**.

The build step runs against a **throwaway Postgres service container**, so
`prebuild` applies migrations `0000`–`0013` to an empty database on every PR.
That proves the migration chain still applies cleanly from scratch — which is
worth proving, because this repo has been bitten by a silently-skipped migration
before (ADR 0003: `db:push` desynced the journal and migration 0003 never ran).

### The fix — the linter

`eslint.config.mjs`, flat config, `eslint-config-next` (core-web-vitals +
typescript). The repo had **no lint configuration at all**.

Introducing a linter into a codebase that has never been linted raises an
honest question: 68 pre-existing errors. Fixing them all — including 42 that
need behavioural refactors across 19 components — in the same change as a
scoring fix would risk the editor for no product gain.

So the rules are split:

- **`react-hooks/set-state-in-effect` (27 sites) and `react-hooks/refs` (15)**
  are the React Compiler's rules, new in `eslint-config-next` 16. Both flag
  patterns that work today but that the Compiler will refuse to compile.
  They are **warnings**: visible in the lint output, greppable, countable, and
  not blocking. Fixing them properly is a React Compiler migration, and it is
  a separate piece of work.
- **Everything else is an error**, and an error fails CI.

The other 26 errors were fixed here, properly rather than by suppression:

| Rule | Sites | What was done |
|---|---|---|
| `react/no-unescaped-entities` | 7 | Escaped the characters (`&apos;`, `&quot;`) |
| `@typescript-eslint/no-explicit-any` | 5 app | The chat hook's abort controller became a **`useRef`** instead of a property stashed on the function object — which also fixes a real bug: a `cancel()` from a stale closure used to abort a controller that had already finished |
| `prefer-const` | 2 | `let` → `const` |
| `react-hooks/rules-of-hooks` | 4 | **A real bug.** `creative.tsx` and `executive.tsx` returned early *above* a hook call, which changes the number of hooks called between renders. The hook now runs before the early return. `use-section-print.ts` keeps its conditional — it is deliberate and documented, and the alternative (calling both branches) is not available, because `useFormContext()` **throws** outside a FormProvider. Its docstring said it "returns null (not throws)"; it does not. Corrected. |
| `react-hooks/immutability` | 2 | The chat hook's `messages` and `isStreaming` became refs (the consumer reads neither — it uses the `onMessage` callback) |
| `@typescript-eslint/no-require-imports`, `no-throw-literal`, `react-hooks/globals` | test files | Test idioms, disabled for `tests/**` |

The result: **0 errors, 135 warnings**, and the gate is green.

---

## Also fixed along the way

- **`lib/scoring/snapshot-breakdown.ts`** — `resolveRenderedBreakdownWithSource`
  added, returning the breakdown *and* its provenance. `resolveRenderedBreakdown`
  is now a thin wrapper over it, so the existing callers are unchanged.
- **The chat system prompt** — `buildSystemPrompt` takes the score's
  provenance as an eighth parameter.
- **The `use-section-print.ts` docstring** — it claimed `useFormContext()`
  "returns `null` (not throws)". It throws. The comment was the reason the
  conditional exists, and it was wrong.

---

## Files

**New**

- `lib/variant-score.ts` — the shared resolver.
- `eslint.config.mjs` — the flat config.
- `tests/unit/scoring/variant-score.test.ts` — 9 tests.
- `tests/unit/scoring/role-fit-hybrid.test.ts` — 4 tests.
- `tests/unit/billing/stripe-subscription-status.test.ts` — 10 tests.
- `docs/architecture-review.html` — the review that prompted all of this.

**Changed**

- `lib/scoring-async/score-hybrid.ts` — Role Fit is wired in.
- `lib/scoring-async/semantic-similarity.ts` — the embedding cache.
- `lib/scoring/snapshot-breakdown.ts` — `resolveRenderedBreakdownWithSource`.
- `lib/chat/system-prompt.ts` — the provenance note.
- `lib/chat/tools/get-ats-score.ts` — persists the breakdown.
- `lib/payments/stripe.ts` — the demotion statuses.
- `app/api/stripe/webhook/route.ts` — `invoice.payment_failed` is an explicit no-op.
- `app/api/chat/route.ts` — reads the score instead of recomputing it.
- `app/(dashboard)/dashboard/resumes/[id]/page.tsx` — uses the shared resolver.
- `.github/workflows/ci.yml` — lint + build gates, a Postgres service.
- `package.json` — the `lint` script; `eslint` + `eslint-config-next` as dev deps.
- `components/chat/use-chat-stream.ts`, `components/chat/chat-bubble.tsx`,
  `components/editable/*`, `components/resume-templates/*`,
  `app/(auth)/forgot-password/*`, `app/(legal)/privacy/page.tsx`,
  `lib/scoring/tips.tsx` — the lint fixes.

## Verification

- `pnpm typecheck` — clean.
- `pnpm lint` — 0 errors, 135 warnings.
- `pnpm test` — **2,228 passed**, 3 skipped, 175 files.
- `npx next build` — compiles; route table unchanged (every DB-reading route
  still `ƒ (Dynamic)`).

## Not done, deliberately

- The 42 React Compiler violations (`set-state-in-effect`, `refs`). They are
  warnings and they are a migration, not a lint fix.
- The applications / resume_variants pipeline (a P2 in the review): still a
  third path through the domain that nothing exercises.
- Liveblocks and Inngest (P2): still scaffolds.
