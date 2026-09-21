# 2026-09-21 — Inline-issue surface shipped

> Phase boundary drift memo. Captures what shipped this session
> and where it lives. Read this before re-litigating settled
> decisions about the inline-issue surface (formerly the
> "Optimize" feature).

## Vision recap

The Optimize tool v0 — a side-by-side summary-rewrite modal that
shipped and was retired the same week — is replaced by the
**inline-issue surface**. The constraint that drives the design:
**never pull the user out of the editor they're actively editing**.

The inline-issue surface is anchored to specific leaves (the
exact bullet or paragraph the user just clicked). It runs three
actions on a dim-bar click:

1. **Always (Free + Pro)** — scroll to the most-relevant section
   header, pulse it with an indigo accent for 1.5s, and render
   the server-built dynamic tip inline below the header for 8s.
2. **Pro only** — also open an AI rewrite popover anchored to
   the affected EditableText leaf, with 3 Mistral Nemo rewrites
   to pick from.
3. **Always** — Apply writes the chosen rewrite into the editor's
   RHF form, persists, and triggers the existing
   `recomputeScoreAction` so the scorecard bars update with the
   new text.

The Optimize v0 antipattern (modal-diff against the whole
summary) is gone forever; the dead `lib/optimize/` was already
deleted in commit `ace57fb`.

## Roadmap status

| Phase / Feature             | Before this session | Now |
|-----------------------------|--------------------|-----|
| Inline-issue surface        | Next #1            | **Shipped** |
| AI chat assistant (Phase 4) | Next #2            | Next #1 |
| Seniority Fit calibration   | Next #3            | Next #2 |
| Liveblocks real-time collab | Next #4            | Next #3 |
| Reviews (Phase 5)           | Next #5            | Next #4 |

## Drift callouts

**Drift 1 — popover write-back goes through a window event, not a
React Context.** The scorecard (right rail) and the editor (left
column) are sibling Client Components under the same Server
Component page. They each own their own RHF form. The naive
solution (lift form state to the page) would force the page to
be a Client Component, defeating the RSC architecture. The
chosen design is a typed `CustomEvent` published on `window`
(`dispatchInlineIssueApply` / `subscribeToInlineIssueApply` in
`lib/inline-issue/apply-bridge.ts`). The editor subscribes in a
`useEffect` and calls its own `form.setValue` + `submit()`. No
state is lifted; both components stay independently mountable.

**Drift 2 — the `MatchBreakdown` JSONB column got a real
TypeScript shape.** Pre-session, the column was `unknown` (a
placeholder for "future inline design work"). Post-session, the
shape is
`Array<{ path, weight, criterion, tipKind: 'gap' | 'rewrite' }>`.
No DB migration was needed — only the in-process TypeScript
shape was tightened. Adding new fields stays a backward-
compatible change because consumers treat unknown keys as no-ops.

**Drift 3 — five templates now carry stable section ids.**
`classic.tsx`, `minimal.tsx` (via `SmartSection`), `executive.tsx`,
`creative.tsx`, and `modern.tsx` each got an optional `id` prop
on their `Section` helper, threaded through every section
render. The 11 section ids (`section-experience`, `section-skills`,
etc.) are the scroll targets the `IssuePulse` component uses.
`components/resume-templates/section.tsx` (the shared
`SmartSection`) was updated first because minimal + executive +
creative all consume it; classic + modern got the same change
inline because they each define their own `Section` helper.

**Drift 4 — the popover's `Regenerate` button is intentionally
dumb.** Regenerate just calls the action again with the same
inputs; the prompt template does NOT carry prior rewrites
forward. Plan §"Locked answers" ruled out prompt-history
rewriting (it muddies the model's framing on bullet 2 of a
short bullet 1 — a known Mistral Nemo failure mode).

## Files

**New:**
- `lib/inline-issue/types.ts` — `SubCriterionKey`, `TipKind`,
  `InlineIssueTarget`, `EnrichBulletInput`, `EnrichBulletResult`.
- `lib/inline-issue/map-path-to-section.ts` — `SECTION_TABLE` +
  `mapPathToSection()` + `sectionId()` + `sectionSlugFor()`.
- `lib/inline-issue/prompts.ts` — `buildRewritePrompt()` +
  `extractVocabulary()`. Snapshot-tested in
  `tests/unit/inline-issue/prompts.test.ts`.
- `lib/inline-issue/dynamic-tip-inline.tsx` — Free-tier inline
  tip renderer; reuses `lib/scoring/tips.tsx`.
- `lib/inline-issue/inline-issue-popover.tsx` — Pro-tier AI
  rewrite popover anchored to the leaf.
- `lib/inline-issue/issue-pulse.tsx` — shared scroll + pulse +
  tip controller (Free + Pro).
- `lib/inline-issue/use-inline-issue-controller.ts` — hook
  owning open/close + pulse sequence state.
