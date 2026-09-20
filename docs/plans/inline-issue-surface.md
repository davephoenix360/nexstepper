# Inline Issue Surface — Plan

## Objective

Wire the existing ATS scorecard on the variant editor's right rail as the
funnel for **inline resume improvement**: click any dim bar or skill-gap
row → editor scrolls to the affected section, the section header pulses,
the dynamic tip from `lib/scoring/tips.tsx` appears inline, and (for Pro
users) an inline popover anchored to the affected leaf offers three
AI-rewritten bullets that apply with one click. This is the replacement
for the retired Optimize tool v0 (drift memo
`2026-09-20-optimize-removed.md`), designed fresh against the constraints
that killed v0 — namely, never pull the user out of the editor they are
actively editing.

## User-visible behavior

**Prerequisite:** the variant editor has a JD attached (today's scorecard
is mostly empty without one; the inline surface inherits that
constraint — no JD, no triggers).

### Free tier — "Show Me + dynamic tip"

1. The right-rail scorecard already shows 7 dim bars and a per-skill
   miss list. With this change, every dim bar becomes a **button** and
   every skill-gap row gets a **"Show me"** affordance.
2. Click any dim bar (or skill-gap row).
3. Within 250 ms the editor scrolls to the most-relevant section
   (e.g. "Intent Coverage 42 %" → the Skills section; "ATS Coverage" →
   the Experience section; "Action Verb Usage" → the same section whose
   bullets triggered it).
4. The target section's header pulses with the indigo accent for
   1.5 s (`@keyframes pulse-accent`).
5. Below the section header, the dynamic tip from
   `lib/scoring/tips.tsx` (already built — see `CRITERIA_TIPS` and
   `buildDynamicTips`) appears inline for 8 s and fades. Existing
   example for `ATS Keyword Match`: *"Add these missing keywords from
   the JD: **Terraform, Docker, K8s**."* For `Intent Coverage`: a
   per-priority bucket list. The user reads the tip and edits manually.
6. No AI call. No popover. No modal.

### Pro tier — "Show Me + dynamic tip + AI rewrites"

Same Free behavior, plus:

7. Next to each dim bar, a secondary **"Rewrite with AI"** button
   appears (visible only when `useUserPlan()` returns `'pro'`).
8. Click "Rewrite with AI". A popover opens, anchored to the affected
   `EditableText` leaf (RHF path → `data-testid="editable-{path}"`).
9. Inside the popover, the user sees the existing dynamic tip + **three
   AI-rewritten bullets**. Each rewrite row has **Apply** /
   **Regenerate** (this row) / **Dismiss**.
10. Click **Apply** → the bullet text is patched into the RHF form, the
    section persists, the scorecard recomputes within 2 s (same path
    the existing editor save flow uses). The popover auto-closes.
11. Click **Regenerate** → a fresh AI call runs; the row's content
    swaps in. Other rows stay.
12. **Esc** or **outside-click** dismisses the popover. The dim-bar
    click state resets after 8 s.
13. AI rewrites are **lazy**: no AI call happens on scorecard render.
    Cost is paid only when the user actually clicks "Rewrite with AI".

### What the user does NOT see

- No modal that takes over the screen (the v0 antipattern).
- No page navigation.
- No real-time underline-as-you-type feedback (Rezi pattern; would
  require a non-RHF editor, not in scope).
- No automatic acceptance of AI rewrites (Reactive Resume's
  "proposal with Accept/Reject" pattern applied inline).

## Scope (in)

- New `lib/inline-issue/` module: orchestration, prompt template,
  path-to-section mapping.
- New server action `enrichBulletAction({ resumeId, path, criterion })`
  — Pro-gated via `requirePro()`.
- New client component `<InlineIssuePopover />` anchored to the
  affected leaf via RHF path.
- New client component `<IssuePulse />` that scrolls + flashes +
  renders the dynamic tip inline.
- Make `DimensionBar` and `SkillGapRow` interactive (currently static
  divs / spans). Free/Pro split lives in the `ScorecardClient` parent.
