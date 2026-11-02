# Rich Text Formatting — Plan

> Plan template: [`AGENTS.md` § Planning discipline](../../AGENTS.md#planning-discipline).
> Branch: `feat/rich-text-formatting`. Commit footer: `Plan: docs/plans/rich-text-formatting.md`.
> ADR: [`docs/decisions/0008-rich-text-overlay.md`](../decisions/0008-rich-text-overlay.md).

## Objective

Let a candidate emphasize the parts of their resume that matter for a
specific posting — most of all **the skills the posting asks for** — by
bolding, italicizing or underlining text, and let that emphasis survive
all the way to the printed PDF and the public share link.

Today a resume is a bag of plain strings. The stored text, the ATS
scoring engine, the AI parsers and the six templates all read the same
plain characters, and that shared plainness is load-bearing: the scoring
engine's numbers, the page-fit estimate, the AI's edit-match and the
BM25 tokenization are all computed over exactly those strings.

So this plan adds formatting **without touching a single character of the
stored text**. Formatting is an overlay — a small, path-addressed map of
"this range of this field carries this mark" — and the plain string
stays the single source of truth for content.

**The one rule this plan is built around:**

> Formatting is presentation. The text is the content. Nothing in the
> formatting layer may alter a stored character, and nothing may move
> the ATS score.

### Why the "bold the JD's skills" convention matters

In engineering, product and data roles it is close to standard practice
to bold the handful of skills a posting names — `Postgres`, `Kubernetes`,
`Go` — so the reader's eye lands on them, and so the resume reads as
aimed at *this* job rather than copied from a general-purpose file.
We have no way to express that today. A candidate who wants it must
hand-format outside the tool and lose every other benefit of editing
here.

There is a second, quieter reason to build it: the pattern is a
**filter**. Bolding only what the posting asks for is how a candidate
signals "I read this job description". That is a real differentiator for
a product whose whole promise is "aimed at this posting".

### What this plan does NOT claim

It does not claim that bolding improves an ATS score. It does not.
The ATS score is computed over plain text and is unaffected by
formatting, by construction, and this plan has a test that asserts
exactly that (§ Acceptance criteria). The UI says so plainly rather
than letting users believe that decoration buys points.

## User-visible behavior

### Slice 1 — manual formatting (this plan's first ship)

1. The user **selects text with the mouse** anywhere in the rendered
   resume (a bullet, the summary, a skill keyword, a job title).
2. A **floating mini-toolbar** appears above the selection with three
   buttons — **B**, *I*, U — plus a "clear" action.
3. Clicking a button applies (or toggles off) that mark on the
   selection. The text re-renders with the mark immediately.
4. The toolbar is editor-only chrome. It does not exist in the preview,
   the share link, or the printed PDF.
5. Formatting appears in **every** output surface: the editor, the
   `/preview` page, the public share link, and the browser's
   "Save as PDF".

Keyboard and no-mouse paths:

6. **Ctrl/Cmd+B on a focused field** toggles bold on the **entire
   field value** — the fast path for a skill chip, a company name, or a
   whole bullet.
7. The toolbar buttons are real buttons: focusable, labelled, and
   operable with Enter/Space.

Feedback and recovery:

8. If a mark can no longer be anchored to the text it was applied to
   (the text was rewritten), that mark is **dropped, not misapplied**,
   and the editor reports how many were dropped.
9. "Clear formatting" on a field removes every mark from that field. A
   "Clear all formatting" action exists at the editor level.

### Slice 2 — auto-bold the posting's skills (planned here, built after)

10. A **"Highlight this job's skills"** action on a variant with a
    parsed posting bolds every requirement skill the resume
    demonstrably has, and **underlines the must-haves** so a must-have
    and a nice-to-have are visually distinguishable.
11. Eligibility gates (a degree, a certification, a work-authorisation
    requirement, a years-of-experience threshold) are **never** marked —
    there is no text to bold for them.
12. The action is a single undoable step, and it reports exactly what
    it changed ("Bolded 7 skills, underlined 3 must-haves").

### Slice 3 — Scout formats too (planned here, built later)

13. The chat agent can be asked to "bold my React experience". The
    storage format is already path-addressed, so this is an AI tool
    plus prompt work, not a re-architecture.

## Scope (in) — Slice 1

- **Marks:** `bold`, `italic`, `underline`. Three, and only three
  (§ Non-goals for why the list is deliberately short).
- **Every text leaf** that renders through the editor's shared
  primitives — `EditableText`, `EditableTextarea`, `BulletList`,
  `KeywordChips` — and their read-only twins in
  `components/resume-templates/field.tsx` (`Field`, `FieldArea`,
  `FieldChips`, `FieldBullets`). One rule, no per-field opt-in
  list: a whitelist is a special-case list, and special-case lists are
  how surfaces drift apart in this codebase.
- **The storage overlay**: an optional `formatting` field on the
  resume envelope, holding path → spans.
- **The renderer**: one `<RichText>` component that every surface
  uses, so the editor, the preview, the share link and the print output
  agree **by construction** rather than by two implementations happening
  to match.
- **The editor interaction**: drag-select → floating toolbar → mark.
  Plus the whole-field Ctrl/Cmd+B path.
- **Undo/redo integration**: a formatting change is one undoable step.
- **A "clear formatting" escape hatch**, per field and globally.

## Non-goals (out of this plan)

- **Colour, font size, font family, highlight, strikethrough, links,
  superscript/subscript, alignment.** Not a technical limit — a
  product one. A resume in a second colour, a second typeface or a
  highlight-yellow marker is a red flag for an ATS parser and for a
  human reviewer. The mark vocabulary is narrow on purpose.
- **Markdown in the stored string** (`**bold**`). Rejected in the ADR;
  the short version is that it puts markup in the content, which is the
  one thing this plan exists to avoid.
- **A full rich-text editor** (contentEditable, caret management,
  `/`-triggered command menus, ProseMirror or Tiptap). The text editor
  stays a plain `<input>`.
- **Formatting the contact line, dates or template chrome.** They are
  text leaves and therefore *technically* formattable, but the toolbar
  should not invite a candidate to bold their own phone number.
- **Slice 2 (auto-bold) and Slice 3 (Scout formats).** Planned here,
  built after. See § Later phases.
- **Any change to the ATS scoring engine.** Formatting is invisible to
  it by construction and by test.
- **A PDF/DOCX exporter.** Out of scope — the product's output path is
  the browser's "Save as PDF" (ADR 0002). Formatting rides that path
  for free because the marks are real HTML at print time.
- **Per-template formatting styles** ("in this template, underline means
  something else"). One vocabulary, everywhere.
- **A formatting "lint"** ("you have 14 bolded skills — that is a lot").
  Nice, but it is a judgement call that needs product design, not a
  v1 rule.

## Architecture

### The three layers

```
┌─ LAYER 1 — SCHEMA (what is stored) ──────────────────────────────┐
│  resumeDataSchema                                                │
│    sections.*            ← plain strings, UNTOUCHED             │
│    formatting?: {                                         NEW   │
│      "<dotted path>": [                                      NEW   │
│        { text, start, marks: ['bold'|'italic'|'underline'] }    │  │
│      ]                                                          │  │
│    }                                                            │  │
└──────────────────────────────────────────────────────────────────┘
                              │
┌─ LAYER 2 — PURE LOGIC (lib/rich-text/, no React) ────────────────┐
│  resolveSpans(value, spans)   → re-anchor marks onto the text   │
│  addMark / removeMark         → span algebra over a range       │
│  plainTextOf(rendered)        → the ATS-visible text             │
└──────────────────────────────────────────────────────────────────┘
                              │
┌─ LAYER 3 — RENDER (one component, every surface) ───────────────┐
│  <RichText value spans as className />                          │
│    → <strong> / <em> / <u> wrapping the marked ranges            │
│    → used by EditableText (editor) AND Field* (read-only) AND    │
│      classic-readonly (share + marketing)                       │
└──────────────────────────────────────────────────────────────────┘
```

### The storage model

```ts
// lib/resume-schema/rich-text.ts

export const richMarkSchema = z.enum(['bold', 'italic', 'underline']);
export type RichMark = z.infer<typeof richMarkSchema>;

export const richSpanSchema = z.object({
  /** The literal text this span covers. This is the re-anchoring anchor. */
  text: z.string().max(4000),
  /** Character offset of `text` within the field value, at save time. */
  start: z.number().int().min(0),
  /** Non-empty. A span with no marks is meaningless. */
  marks: z.array(richMarkSchema).min(1).max(3)
});
export type RichSpan = z.infer<typeof richSpanSchema>;

/**
 * path → spans. Paths use the SAME dotted vocabulary as react-hook-form
 * field paths and the chat tools' edit paths:
 *   'sections.skills.0.keywords.2'
 *   'sections.work.0.positions.0.highlights.1'
 */
export const richTextSchema = z.record(z.string(), z.array(richSpanSchema).max(400));
export type RichTextMap = z.infer<typeof richTextSchema>;
```

and on the envelope:

```ts
export const resumeDataSchema = z.object({
  sections: resumeSectionsSchema,
  // …existing envelope fields…
  /**
   * Formatting overlay. Optional: every resume that predates this
   * feature parses cleanly with `formatting` undefined, and a resume
   * with no formatting behaves exactly as it does today.
   */
  formatting: richTextSchema.optional()
});
```

### Why this shape — four properties, in priority order

1. **The stored text is untouched.** `sections` still holds plain
   strings. Scoring, BM25, the Jev evaluators, the digit check, the
   action-verb check, page-fit estimation, the AI's edit-matching and
   the resume parser all keep reading exactly what they read today.
   *This is the property the whole plan exists to protect.*
2. **Optional and additive.** No DB migration (the envelope is JSONB),
   no backfill, no version flag. Old resumes are valid resumes.
3. **Path-addressed.** The same dotted-path vocabulary already in use by
   react-hook-form, the chat tool (`lib/chat/tools/types.ts`) and the
   inline-issue mapper (`lib/inline-issue/criterion-to-path.ts`). Slice
   3 (Scout formats) needs no new vocabulary.
4. **Self-healing.** Each span carries the literal `text` it covers, so
   a mark can find its anchor again after the text around it changes.

### Re-anchoring — the algorithm that makes drift survivable

Character offsets are fragile: insert a character at the start of a
bullet and every later offset in that field is wrong. A naive
implementation would then bold the wrong words — the single worst
failure mode this feature could have, and invisible to the user.

So a span stores **both** an offset and the text it covers, and
resolution happens at render time, in one pure function:

```ts
// lib/rich-text/resolve.ts
export function resolveSpans(value: string, spans: RichSpan[]): {
  spans: RichSpan[];       // re-anchored, sorted, non-overlapping
  dropped: RichSpan[];     // could not be anchored — surfaced to the UI
};
```

For each span, in order:

1. **Exact hit** — `value.slice(start, start + span.text.length) ===
   span.text` → keep it where it is. (The common case: nothing moved.)
2. **Re-anchor** — the text is still in the field, just somewhere else.
   Find every occurrence of `span.text` and take the one **closest to
   the original `start`**. → move the span there.
3. **Drop** — the text is gone (the user deleted it, or the AI rewrote
   the sentence). → the span is dropped and reported.

**The failure mode is a missing mark, never a wrong mark.** That
asymmetry is the whole design: losing a bold is a cosmetic annoyance
the user can re-apply; bolding the wrong words is a lie on the resume.

Overlapping spans are resolved by clipping, then identical adjacent
spans are merged, so the stored map stays canonical.

### The renderer — one component, every surface

```tsx
// components/rich-text/rich-text.tsx  (server-safe, no 'use client')
export function RichText({
  value,
  spans,
  as: Tag = 'span',
  className,
  path
}: RichTextProps) {
  const resolved = resolveSpans(value, spans).spans;
  // No spans → render `value` as ONE text node. The DOM is byte-identical
  // to today's output, so every existing snapshot / print test still passes.
  // With spans → slice the value into segments and wrap the marked ones.
}
```

`path` is emitted as `data-rich-path` on the rendered container. It is
how the editor knows which field a mouse selection landed in — the
selection handler walks up from the selection's anchor node to the
nearest `[data-rich-path]` ancestor.

Why one component and not a per-template change: five of the six
templates (`modern`, `jake`, `executive`, `creative`, `minimal`) already
render every text leaf through the four shared helpers in
`components/resume-templates/field.tsx`. `classic` does not — it calls
`EditableText` directly (37 call sites) and delegates its read-only twin
to `classic-readonly.tsx`, which renders raw string interpolation. So
the work is:

- the four `Field*` helpers' read-only branches → `RichText`;
- `EditableText` / `EditableTextarea`'s idle branch → `RichText`;
- `classic-readonly.tsx`'s text leaves → `RichText`.

That is the whole surface. And because the editor's idle render and the
read-only render are the **same component**, the editor and the share
link cannot disagree about what a marked line looks like — the same
"one helper called by both surfaces" rule that fixed the list-vs-page
score badge divergence (`docs/drift/2026-10-23-list-score-badge-divergence.md`).

### The editor interaction

```
   user drags over "Postgres" in a bullet
              │
              ▼
   mouseup → document selectionchange
              │
              ├─ selection is empty / collapsed      → hide toolbar
              ├─ anchor + focus in different fields → hide toolbar
              │     (cross-field selection is not supported in v1)
              └─ both inside one [data-rich-path]   → SHOW TOOLBAR
                        │
                        │  (offset computed by walking the container's
                        │   text nodes: the concatenation of the text
                        │   nodes equals the field value exactly, because
                        │   RichText adds no characters of its own)
                        ▼
              { path, start, end, text }
                        │
                        ▼
              user clicks B / I / U
                        │
                        ├─ toolbar's onMouseDown calls preventDefault()
                        │  → the selection is NOT collapsed by the click
                        ▼
              addMark(value, spans, start, end, mark)   [pure]
                        │
                        ▼
              setValue('formatting', nextMap)   ← one RHF write
```

**The click-to-edit conflict, and how it is resolved.** The editor's
idle state is click-to-edit (`EditableText`'s `onClick` opens an
`<input>`). A drag-select ends with a `click` event, so the naive
implementation would open the editor and destroy the selection the user
just made.

The guard: `EditableText.startEdit()` reads `window.getSelection()`
first. If the selection is **not collapsed** and is anchored inside this
element, the click was a selection gesture, not an edit gesture → do not
open the editor. A plain click leaves the selection collapsed → the
editor opens, exactly as today.

**Double-click-to-select-a-word is not in v1.** The first click of a
double-click leaves the selection collapsed, so it opens the editor and
the word never gets selected. Supporting it requires deferring the
editor open (a ~250 ms delay on every click-to-edit, or a
click/double-click disambiguation), which makes the product's primary
interaction feel laggy for a secondary convenience. Deferred, not
forbidden.

**Dismissal.** Clicking outside the toolbar hides it and **suppresses
the next click-to-edit** (otherwise the dismiss click opens whichever
field the user happened to click).

### Why the marks live in the RHF form

`formatting` is a field of `ResumeData`, and the editor's RHF form's
values *are* `ResumeData` (`defaultValues: initialData`, resolver
`resumeDataSchema`). So putting the map in the form gets three things
for free:

- **Autosave** — `useDebouncedAutosave` watches the whole form
  (`useWatch({ control })`) and JSON-stringifies it. The map rides
  along. **No change to the autosave hook.**
- **Undo/redo** — `useUndoHistory` snapshots the whole form as a JSON
  string in `localStorage`. The map is in the snapshot; `form.reset`
  restores it. **No change to the undo history.** A formatting change is
  one `setValue` → one snapshot → one Ctrl+Z.
- **AI-applied revisions** — when Scout writes a revision and the page
  calls `form.reset(initialData)`, the map resets with everything else.

The single-owner rule: **only `lib/rich-text/` and the one hook that
writes the map may write it.** The map is read from
`useWatch({ name: 'formatting' })` (RHF is the source of truth; there
is no duplicate React state to drift).

### Slice 2 — auto-bold, in detail (planned, not built in slice 1)

The inputs already exist:

- `lib/jd-parser/` produces the posting's requirements, and the
  requirement evaluation already separates **eligibility gates** from
  scored requirements.
- `lib/scoring/skill-match.ts` (`isSkillCovered`) and the Jev
  requirement evaluator already know **which skills the resume
  demonstrates, and how strongly**.
- `lib/scoring/dimensions/intent-coverage.ts` already answers "is this
  skill present" far better than a substring test.

So the action is a mapping, not a new model:

1. Take the posting's requirement entries that are **not** eligibility
   gates.
2. Keep the ones the resume **demonstrates** (evidence above the
   engine's own threshold).
3. Locate each one in `sections.skills[*].keywords[*]` — and, if the
   user wants, in the bullets where the skill is actually evidenced.
4. Mark the skill keywords: **bold** for every demonstrated skill,
   **underline** on top for the must-haves.

Two rules make this honest rather than decorative:

- Only skills the resume **demonstrates** get marked. Bolding a skill
  the posting asks for but the resume only name-drops would be
  overclaiming, and this product's whole promise is honesty about what
  the resume shows.
- **Eligibility gates are excluded.** A degree requirement has no text
  to bold, and pretending otherwise is a category error.

### Later phases

| Phase | What | Depends on |
|---|---|---|
| 1 (this plan) | Overlay, renderer, toolbar, whole-field Ctrl+B, clear | — |
| 2 | "Highlight this job's skills" auto-bold + underline must-haves | Phase 1's map + the existing requirement evaluation |
| 3 | Scout can apply formatting (`formatResume` tool) | Phase 1's path vocabulary |
| 4 | Double-click-a-word, whole-field formatting from a context menu, "clear all" polish | Phase 1 |

## Files

### New

- `lib/resume-schema/rich-text.ts` — `richMarkSchema`, `richSpanSchema`,
  `richTextSchema` + types. Sits with the other schemas because it is
  part of the envelope.
- `lib/rich-text/resolve.ts` — `resolveSpans(value, spans)`: re-anchor,
  clip, merge, report drops. Pure, no IO, no React.
- `lib/rich-text/spans.ts` — the span algebra: `addMark`, `removeMark`,
  `toggleMark`, `mergeSpans`, `spansForWholeValue`. Pure.
- `lib/rich-text/plain-text.ts` — `plainTextOf(container)`: the text an
  ATS would see. Used by the render-level invariant test.
- `lib/rich-text/paths.ts` — path builders (`skillKeywordPath(i, j)`,
  `workHighlightPath(i, k, j)`) so templates and Slice 2/3 address
  fields the same way.
- `components/rich-text/rich-text.tsx` — **the renderer.** Server-safe.
  Used by every surface.
- `components/rich-text/rich-text-toolbar.tsx` — the floating B / I / U
  toolbar (client). `no-print`.
- `components/rich-text/use-rich-selection.ts` — selection → `{ path,
  start, end, text }` (client).
- `components/rich-text/use-formatting.ts` — the one hook that reads the
  map from RHF and writes it back (client).
- `docs/decisions/0008-rich-text-overlay.md` — the ADR.

### Changed

- `lib/resume-schema/resume-data.ts` — add `formatting: richTextSchema.optional()`.
- `lib/resume-schema/index.ts` — export the new schema + types.
- `components/editable/editable-text.tsx` — idle state renders
  `RichText`; `startEdit` bails when a selection is active; Ctrl/Cmd+B
  toggles a whole-field mark; emit `data-rich-path`.
- `components/editable/editable-textarea.tsx` — same, for multi-line.
- `components/editable/bullet-list.tsx` — bullets inherit it via
  `EditableText`; add the `data-rich-path` for the list item.
- `components/editable/keyword-chips.tsx` — chips inherit it; a chip is
  a whole-field value, so bolding one is a whole-value mark.
- `components/resume-templates/field.tsx` — the four `Field*` helpers'
  read-only branches render `RichText`; `FieldChips` renders per-item
  when any chip is marked (and keeps today's single joined string when
  none is).
- `components/resume-templates/classic-readonly.tsx` — its text leaves
  render `RichText` (it is the only template still interpolating raw
  strings).
- `components/editable/editable-resume.tsx` — mount the formatting
  provider; add the "clear all formatting" action; show the dropped-mark
  count.

### Unchanged (deliberately)

- `lib/scoring/**` — the engine never sees `formatting`. It is not in
  `ScoreableResume`, and `resumeDataToScoreable` does not read it.
- `lib/scoring-async/**` — same.
- `lib/chat/tools/edit-resume.ts` — the AI's text edits land in
  `sections`; the marks re-anchor themselves (or drop). No change.
- `lib/resume-parser/**` — the parser produces sections only.
- `components/editable/use-undo-history.ts`, `use-debounced-autosave.ts`
  — the map rides inside the form values they already watch.
- `lib/db/queries.ts` — the envelope is JSONB; no migration.

## DB / schema

- **Migrations:** none. `resume_revisions.data` and `resumes.data` are
  JSONB; adding an optional key to the envelope is backward-compatible.
- **New tables / columns / indexes:** none.
- **Env vars:** none.
- **GDPR:** `lib/data-rights` exports the envelope as JSON, so the map
  is included automatically. Account deletion erases the row.

## Dependencies

- **npm packages:** **none.** No ProseMirror, no Tiptap, no
  contentEditable polyfill, no markdown parser, no diff library. The
  whole feature is hand-rolled because the required surface is small:
  three marks, one range, one toolbar.
- **External services:** none.
- **Locked stack:** unchanged. No replacement of a locked pick.

## Risks

**1. The click-to-edit gesture collides with the select gesture.**
The editor's primary interaction (click a line → it becomes an input)
and the new one (drag across a line → mark it) share the same `click`
event. Get it wrong and every selection immediately opens an editor,
which feels broken on first use.
*Mitigation:* `startEdit` checks for a non-collapsed selection anchored
inside the element and bails; the toolbar's `onMouseDown` calls
`preventDefault()` so applying a mark does not collapse the selection.
Covered by an interaction test that drags a selection and asserts the
editor did **not** open and the mark **was** applied.

**2. Marks drift onto the wrong text.**
Offsets are invalidated by any edit to the field — including edits the
user did not make (Scout rewriting a bullet). A naive implementation
bolds the wrong words, and the user cannot tell.
*Mitigation:* the anchor-text re-anchoring algorithm (§ Architecture);
the failure mode is a **dropped** mark, never a wrong one; dropped
marks are reported to the user rather than silently disappearing.
Covered by unit tests for each of the three resolution outcomes.

**3. The ATS score moves because formatting exists.**
This is the exact class of bug the product already shipped once: the
list badge and the scorecard showed different numbers because two
surfaces each computed "the score" their own way
(`docs/drift/2026-10-23-list-score-badge-divergence.md`). If formatting
ever leaked into the text, every score in the product would move
together and the numbers users have already seen would stop meaning
anything.
*Mitigation:* the overlay never touches the text — structurally, not by
convention — and a test asserts `scoreResumeFromEnvelope(resume)` is
**byte-identical** with and without formatting applied. The UI also
states plainly that formatting does not affect the score.

**4. The editor and the share link render marked text differently.**
`classic-readonly.tsx` is a separate implementation of the classic
layout, and `classic.tsx` is another. If only one of them learns about
marks, a shared resume looks different on the share link than in the
editor.
*Mitigation:* both surfaces render through `RichText`; a test renders
the same marked data through both and asserts identical markup.

**5. Bold text is wider, so the page-fit estimate drifts.**
`lib/chat/page-fit.ts` is a measurement-driven estimate fitted against
real printed resumes. A bolded bullet can wrap to an extra line, so
the assistant's "will this fit on one page?" answer can be off by a
little once a resume is heavily formatted.
*Mitigation:* accepted as a known limitation for v1 (the estimate is
already explicitly an estimate, and the assistant says "about"). If it
proves material, the fix is a measured bold-text width term in the
page-fit table — the same way `scripts/measure-page-counts.cjs` already
produced the existing table.

## Acceptance criteria

1. `resumeDataSchema.parse()` accepts a resume with **no** `formatting`
   key, and one with a valid `formatting` map. Both round-trip.
2. A resume whose text is `"Led the migration to Postgres"` with a
   bold span covering `Postgres` renders **exactly** that text when
   scraped for ATS purposes — `plainTextOf(container) === value`, with
   no `<strong>`, `*` or `&nbsp;` residue.
3. `scoreResumeFromEnvelope(resume)` returns a **deeply equal** score
   breakdown for a resume and for the same resume with arbitrary bold /
   italic / underline marks applied to its skills, bullets and summary.
4. The same marked resume renders **identical markup** in the editor
   (idle state) and in the read-only render (`Field` helpers and
   `classic-readonly`). A test asserts the two DOM trees match.
5. Dragging a selection over text in the editor shows the toolbar and
   does **not** open the text input.
6. Clicking **B** applies bold to exactly the selected range; the
   rendered output wraps exactly that range in `<strong>`.
7. Clicking **B** again on the same range removes the bold.
8. Ctrl/Cmd+B on a focused field toggles a whole-field mark.
9. A mark whose anchor text is deleted is **dropped**, the surrounding
   text is not marked, and the editor reports the dropped count.
10. A mark whose anchor text is *moved* (text inserted before it) is
    **re-anchored** to the new position and still renders bold on the
    right words.
11. A formatting change is undone by one Ctrl+Z and redone by one
    Ctrl/Cmd+Shift+Z.
12. A formatting change is persisted by the debounced autosave without
    a separate save action, and survives a page reload.
13. The toolbar does not appear in the printed output (asserted via the
    `no-print` class and a print-CSS test).
14. Every template's text leaves go through `RichText` — a source-level
    test scans `components/resume-templates/*.tsx` and fails on a raw
    resume string interpolated into JSX.
15. `pnpm typecheck` clean, `pnpm test` green.
16. The AI-facing JSON Schema (when one is wired up) **excludes**
    `formatting` — the agent never authors marks in slice 1.

## Test plan

### Unit — `tests/unit/rich-text/`

- `resolve.test.ts` — the three outcomes: exact hit, re-anchored to a
  nearer occurrence, dropped when the anchor text is gone. Plus
  overlapping spans, adjacent-span merging, and an empty value.
- `spans.test.ts` — `addMark` / `removeMark` / `toggleMark` over a
  range: adding a mark to an unmarked range, adding a second mark to a
  marked range, removing one mark while keeping another, removing a
  whole-field mark, and the round-trip
  `removeMark(value, addMark(value, spans, s, e, m), s, e, m) === spans`.
- `schema.test.ts` — envelope round-trip with and without `formatting`;
  a malformed map (a span with no marks, a negative `start`) is
  rejected; a pre-feature resume parses cleanly.
- `scoring-invariance.test.ts` — **the invariant.** Same resume, with
  and without marks → deeply equal `scoreResumeFromEnvelope` output.
- `plain-text.test.ts` — `plainTextOf` on rendered markup returns the
  stored value exactly.
- `anti-drift.test.ts` — source-level scan: no template interpolates a
  resume string into JSX outside `RichText` / the `Field*` helpers.

### Integration — `tests/unit/rich-text/`

- `render-parity.test.tsx` — the same marked data rendered through the
  editor's `EditableText` and through the read-only `Field` helpers
  produces identical markup.
- `classic-parity.test.tsx` — `ClassicTemplate` (editable) and
  `ClassicReadOnly` render identical markup for the same marked data.

### Interaction — `tests/interaction/rich-text-toolbar.test.tsx`

Real DOM, real selection events:

- drag a selection → toolbar appears, editor does not open;
- click **B** → `<strong>` wraps exactly the range;
- toggle off;
- Ctrl+B on a focused field → whole-field mark;
- Ctrl+Z undoes the formatting change; Ctrl+Shift+Z redoes it;
- the toolbar disappears when the selection is cleared.

### Manual smoke (Playwright)

- Format a bullet in the editor → the **preview** page shows the same
  emphasis → the **share link** shows it → the browser's
  "Save as PDF" contains real bold text (verified by extracting the
  text from the generated PDF and checking the run is bold, not `**`).
- The ATS score is unchanged before and after formatting.
- Print the formatted resume: pagination is the same as the
  unformatted one (or one page longer at most — recorded, not asserted
  away).

## Rollback plan

- Revert the commits. The `formatting` field is additive and optional,
  so old resumes keep working throughout.
- **One hazard:** Zod's default object behaviour **strips unknown
  keys**. If the schema field is removed while the rest of the feature
  is still in place, the next save of any resume silently drops that
  resume's formatting. So the schema change and the feature are
  removed **together** — there is no partial rollback that keeps the
  data safe.
- No DB migration to revert. No env var to remove. No dependency to
  uninstall.
- Estimated revert time: < 15 minutes (one revert commit).

## Open questions

1. **Where does "Clear all formatting" live?** Proposed: the editor's
   overflow menu, next to the existing print / save actions. It is a
   rare, destructive action and should not be one keystroke away from
   the formatting toolbar itself.
2. **Should marked text be visually indicated in the editor** (a faint
   underline or tint behind a marked range) so the user can see what is
   emphasised without selecting it? Proposed: yes, but only while the
   toolbar is open, so the editor still looks like a resume.
3. **Should Slice 2's auto-bold also mark the bullets where a skill is
   evidenced, or only the skills section?** Proposed: only the skills
   section in v1 — bolding a skill everywhere it appears is visually
   noisy and starts to look like emphasis rather than signal.
4. **Should the toolbar offer a "code / monospace" mark?** Proposed:
   no. It is a fourth mark in the same family as colour and font size,
   and the ATS-safety argument against those applies to it too.
