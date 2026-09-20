# 0006 — Inline Issue Surface (Dim-Bar Funnel + Tier-Gated AI Rewrites)

## Context

The Optimize tool v0 — a side-by-side summary-rewrite modal — shipped
in 2026-09 and was retired the same week. The founder considered the
UX "extremely strange" because it pulled the user out of the resume
editor they were actively editing (drift memo
`2026-09-20-optimize-removed.md`). The dead `lib/optimize/` code was
deleted in `ace57fb` to prevent naive re-use.

Three forces shaped the replacement:

1. **The scorecard is already there.** The variant editor's right rail
   ships with a 7-dimension ATS scorecard and a per-skill miss list,
   both built off `ScoreBreakdown` and `lib/scoring/tips.tsx`. The
   editor itself is a WYSIWYG RHF surface with stable
   `data-testid="editable-{path}"` attributes on every leaf. No
   competitor ties inline suggestions to their own ATS scoring
   dimensions; that's our wedge.
2. **The AI is cheap enough to use per-click.** Mistral Nemo at
   $0.02/$0.03 per M tokens makes one popover open ≈ $0.000012.
   Streaming UI and pre-fetching are unnecessary.
3. **The user needs to stay in the editor.** Any pattern that takes
   the user out of the editor (full-screen modal, separate tab,
   dedicated AI page) repeats v0's antipattern.

A tier gate is required because the AI rewrite layer is the upsell.
The locked non-goals do not address tier gating; the drift memo's
record of Optimize v0 being Pro-gated is the precedent.

## Decision

Ship a new feature called the **inline issue surface**, scoped as:

### 1. New `lib/inline-issue/` module — not an extension of `lib/scoring/`

The scoring engine's job is to *measure*. The inline surface's job is
to *act*. The two concerns evolve independently: scoring dimensions
will keep landing as the ATS corpus expands, while the action surface
will keep growing triggers, anchor strategies, and tier-gated
affordances. Coupling them in `lib/scoring/` would turn that module
into a god-object.

`lib/inline-issue/` owns: prompt templates, path-to-section mapping,
popover anchor helpers, and the re-export of `MatchBreakdown` types.
It imports from `lib/scoring/`; the reverse is forbidden.

### 2. Inline popover primitive lives in the editor surface, not the scorecard

The popover is anchored to an `EditableText` leaf via its existing
`data-testid="editable-{path}"`. Anchoring it inside the scorecard
would require duplicating the editor's DOM contract in the scorecard
(which is on the right rail, not over the editor) and would force
the popover into a sidebar — exactly the v0 antipattern.

The scorecard is the **funnel** (a button). The editor is the **fix
surface** (the popover). Two surfaces, one product flow.

### 3. Free/Pro split is at the server-action boundary, not the UI boundary

`enrichBulletAction` calls `requirePro()` at the top. Free users
who manipulate the client to invoke the action still get
`{ ok: false, error: 'Pro required' }` from the server. The
client-side `useUserPlan()` is **only** used to hide the "Rewrite
with AI" CTA — never to gate the AI call itself.

This avoids the class of bug where the client thinks you're Pro but
the server disagrees (or vice versa). Authoritative check on the
server; cosmetic gating on the client.

### 4. No new AI model constant — reuse `PARSER_MODEL` + `PARSE_FALLBACKS`

The rewriter fits the existing parser's profile: small structured
output (3 short bullets in JSON), Mistral Nemo handles it well on
the free tier, same cross-provider failover chain. Adding a new
constant would mean a new cold-cache model load, a new observability
row in the Vercel dashboard, and a new prompt template to maintain —
none of which are justified by the workload.

### 5. Lazy AI, not eager

No AI call runs on scorecard render. The AI runs only when the user
clicks "Rewrite with AI" in the popover. Eager (pre-fetch on
scorecard render) wastes ~99% of pre-fetched rewrites because most
users don't click every dim bar. Lazy keeps the cost at $0 per click
and ~$0.000012 per popover open.

### 6. `MatchBreakdown` JSONB type migrates from `unknown` to a real shape

The DB column already exists and is JSONB. Only the TS surface
changes. No migration; old payloads still parse.

## Consequences

**Good:**
- The editor stays primary. The scorecard is already part of the
  editing surface; making it interactive costs no extra real estate.
- Free users get real value (Show-Me + dynamic tip + pulse) without
  paying for AI; Pro gets the AI rewrite loop on top.
- The feature is incremental and additive. Rollback is "remove the
  Rewrite with AI button" — Free surface keeps shipping.
- `lib/inline-issue/` can grow triggers (e.g. inline actions on the
  JD panel, "fix this requirement" links) without coupling to scoring
  internals.

**Bad:**
- One new client hook (`useUserPlan`) to plumb. Already needed for
  other features in the pipeline (chat assistant quota display);
  the inline surface pays the cost first.
- One new server action. The pattern is well-established; risk is
  low, but the file count grows.
- Popover UX requires careful focus management and z-index handling
  over the editor. We will use `radix-ui/react-popover` (already in
  the lockfile), which gives us focus trapping for free.
- The Free/Pro split at the action boundary means a brief state where
  the CTA is visible (before `useUserPlan` resolves) and then hidden.
  Acceptable: the action returns an error if called; the UI is
  optimistic-CTA, pessimistic-action.

## Alternatives considered

- **Grow `lib/scoring/` instead of new `lib/inline-issue/`.** Rejected:
  scoring measures, actions fix. Two responsibilities; one module.
- **Anchoring the popover inside the scorecard surface.** Rejected:
  would push the popover into a sidebar, repeating the v0 antipattern.
- **UI-level tier gate only.** Rejected: trust-boundary bug class.
  Authoritative check on the server; cosmetic on the client.
- **New model constant for rewrites.** Rejected: no workload
  justification. Same `PARSER_MODEL`/`PARSE_FALLBACKS` chain.
- **Eager AI pre-fetch on scorecard render.** Rejected: ~99% waste
  rate; lazy costs nothing for users who don't click.
- **Grammarly-style "Suggestions" mode toggle.** Rejected: mode
  toggles add learning cost and compete with the right rail for
  space; the dim bar is already the natural trigger.
- **Real-time inline scoring as the user types (Rezi pattern).**
  Rejected: would require abandoning the RHF editor and rebuilding
  the template system. Massive scope; deferred.