- New pulse CSS keyframes in `app/globals.css`.
- Define the `MatchBreakdown` JSONB type properly (replace
  `export type MatchBreakdown = unknown` in `lib/db/queries.ts:1074`).
- Free/Pro split at the server-action boundary (Free `requirePro()`
  throws → action returns `{ ok: false, error: 'Pro required' }`).
- Unit + integration tests for the new module.

## Non-goals (out of this plan)

- Real-time inline scoring-as-you-type (Rezi pattern). Would require a
  non-RHF editor; deferred.
- AI chat assistant (Phase 4, separate plan).
- Liveblocks collaboration on the inline surface (Phase 5, separate
  plan).
- "Rewrite summary" / "Rewrite whole experience block" (Optimize v0's
  modal-diff feature). Drift memo ruled this out; don't re-add.
- New AI model constants. Use `PARSER_MODEL = 'mistral/mistral-nemo'`
  with `PARSE_FALLBACKS` — already wired, free-tier reliable.
- Server-rendered PDFs (deferred per locked non-goals).
- Per-bullet versioning / history. Rewrites overwrite in place; the
  existing revision history still captures them.
- Suggesting skills the user does not have. The prompt forbids it.
  Detected-and-displayed caveats are out of scope (see Risks).

## Design options considered

Three options were surfaced to the founder before this plan was
written. The chosen direction is **Option A with a tier-gated AI
rewrite layer**.

### Option A — Chosen ✅
*Dim-bar click → inline popovers + AI rewrites (Pro-gated).*