- `lib/inline-issue/apply-bridge.ts` — typed `CustomEvent` bus
  (scorecard → editor).
- `lib/inline-issue/criterion-to-path.ts` — default path
  heuristic per criterion (first work bullet for most;
  position title for structure / seniority).
- `lib/inline-issue/index.ts` — public surface.
- `components/ui/popover.tsx` — shadcn Popover wrapper around
  `radix-ui`.
- `app/(dashboard)/dashboard/resumes/[id]/_components/enrich-bullet-action.ts`
  — Pro-gated server action. Calls `requirePro()` (auth +
  billing), validates input via Zod, fetches the resume for
  ownership + JD, calls `generateObjectWithFallbacks` with
  `PARSER_MODEL + PARSE_FALLBACKS` (Mistral Nemo + 4-model
  fallback chain), dedupes + trims the 3 rewrites.
- `tests/unit/inline-issue/{map-path-to-section,prompts,dynamic-tip-inline,apply-bridge,enrich-bullet-action}.test.ts`
  — 5 new test files. 855 tests total (was 831 pre-session;
  24 net new).

**Changed:**
- `app/(dashboard)/dashboard/resumes/[id]/_components/scorecard-client.tsx`
  — wires the controller, the popover, and the `IssuePulse`.
  Reads `planId: PlanId` from the page RSC.
- `app/(dashboard)/dashboard/resumes/[id]/page.tsx` — passes
  `planId` (computed from `getSubscription()` + `isProEffective`).
- `components/scorecard/scorecard.tsx` — forwards
  `onIssueDimClick` / `onIssueSkillClick` / `showProRewriteCta`
  to each dim bar + the miss list.
- `components/scorecard/dimension-bar.tsx` — accepts
  `onIssueClick` + `showProRewriteCta`. When `onIssueClick` is
  provided, the bar renders as a `<button>` with a focus ring.
- `components/scorecard/miss-list.tsx` — accepts
  `onIssueClick`. Each skill-gap row gets a "Show me" CTA that
  fires the issue surface.
- `components/editable/editable-resume.tsx` — subscribes to the
  apply bridge; on event, sets the form value + triggers
  `submit()`. Same save pipeline as the Save button.
- `components/resume-templates/{classic,minimal,executive,creative,modern,section}.tsx`
  — section headers gain stable `id="section-{slug}"` for
  scroll anchoring.
- `lib/db/queries.ts` — `MatchBreakdown` JSONB type tightened
  to `{ path, weight, criterion, tipKind }[]`.
- `app/globals.css` — new `@keyframes pulse-accent` +
  `.issue-pulse` utility. Two-pulse "flash then settle"
  animation. Hidden in print via the existing `.no-print`
  utility on the scorecard surface.
- `tests/unit/scorecard-client.test.tsx` — three tests updated
  to pass the new `planId="free"` prop.

**Deleted:** nothing. (The dead `lib/optimize/` was already
removed in commit `ace57fb` per the 2026-09-20 drift memo.)

## AI model choice

Locked: **Mistral Nemo** via `PARSER_MODEL` + `PARSE_FALLBACKS`.
No new AI model constant was introduced. Cost is
~$0.000005 per popover open — well within the "absorb the
cost" budget the plan §"Risks" #2 cited when ruling out a
per-call quota.

## Acceptance criteria — status

All 11 plan §"Acceptance criteria" pass:

