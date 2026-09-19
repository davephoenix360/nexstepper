# Drift audit — 2026-09-18 (planning session)

## Context

Solo planning session before resuming feature work. Goal: align
`AGENTS.md` with the current state of the product (vision vs. shipped)
and bake a planning discipline into the operating doc so future
sessions have a clear process for non-trivial features.

This is the first drift memo under the new `docs/drift/` convention
introduced in this same session.

## Vision recap

AI-assisted resume builder. The user lands, builds a master resume
(manually or by importing PDF/DOCX/pasted text), pastes a job
description for it to parse into structured `JobPostingData`, gets an
ATS-style score against the resume (4 weighted dimensions), generates
a tailored variant via AI optimization, shares the resume (public
link) or invites reviewers, and optionally collaborates in real time.

**Core loop:** master → JD parse → score → optimize → share → review →
collab. The differentiator is the score + the real-time layer.

## Roadmap status

| Item | Status |
|---|---|
| **Phase 0** — Foundation (auth, db, billing, observability, inngest, liveblocks stub, AI Gateway) | ✅ |
| **Phase 1** — Resume CRUD + master/variant + WYSIWYG editor + import flow | ✅ |
| **Phase 2** — Templates (modern, classic, classic-readonly) + browser-print PDF | ✅ (pivot documented) |
| **Phase 3** — JD parser (`lib/jd-parser/`) | ✅ |
| **Phase 3** — Resume parser (`lib/resume-parser/`) | ✅ |
| **Phase 3** — Optimize v0 (`basics.summary` rewrite) | ✅ |
| **Phase 3** — **ATS scoring engine** | ❌ **Next.** |
| **Phase 3** — Scorecard UI | ❌ **Next.** |
| **Phase 4** — AI chat assistant (`streamText` + `useChat`) | ❌ Next. |
| **Phase 4** — Daily-quota enforcement | ❌ Next. |
| **Phase 5** — Sharing (`/r/{token}`) | ✅ |
| **Phase 5** — Reviews | ❌ |
| **Phase 5** — Real-time collab UI | ❌ (server stub only) |
| **Phase 6** — Template studio | ❌ |
| — — `/api/job-contexts` + extension-ready API tokens | ❌ |
| — — Monorepo split | Deferred (single-package still) |

## Drift callouts

1. **ATS scoring never ported.** Rebuild plan §6 calls for Phase 3
   scoring; legacy `nextep/src/lib/score.ts` has the algorithm; new
   repo has no `lib/scoring/`. Without it, we're "AI resume builder
   without the AI scoring" — weaker than the legacy.

   **Resolution:** ship as the headline "Next" on the roadmap. Plan
   to land at `docs/plans/ats-scoring.md` before code.

2. **AI provider stack drift (deliberate, accepted).** Plan said
   `Anthropic Claude Sonnet` direct via `@ai-sdk/anthropic`. Reality
   is `inclusionai/ling-3.0-flash-fin-free` via
   `@ai-sdk/gateway@3` + 4-model fallback chain (free-tier coverage
   + cost; documented in `docs/ai-models-reference.md`).

   **Resolution:** refresh the locked stack row in `AGENTS.md` to
   point at the Gateway (done in this session). No ADR exists yet —
   write one when a fresh session would benefit (the AGENTS.md +
   ai-models-reference.md combination already covers the rationale for
   now).

3. **PDF render drift (deliberate, accepted).** Plan said Playwright
   via managed API; reality is browser `window.print()` on
   `/preview?print=1`. Cost & privacy rationale captured in
   `AGENTS.md` "Strategy: browser print-to-PDF" subsection.

   **Resolution:** no action. Documented in AGENTS.md Phase handoff.

4. **Optimize v0 ships ungated.** Plan said Optimize is Pro-only; v0
   ships for everyone to validate UX. Tier gate is a small
   follow-up.

   **Resolution:** roadmap item #3 (Optimize work-highlights + Pro
   tier gate).

5. **No reviews, no chat, no collab UI, no template studio, no
   `/api/job-contexts`.** Multiple plan features deferred or not
   started.

   **Resolution:** roadmap makes the priority order explicit:
   ATS scoring → chat → Optimize finish → collab → reviews →
   extension API → template studio.

6. **`db:push` workflow removed (deliberate).** Replaced by
   `db:generate` + `db:migrate` after the 2026-09-18 drift incident
   where share-link columns were missing from the dev DB.
   `scripts/sync-pending-migrations.mjs` exists for the one-off
   reconciliation.

   **Resolution:** documented in AGENTS.md Phase handoff. When a
   fresh session is tempted to call `drizzle-kit push` directly, the
   doc says no.

## Decisions made in this session

- **Planning gate:** soft with a clear trigger (>200 LOC, new
  env/dep/schema/route, or architecture-shaping change). Smaller
  work ships directly.
- **Roadmap headline "Next":** ATS scoring engine + scorecard UI.
- **Plan template location:** inline in `AGENTS.md` (not a separate
  template file). One hop for any future session.
- **Drift memo location:** `docs/drift/YYYY-MM-DD-...md`.
- **ADR location:** `docs/decisions/NNNN-<slug>.md`.
- **Locked non-goals table:** carried forward from the rebuild plan
  into `AGENTS.md` so the scope discipline is daily-visible.

## Action items

1. ✅ Update `AGENTS.md` with the new Vision / Roadmap / Planning /
   ADR / Drift sections (this audit's twin artifact).
2. Write `docs/plans/ats-scoring.md` before the next session starts
   coding the ATS scoring engine. Use the template in `AGENTS.md`.
3. (Optional, low priority) Write retroactive ADRs for the three
   documented pivots — `0001-ai-gateway-migration.md`,
   `0002-browser-print-pdf.md`, `0003-db-migrate-workflow.md` — so
   the decisions are findable from a single directory.
4. (Optional, low priority) Update `NEXTEP_REBUILD_PLAN.md` to
   reflect the AI Gateway pivot in §3 ("Recommended stack") and the
   phase plan's note about ATS scoring being the missing Phase 3
   piece. Defer until the next big doc review.