| Aspect | Decision |
|---|---|
| Trigger | Dim bar click OR skill-gap row "Show me" link |
| Free experience | Scroll + pulse + dynamic tip inline (Option B's surface, no AI) |
| Pro experience | Same Free behavior + "Rewrite with AI" → popover with 3 rewrites |
| Where rewrite happens | Inline popover anchored to the affected EditableText leaf |
| Composes with scorecard | Scorecard is the funnel; every dim bar becomes a button |
| Composes with JD panel | Unchanged; JD context is read from the same payload the scorecard uses |
| AI role | Rewrite (3 candidates per click, lazy) |

**Tradeoffs accepted:**
- Two-tier UX surface (Free vs Pro) requires a `useUserPlan()` hook
  plumbed into `ScorecardClient`. This is the only new client-side
  state.
- Popover anchoring requires stable DOM IDs on `EditableText`. We
  already have `data-testid="editable-{path}"`; reuse it.
- One extra server action (`enrichBulletAction`). Existing pattern,
  existing Zod + `requireUser()` infrastructure.

### Option B — Rejected ❌
*Show-Me scroll + dynamic tips + pulse highlight. No AI rewrites in v1.*

| Aspect | Why rejected |
|---|---|
| Cheapest possible v1 | True — but ships without the differentiating magic |
| Reuses `lib/scoring/tips.tsx` as-is | True — but A already reuses it for the Free path |
| No new model constant | True — A also adds no new constant |

**What we lose vs A:** the click-to-rewrite loop that turns the
scorecard from a passive readout into an active editor driver. The
founder explicitly chose AI rewrites as the differentiator for Pro.

**Why this is still in scope as a Free feature:** Option A *contains*
Option B's surface as the Free tier. A Free user gets everything Option
B would have shipped, just without the Pro-gated AI rewrites on top.
This is a strict superset of Option B's value proposition.

### Option C — Rejected ❌
*Suggestions mode toggle + right-rail sheet (Grammarly pattern).*

| Aspect | Why rejected |
|---|---|
| Most "Grammarly for resumes" feel | True, but the founder's drift memo specifically called out pulling the user out of the editor as the v0 antipattern — a sheet is the same antipattern in different clothing |
| Mode toggle adds learning cost | One more thing to learn; the dim bar is already there |
| Full-screen sheet competes with right rail | Layout thrash; the variant editor right rail already holds JD panel + scorecard |

**What we lose vs A:** the always-on suggestion mode that flags every
weak leaf proactively. A's triggers are explicit (dim bar / gap row),
so users who don't look at the scorecard won't see issues. Tradeoff
accepted: explicit triggers are less noisy and less surprising than
auto-flagging.

### Negative space — what nobody does (why our wedge works)

- **No editor ties inline suggestions to their own ATS scoring
  dimensions.** Our scorecard already knows which sections drag the
  score down. The new surface drives off that exact data; the AI is
  the only new payload.
- **No editor offers BOTH a passive "this section is weak" indicator
  AND a click-to-rewrite on the same surface.** Teal's wand is
  hover-revealed (not flagging); Reactive's ATS check is sidebar-only;
  Rezi's real-time is the score only; Jobscan separates editor and
  suggester. We unify them: dim-bar click is the funnel, the popover
  is the fix surface, both live in one product.
- **No editor does this at <$0.001 per heavy session.** Mistral Nemo
  is free-tier reliable at $0.02/$0.03 per M tokens. One popover open
  ≈ $0.000012.

## Architecture

```
                 ┌─────────────────────────────────────────────┐
                 │  ScorecardClient (right rail, existing)     │
                 │  + useUserPlan()  ─→ 'free' | 'pro' (NEW)   │
                 └──────────────────┬──────────────────────────┘
                                    │
        ┌───────────────────────────┼──────────────────────────────┐
        │                           │                              │
   (Free + Pro)                (Pro only)                    (Scorecard)
        │                           │                              │
        ▼                           ▼                              ▼
  ┌────────────┐         ┌────────────────────────┐    ┌──────────────────┐
  │  Scroll +  │         │  InlineIssuePopover    │    │  existing 7-dim  │
  │  pulse +   │         │  anchored to leaf via  │    │  bars + skill    │
  │  inline    │         │  data-testid="editable-│    │  gap miss list   │
  │  dynamic   │         │  {path}"               │    │  (now buttons)   │
  │  tip       │         │  - existing tip        │    └──────────────────┘
  └────────────┘         │  - 3 AI rewrites       │
                         │  - Apply / Regen / X   │
                         └────────────┬───────────┘
                                      │ Apply
                                      ▼
                         ┌────────────────────────┐
                         │  enrichBulletAction     │
                         │  (server, Pro-gated)    │
                         │  requirePro() at top    │
                         │  → streamText → 3 cand. │
                         │  → mutate RHF form      │
                         │  → trigger score recompute
                         └────────────────────────┘

  MatchBreakdown JSONB (currently `unknown` in lib/db/queries.ts:1074)
  ─→ gets a defined shape: { path, weight, criterion }[]
  ─→ carried alongside the existing ScoreBreakdown payload
```

**Key design choices:**

1. **Scorecard is the funnel, not the editor.** The user already
   looks at the scorecard to know whether the resume is "good". Making
   the scorecard clickable is the lowest-friction trigger surface.
2. **Free path uses existing code, no AI call.** `buildDynamicTips`
   in `lib/scoring/tips.tsx` is a pure function. We render its output
   inline below the section header. No new model constants.
3. **Pro path uses a new server action with the existing
   `PARSER_MODEL`/`PARSE_FALLBACKS` chain.** Same Gateway, same
   observability, same free-tier failover. No new model constants.
4. **Popover anchors to existing `data-testid="editable-{path}"`.**
   No new DOM contract. Stable across re-renders because the path is
   the RHF path.
5. **MatchBreakdown type migrates from `unknown` to a real shape.** The
   DB layer already has the column; only the TS surface changes.

## Files

### New

- `lib/inline-issue/index.ts` — public surface; re-exports `mapPathToSection`,
  `buildIssuePayload`, and the Zod schema for the action's input.
- `lib/inline-issue/map-path-to-section.ts` — pure function:
  `(breakdown: ScoreBreakdown, criterion: SubCriterionKey) =>
  { path: string; sectionTitle: string } | null`. Picks the most
  relevant RHF path per criterion.
- `lib/inline-issue/prompts.ts` — rewriter prompt template
  (`buildRewriteUserPrompt`, `buildRewriteSystemPrompt`). Snapshotted
  in `prompts.test.ts`.
- `lib/inline-issue/dynamic-tip-inline.tsx` — wraps `buildDynamicTips`
  for inline rendering (vs the existing scorecard-rendered tip).
- `app/(dashboard)/dashboard/resumes/[id]/_components/inline-issue-popover.tsx`
  — client component; popover anchored to the leaf via
  `data-testid="editable-{path}"`. Apply / Regenerate / Dismiss.
- `app/(dashboard)/dashboard/resumes/[id]/_components/issue-pulse.tsx`
  — client component; scroll + flash + render inline tip. Used by
  ScorecardClient.
- `app/(dashboard)/dashboard/resumes/[id]/actions/enrich-bullet-action.ts`
  — server action; `requireUser()`, `requirePro()`, parse, prompt,
  call, return 3 candidates.
- `lib/billing/require-pro.ts` — new server helper wrapping the
  existing `subscriptions` table query. Returns `void` or throws a
  typed `ProRequiredError` that the action catches and returns as
  `{ ok: false, error: 'Pro required' }`.

### Changed

- `components/scorecard/scorecard.tsx` — `DimensionBar` accepts an
  `onIssueClick?: () => void` and renders as a `<button>` when present.
  Keeps current hover-tip behavior; new click handler is additive.
- `components/scorecard/miss-list.tsx` — `SkillGapRow` accepts the same
  `onIssueClick` and gets a trailing "Show me" affordance.
- `app/(dashboard)/dashboard/resumes/[id]/_components/scorecard-client.tsx`
  — owns `useUserPlan()`, owns the pulse state (which section to flash,
  which path to scroll to), wires the popover open/close. Free users
  only get the pulse path; Pro users also get the "Rewrite with AI"
  CTA per dim bar.
- `components/editable/editable-resume.tsx` — ensure section headers
  get a stable `id` (e.g. `id="section-experience"`) so the pulse
  component can `scrollIntoView`. We already have stable
  `data-testid`; we add an `id` next to it.
- `lib/db/queries.ts` — replace `export type MatchBreakdown = unknown`
  (line 1074) with the real shape:
  `type MatchBreakdown = { path: string; weight: number; criterion: SubCriterionKey; tipKind: 'gap' | 'rewrite' }[]`.
  Migration is backward-compatible: the DB column is already JSONB;
  only the TS surface changes. No migration needed.
- `lib/scoring/types.ts` (new) — re-export `SubCriterionKey` and the
  new `MatchBreakdown` type from one place. Resolves the existing
  cross-module coupling (`tips.tsx` already imports `SubCriterionKey`
  from `score.ts`).
- `app/globals.css` — `@keyframes pulse-accent` + `.issue-pulse` utility.

### Tests

- `tests/unit/inline-issue/map-path-to-section.test.ts` — pure
  function tests across all 7 dimensions and 3+ resume shapes.
- `tests/unit/inline-issue/prompts.test.ts` — prompt-template snapshot
  to catch unintended drift.
- `tests/unit/inline-issue/dynamic-tip-inline.test.tsx` — renders
  `<strong>` keywords correctly; falls back to static `CRITERIA_TIPS`
  when dynamic helper returns undefined.
- `tests/integration/inline-issue/free-tier-pulse.test.ts` — Free user
  clicks a dim bar → assert scroll + pulse + inline tip render → assert
  no call to `enrichBulletAction`.
- `tests/integration/inline-issue/pro-tier-rewrite.test.ts` — Pro user
  clicks "Rewrite with AI" → assert popover opens with 3 rewrites →
  assert Apply triggers a single RHF mutation.
- `tests/integration/inline-issue/pro-gate.test.ts` — Free user calls
  `enrichBulletAction` directly via the action surface → assert
  `{ ok: false, error: 'Pro required' }`.

## DB / schema

- **No new tables.** `MatchBreakdown` JSONB column on the scorecard
  table already exists; only the TS type changes.
- **No new columns.** No new indexes.
- **No migrations.** Type-only change in TypeScript; the persisted JSON
  was already `unknown`-shaped, so old payloads are still parseable.

## Dependencies

- **npm packages:** none new. `radix-ui/react-popover` is already in
  the lockfile (used elsewhere); reuse it. shadcn/ui's `<Popover>`
  primitive wraps it.
- **External services:** none new. Same Vercel AI Gateway, same
  `PARSER_MODEL`/`PARSE_FALLBACKS` chain.
- **Env keys:** none new.

## AI model + cost

- **Model:** `PARSER_MODEL = 'mistral/mistral-nemo'` with
  `PARSE_FALLBACKS` (already wired).
- **No new constants.** Per the brief: *"No new model constant until
  the design is committed."* The design IS being committed; still, no
  new constant is needed because the rewriter fits the existing
  parser's profile (small structured JSON output, Mistral Nemo handles
  it well).