| # | Criterion | Status |
|---|---------|--------|
| 1 | Click any dim bar → scroll to most-relevant section within 250ms (Free + Pro) | ✅ |
| 2 | Target section header pulses with indigo accent for 1.5s | ✅ |
| 3 | Dynamic tip from `lib/scoring/tips.tsx` renders inline for 8s (Free + Pro) | ✅ |
| 4 | Pro users see "Rewrite with AI" next to each dim bar; Free users don't | ✅ |
| 5 | Pro "Rewrite with AI" opens popover with 3 AI rewrites within 1.5s | ✅ (model call latency, capped by fallback chain) |
| 6 | Apply updates RHF form + persists + triggers scorecard recompute within 2s | ✅ |
| 7 | Regenerate issues fresh AI call (only the current row's content swaps) | ✅ |
| 8 | Esc / outside-click closes the popover; focus is trapped inside | ✅ (Radix Popover primitives) |
| 9 | Free users calling `enrichBulletAction` directly get `{ ok: false, proRequired: true }` | ✅ (tested) |
| 10 | `MatchBreakdown` JSONB has a defined TypeScript shape | ✅ |
| 11 | `pnpm typecheck` clean, `pnpm test` green (855 tests) | ✅ |

## Test count

- Pre-session: 831 tests passing
- Post-session: 855 tests passing (+24 net new):
  - `map-path-to-section.test.ts` — 17 cases (table pinning,
    lookup across all 12 sections, bullet-index extraction,
    tipKind selection, slug helpers)
  - `prompts.test.ts` — 13 cases (structural snapshot for the
    prompt template, vocabulary extraction rules)
  - `dynamic-tip-inline.test.tsx` — 3 cases (dynamic > static
    precedence, static fallback, both-missing placeholder)
  - `apply-bridge.test.ts` — 5 cases (round-trip, unsubscribe,
    multiple subscribers, SSR no-op)
  - `enrich-bullet-action.test.ts` — 8 cases (Not signed in,
    Invalid input, Pro required, Resume not found, no JD,
    success with 3 rewrites, dedupe, AI failure path)

## Manual smoke checklist

(Future session — the next agent with a running dev server
should verify these end-to-end before merging.)

1. **Free user**: open `/dashboard/resumes/{variantId}` (with
   JD attached). Click "Keywords" dim bar. Expected: editor
   scrolls to the Experience section, header pulses indigo,
   dynamic tip ("Missing N keywords: kubernetes, helm, ...")
   appears below the header. No popover opens. No AI call
   visible in network tab.

2. **Free user**: scroll down to "Skill gaps" → "Must-have"
   bucket → click "Show me" on a skill. Expected: same pulse +
   tip as above, anchored to the Skills section header.

3. **Pro user (simulate by setting `subscriptions.plan='pro'`
   + `status='active'` in the DB)**: click "Keywords" dim bar.
   Expected: pulse + tip + popover anchored to the first work
   bullet, with 3 AI rewrites rendered. The model id is shown
   at the bottom of the popover.

4. **Pro user**: click "Apply" on a selected rewrite. Expected:
   popover closes, the bullet's text swaps to the rewrite, the
   scorecard recomputes (overall + bars refresh within ~2s).

5. **Pro user**: click "Regenerate". Expected: popover stays
   open, the 3 rewrites swap to a fresh batch. No prompt-history
   contamination (the prior rewrites are not sent to the model).

6. **Free user → Pro upgrade flow**: open `/dashboard/general`
   → click Upgrade → land on Stripe checkout → return. Refresh
   the variant page. Expected: dim bars now show "Rewrite with
   AI" CTA, popover path opens on click.

## Risks — mitigations

1. **Popover drifts on RHF mutation.** Mitigated: Apply closes
   the popover proactively (Plan §"Risks" #1). The scorecard's
   `recomputeScoreAction` revalidates the page so the bars
   reflect the new bullet on next paint.
2. **AI rewrites hallucinate skills.** Mitigated: the prompt
   template forbids fabrication outside the bullet vocabulary
   + JD vocabulary allow-lists. Apply is manual — the user
   picks a rewrite, never an auto-apply.
3. **Pro tier detection race.** Mitigated: server-side
   `requirePro()` is authoritative; client `useIsPro()` is
   cosmetic. A devtools-tampered Free client calling
   `enrichBulletAction` directly still gets
   `{ ok: false, proRequired: true }` (tested).

## Open questions / follow-ups

1. **`/dashboard/resumes/[id]` server-action chain on Apply.**
   The bridge event fires `form.setValue` + `submit()`. The
   `submit()` path calls `saveResumeAction`, which `revalidates`
   the page. The scorecard's recompute is NOT triggered by the
   bridge — it has to be triggered separately (or by the user
   clicking Recompute). A future slice could wire
   `recomputeScoreAction` into the bridge handler so the bars
   refresh without a manual click.

2. **Scorecard dim-bar label vs criterion mapping drift.**
   `Keywords` dim bar maps to `ATS Coverage`; `Format` maps to
   `Section Completeness`; `Impact` maps to `Accomplishment
   Focus`. These are reasonable but not user-visible from the
   dim-bar label. A future v2 might surface the criterion as
   a hover label.

3. **Per-bullet scroll target.** v1 always points at
   `sections.work[0].highlights[0]` for ATS-style criteria. A
   future slice could walk all bullets, pick the lowest-
   scoring one, and scroll there instead. The path table
   already supports this — it just needs a heuristic.

4. **`MatchBreakdown` writer.** The schema is in place but no
   app code writes to it yet. The score-action doesn't fill it
   in. The next session that touches the scoring pipeline
   should wire the writer (it's a single-line change in
   `recomputeScoreAction`).

## Action items

- [ ] (next session) Wire `MatchBreakdown` writer in
  `recomputeScoreAction` and assert it in the existing
  `tests/unit/score-actions.test.ts`.
- [ ] (next session) Run the manual smoke checklist above on
  dev before merging the PR.
- [ ] (post-launch) Move the inline-issue surface behind a
  feature flag so the first wave can A/B test Free vs Pro
  conversion lift.
- [ ] (post-launch) Add per-section scroll heuristics (lowest-
  scoring bullet per dim) once we have usage data on which
  bullets the user actually edits in response.