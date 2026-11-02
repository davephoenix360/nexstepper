# 0008 — Rich text is an overlay on plain text, not a change to it

## Context

A candidate needs to emphasise parts of their resume — most of all the
skills a specific posting names. That means the product needs a way to
say "this range of this field is bold", which is a data-model decision
before it is a UI decision.

The constraint that decides it: **the resume's text is load-bearing
across the whole product.**

- The ATS scoring engine (8 dimensions, BM25 tokenization, the Jev
  semantic evaluators) reads `sections.*` strings directly.
- `lib/scoring/dimensions/content-quality.ts` counts digits in bullets
  and checks the opening action verb against `ACTION_VERBS`.
- `lib/chat/page-fit.ts` estimates page count from character counts and
  measured section heights.
- `lib/chat/tools/edit-resume.ts` matches the AI's proposed edits
  against existing strings.
- `lib/resume-parser/` asks an LLM to produce plain section strings.
- The GDPR export (`lib/data-rights`) hands the envelope to the user as
  JSON.

If markup enters the stored strings, every one of those consumers
changes behaviour at once, and the scores users have already seen stop
meaning what they meant. The product has already shipped this class of
bug once: the list badge and the scorecard showed different numbers
because two surfaces each computed "the score" their own way
(`docs/drift/2026-10-23-list-score-badge-divergence.md`).

Meanwhile the editor's own model is deliberately plain: `EditableText`
is a click-to-edit `<input>` that commits a **string** on blur, and the
whole undo history is a JSON snapshot of the form values.

So the question is: where does formatting live?

## Decision

**Formatting is a path-addressed overlay stored alongside the resume
data. The stored text never changes.**

```ts
resumeDataSchema = z.object({
  sections: resumeSectionsSchema,   // plain strings — untouched
  // …
  formatting: z.record(
    z.string(),                      // 'sections.skills.0.keywords.2'
    z.array(z.object({
      text: z.string(),              // the literal text this span covers
      start: z.number().int().min(0),
      marks: z.array(z.enum(['bold', 'italic', 'underline'])).min(1)
    }))
  ).optional()
});
```

Four rules make this work:

1. **The text is the content.** `sections` stays plain. The overlay
   never adds, removes or alters a character.
2. **The overlay is optional and additive.** No migration, no backfill,
   no version flag. A resume with no `formatting` behaves exactly as it
   does today.
3. **Paths are the existing vocabulary.** The same dotted paths
   react-hook-form uses and the chat tools already use
   (`sections.work.0.positions.0.highlights.1`).
4. **Marks carry their anchor text.** A span stores both the offset and
   the literal text it covers, so it can re-find itself after the text
   moves. A mark that can no longer be anchored is **dropped**, never
   applied to the wrong words — losing a bold is cosmetic, bolding the
   wrong phrase is a lie.

Rendering goes through **one** component, `<RichText>`, used by the
editor's idle state, the read-only `Field*` helpers and
`classic-readonly.tsx` — so the editor, the preview, the share link and
the printed PDF cannot disagree about what a marked line looks like.

The overlay lives inside the react-hook-form values (the form's values
*are* `ResumeData`), so the existing debounced autosave and the existing
local-storage undo history pick it up with no change to either.

## Consequences

**Good:**

- **The ATS score cannot move.** Structurally, not by convention. A
  test asserts `scoreResumeFromEnvelope` is deeply equal with and
  without marks.
- The scoring engine, the parsers, the AI's edit-matching and the
  page-fit estimator keep reading exactly what they read today. Zero
  changes to any of them.
- No DB migration, no backfill, no version negotiation, no second
  persisted copy of the text to drift.
- Autosave and undo/redo come for free — the map is inside the form
  values both already watch.
- The AI agent can be given formatting tools later without a new
  vocabulary: the path scheme already exists.
- One renderer means the editor and the share link agree by
  construction.

**Bad:**

- **Two things to keep in sync**: the plain text and the overlay. The
  re-anchoring algorithm is the mitigation, and it is the most subtle
  code in the feature.
- **A partially-applied rollback loses data.** Zod strips unknown keys,
  so removing `formatting` from the schema while the rest of the
  feature is still live would silently drop formatting on the next save
  of any resume. The schema change and the feature must be reverted
  together.
- Bold text is wider, so the measurement-fitted page-fit estimate can
  drift slightly for a heavily formatted resume. Accepted for v1.
- Character-offset semantics are fiddly. The `text` anchor is what
  makes them survivable, and it is not free.

## Alternatives considered

**Markdown in the stored string (`**Postgres**`).** Simplest possible
schema — no new field at all, and the AI could write it naturally.
Rejected: it puts markup in the content, which is the one thing this
decision exists to prevent. It collides with literal asterisks a
candidate might genuinely type (`*args`, `**kwargs`, a glob pattern),
it needs an escaping story for those, and it makes the stored text
differ from the text the ATS sees — which is the whole problem. The
product already renders Markdown for the **job description** panel
(`docs/plans/jd-markdown-format.md`), where the content is
machine-authored and never scored; a resume is the opposite case.

**Structured rich text (every text field becomes `{ text, spans }`).**
The canonical model, and what a general-purpose editor would use.
Rejected on blast radius: it changes the type of every text leaf in
the schema, all six templates, all eight scoring dimensions, the AI
tools, the parser and the undo history — in a codebase where the
scoring numbers are a promise to users. The same information, at a
fraction of the risk, for a feature whose vocabulary is three marks.

**A separate `resume_formatting` table.** Would allow querying "which
resumes have bold text" and would keep the JSONB envelope clean.
Rejected: the data is meaningless without its resume (it is a path
offset into a string), so it is not independently queryable in any way
that matters; and it would need its own migration, its own cascade
rules and its own GDPR handling.

**`contentEditable` with a caret inside formatted text.** The
"correct" rich-text editor, and it would give a real keyboard-first
experience. Rejected for v1: it turns `EditableText` into a much
harder component (caret restoration, paste sanitisation, IME, and a
direct collision with the existing Ctrl+Z field-level undo the editor
deliberately preserves). The selected-text-then-toolbar interaction
covers the same need without touching the text editor at all.