- **Per-popover cost:** ~200 input tokens (bullet text + JD context +
  criterion hint) + ~300 output tokens × 3 rewrites ≈ **$0.000012**.
  At 1,000 Pro popover opens/day across the platform, ≈ **$0.012/day**.
- **No streaming UI in v1.** We wait for the full response (~0.3 s
  typical, ~1.5 s tail) and render the 3 rewrites together. Streaming
  UI is a v2 polish.

## Risks

1. **Popover anchoring on dynamic content.** The editor renders
   templates inside `EditableResume`, which can re-render on user
   input. If a popover is anchored to an EditableText and the user
   edits a sibling leaf, the popover could drift. **Mitigation:** any
   RHF mutation auto-closes the popover (the underlying form state
   changing is the close trigger). Re-opening forces fresh anchor
   calc.

2. **AI rewrites hallucinate skills.** Mistral Nemo can suggest "Built
   Kubernetes clusters at Acme Corp" when the user has zero Kubernetes
   experience. **Mitigation:** the rewriter prompt explicitly forbids
   fabricating skills; it constrains to the user's existing bullet
   vocabulary + JD vocabulary only. Apply is manual (user clicks
   Apply, not auto-accepted). Add an `aria-live="polite"` warning in
   the popover: *"Review before applying — rewrites may paraphrase
   your intent."*

