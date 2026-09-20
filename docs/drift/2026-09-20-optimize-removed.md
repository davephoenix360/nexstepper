# 2026-09-20 -- Optimize tool removed from the codebase

## What shipped (well, what was un-shipped)

The Optimize tool v0 (shipped 2026-09-18 on
`feat/optimize-basics-summary`, commit `f4f3e2a`, per AGENTS.md
§"Optimize tool v0") was a "rewrite basics.summary against a
target JD" feature. Its UX was a side-by-side diff in a modal
that the user had to navigate to from the resume editor.

**That whole surface is now gone.** The dashboard home removed
the Optimize card on 2026-09-20 (per AGENTS.md). The Optimize
button on the editor action bar was never present (it never
made it past the dashboard card removal). The
`app/(dashboard)/dashboard/resumes/[id]/optimize-actions.ts`
file referenced in AGENTS.md was deleted.

**This session removed the last dead code:**

- `lib/optimize/optimize-resume.ts` -- the orchestrator
  (`optimizeSummarySection()`, `OPTIMIZER_SYSTEM_PROMPT` consumer).
  194 LOC.
- `lib/optimize/prompts.ts` -- the prompt builders
  (`buildSummaryUserPrompt` + stubbed `buildWorkHighlightsUserPrompt`).
  ~180 LOC.
- `tests/unit/optimize/optimize-resume.test.ts` -- 21 tests.
- `tests/unit/optimize/prompts.test.ts` -- 5 tests.
- `lib/ai/providers.ts` -- `OPTIMIZE_MODEL` constant + its
  docblock (it was a placeholder pointing at `PARSER_MODEL`).
- `tests/unit/ai/providers.test.ts` -- 1 test that asserted
  `OPTIMIZE_MODEL === PARSER_MODEL`.

Total: ~400 LOC of dead code + 26 tests deleted. The repo
shrinks by ~400 lines.

## Why

The user (founder-as-anchor) reviewed the Optimize UX and called
it "extremely strange" -- the click-to-optimize pattern took
the user out of the resume editor they were actively editing.
That's the wrong mental model for a tool whose whole job is to
help the user improve what's on the page they're already
looking at.

The right mental model is closer to Grammarly: underline the
problem in place, hover for the fix, one-click apply. **But
the user explicitly cautioned**: Grammarly is an example, not
the target. Resume editors have their own context (sections,
JD alignment, ATS scoring, work-history dates) that Grammarly
doesn't. A naive "copy Grammarly" implementation would carry
the wrong assumptions.

So:

- **Don't ship Optimize in its current form.** The dead code
  sat there waiting for someone to naively wire it back up.
  Removing it makes the right move the obvious one for the
  next session -- there's nothing to fall back to.
- **Defer a real Optimize to a future session that does the
  research.** That session will need to: study resume-editor
  conventions (Reactive Resume, standard resume, Teal, etc.),
  decide what "inline issue surfacing" actually means for this
  product (per-axis miss list? hover-tooltip on the section
  title? a side rail that highlights the paragraph in sync?),
  and design before code.

## What this unlocks

- **Clean slate for the next session.** A fresh
  `docs/plans/inline-issue-surface.md` (or whatever it ends
  up called) can design the feature without arguing about
  legacy code. The dead tests don't have to be retrofitted;
  the dead prompts don't have to be revived.
- **The 400 LOC can become a new template.** The same effort
  in this session ships three new resume templates (minimal,
  executive, creative) instead of carrying dead code that
  confuses the next contributor.
- **AGENTS.md stops lying.** The "Phase handoff" entry that
  describes "Optimize tool v0 (shipped 2026-09-18)" gets a
  follow-up "2026-09-20 -- Optimize removed" pointing at this
  drift memo so future readers don't waste time grepping
  `lib/optimize/` for code that's no longer there.

## Files touched

- **Deleted (Recycle Bin via mavis-trash):**
  - `lib/optimize/optimize-resume.ts`
  - `lib/optimize/prompts.ts`
  - `tests/unit/optimize/optimize-resume.test.ts`
  - `tests/unit/optimize/prompts.test.ts`
- **Changed:**
  - `lib/ai/providers.ts` -- removed `OPTIMIZE_MODEL` constant
    and its docblock (~12 lines).
  - `tests/unit/ai/providers.test.ts` -- removed `OPTIMIZE_MODEL`
    import + 3 test references.
  - `lib/db/queries.ts` -- rewrote the `MatchBreakdown` JSDoc
    to point at "future inline issue-surface tool" rather
    than "Optimize tool".
  - `AGENTS.md` -- removed "Optimize tier gate" + "Optimize
    work highlights" queued items (they were moot). Added a
    follow-up note to the "Optimize tool v0" phase handoff
    entry pointing at this drift memo.

## Action items for the next session(s)

1. **Plan the real Optimize UX.** The user wants the next
   session to start with research, not code:
   - Read existing resume editors (Reactive Resume,
     standardresume.co, Teal, etc.) for inline issue patterns.
   - Decide on the surface: side rail vs. inline highlights
     vs. hover-tooltip. Consider our specific context: ATS
     scorecard is already a right-rail; the new feature
     should complement, not duplicate.
   - Land in a `docs/plans/inline-issue-surface.md` plan
     before any code.
2. **The `MatchBreakdown` shape** (currently `unknown` JSONB in
   `lib/db/queries.ts`) is reserved for whatever this feature
   eventually writes. Don't migrate the type until the design
   is committed.
3. **AI model choice for the new feature**: when the
   design lands, prefer Mistral Nemo (the existing primary,
   ~$0.02/$0.03 per M tokens) for the small "enrich this
   suggestion" tasks; consider a cheaper small model
   (e.g. `meta/llama-3.1-8b` already in the fallback chain)
   for the very-small per-token enrichment calls. No need
   to add a new model constant up-front.

## Test state

Before: 766/766 green.
After: 727/727 green (26 optimize tests removed; nothing else
broken).

Typecheck: clean.

## Reference

- This drift memo: `docs/drift/2026-09-20-optimize-removed.md`
- AGENTS.md §"Optimize tool v0 (shipped 2026-09-18)" -- historical
  entry; follow-up appended in this session.
- AGENTS.md §"Now" -- removed (the Optimize card was already
  gone from the dashboard home before this session).