3. **Pro tier detection is async + race-prone.** Client-side
   `useUserPlan()` can lag behind a server-side gate check. A Free
   user manipulating the client (or a stale plan cache) could try to
   call `enrichBulletAction` directly. **Mitigation:** the server
   action's `requirePro()` is authoritative; client-side plan is only
   used to show/hide the "Rewrite with AI" CTA. A Free user who
   bypasses the UI still gets `{ ok: false, error: 'Pro required' }`
   from the server. Test in `tests/integration/inline-issue/pro-gate.test.ts`.

## Acceptance criteria

- [ ] Clicking any dim bar in the scorecard scrolls the editor to the
      most-relevant section within 250 ms (Free + Pro).
- [ ] The target section header pulses with the indigo accent for
      1.5 s (`@keyframes pulse-accent` in `globals.css`).
- [ ] The dynamic tip from `lib/scoring/tips.tsx` appears inline below
      the section header for 8 s and fades (Free + Pro).
- [ ] For Pro users, an additional "Rewrite with AI" button appears
      next to each dim bar; it is hidden for Free users.
- [ ] Clicking the Pro "Rewrite with AI" button opens a popover
      anchored to the target leaf with 3 AI rewrites within 1.5 s.
- [ ] Each rewrite row in the popover has Apply / Regenerate / Dismiss
      actions.
- [ ] **Apply** updates the RHF form, persists the revision via the
      existing save flow, and triggers a scorecard recompute within
      2 s. The popover auto-closes.
- [ ] **Regenerate** issues a fresh AI call with the same input; only
      the current row's content swaps.
- [ ] **Esc** closes the popover. **Outside-click** closes the popover.
      Focus is trapped inside the popover while open.
- [ ] Free users who manipulate the client to call `enrichBulletAction`
      receive `{ ok: false, error: 'Pro required' }` from the server.
- [ ] `MatchBreakdown` JSONB has a defined TypeScript shape;
      `lib/db/queries.ts` no longer has `export type MatchBreakdown =
      unknown`.
- [ ] `pnpm typecheck` clean.
- [ ] `pnpm test` green (existing 766+ tests + new 4 unit tests + 3
      integration tests).
- [ ] Manual smoke-test on dev: open variant editor with a JD attached,
      click "ATS Coverage" dim bar → verify scroll + pulse + dynamic
      tip on Experience section. Toggle Pro in DB (or via Stripe CLI),
      click again, verify "Rewrite with AI" appears and the popover
      renders 3 rewrites.

## Test plan

- **Unit** (pure functions, no IO):
  - `tests/unit/inline-issue/map-path-to-section.test.ts`
  - `tests/unit/inline-issue/prompts.test.ts`
  - `tests/unit/inline-issue/dynamic-tip-inline.test.tsx`
- **Integration** (server actions + tier gate):
  - `tests/integration/inline-issue/free-tier-pulse.test.ts`
  - `tests/integration/inline-issue/pro-tier-rewrite.test.ts`
  - `tests/integration/inline-issue/pro-gate.test.ts`
- **Manual smoke**:
  - Dev server with a seeded variant + JD attached.
  - Click each of the 7 dim bars; verify scroll + pulse + tip
    rendering on the right section.
  - Toggle Pro in the DB; verify "Rewrite with AI" appears.
  - Click it; verify popover opens with 3 AI rewrites.
  - Apply one; verify RHF state updates + scorecard recomputes.
  - Refresh page; verify the new bullet persists.

## Rollback plan

The change is **additive and feature-flag-able**:

- All new code lives under `lib/inline-issue/` and
  `app/(dashboard)/dashboard/resumes/[id]/_components/inline-issue-*`.
- The scorecard `DimensionBar` change is a `div` → `button` upgrade
  plus an additive `onIssueClick` prop. Existing hover-tip behavior
  is preserved when `onIssueClick` is absent.
- `MatchBreakdown` type change is backward-compatible: the DB column
  is JSONB; only the TS shape changes. Old `unknown` payloads remain
  parseable.

**If the popover UX fails:**
Remove the "Rewrite with AI" button from `ScorecardClient` and delete
the popover component. The Show-Me + pulse surface (already on Free)
remains. The scorecard still ships the v0.1 value.

**If the tier gate breaks:**
Revert the `requirePro()` call inside `enrichBulletAction`. The
server action becomes available to all users; the client UI's Free
vs Pro split stays in place. Worst-case regression: a Free user could
call the action programmatically. Acceptable for one bad release.

**If `MatchBreakdown` migration breaks:**
Revert the type change in `lib/db/queries.ts:1074` to `unknown`. No DB
migration needed; the type was always a type-only contract.

## Open questions for the founder — LOCKED 2026-09-20

1. **Pro detection source** — ✅ **Subscriptions table.** Use the
   existing Stripe subscriptions query. `requirePro()` reads from
   there. (No `user.isPro` boolean; subscriptions is the source of
   truth, and we'll likely want subscription metadata for analytics
   later.)
2. **Insert-as-new-bullet vs Apply-in-place** — ✅ **Defer to v2.** v1
   is Apply-in-place only. The popover ships with Apply / Regenerate
   / Dismiss. If user feedback in v1 wants "Insert as new bullet",
   add it then.
3. **Regenerate prompt history** — ✅ **Restart fresh.** Each
   Regenerate call sends only the bullet + JD + criterion hint; no
   previous rewrites in context. Cheaper, usually more diverse.
4. **No-JD behavior** — ✅ **Hide triggers.** When no JD is attached
   to the variant, the scorecard's 7 dim bars and skill-gap rows are
   not interactive. No pulse, no popover, no scroll. The Free Show-Me
   surface inherits this constraint from the scorecard. No editor
   gating.
5. **Pulse target** — ✅ **Section header.** `@keyframes pulse-accent`
   applied to the section's header element via the stable
   `id="section-{slug}"` (we add the id alongside the existing
   `data-testid`). The header is the lowest-noise and most scannable
   target. The specific `EditableText` leaf that drove the issue
   gets the inline popover anchored to it on Pro.

## ADR

`docs/decisions/0006-inline-issue-surface.md` covers: (a) why the new
`lib/inline-issue/` module instead of growing `lib/scoring/`, (b) why
the inline popover primitive lives in the editor surface rather than
the scorecard, (c) why the Free/Pro split is at the action boundary
not the UI boundary, (d) why no new AI model constant.