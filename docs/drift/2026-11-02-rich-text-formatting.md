# A resume can be bold now — and the score did not move

**Date:** 2026-11-02
**Surface:** the resume editor, the preview page, the share link, the PDF
**Branch:** `feat/rich-text-formatting`
**Plan:** `docs/plans/rich-text-formatting.md` · **ADR:** `docs/decisions/0008-rich-text-overlay.md`

## What shipped

A candidate can now **select text in the rendered resume and bold,
italicise or underline it** — the thing resumes do by hand to signal
"this is aimed at *this* posting". The marks appear in the editor, the
preview page, the public share link and the printed PDF.

- Drag-select text → a floating **B / I / U** toolbar appears above the
  selection.
- **Ctrl/Cmd+B** on a focused field bolds the whole value — the fast
  path for a skill chip, a company name, a whole bullet.
- The toolbar's buttons are real buttons (focusable, labelled, Enter/Space
  works), and it says plainly: **"Formatting doesn't change your ATS
  score."** Because it doesn't, and because a user who believes
  decoration buys points is going to be disappointed later.
- **Clear formatting** on the selection, and **clear all formatting** in
  the editor's action row (it only appears when there is something to
  clear).
- An **er**aser button and a global clear — because a candidate who has
  bolded half a resume deserves one way out.

## The rule the whole thing is built around

> **Formatting is presentation. The text is the content.**

The stored resume keeps **plain strings**. The formatting lives in a
separate, optional, path-addressed overlay on the envelope:

```ts
formatting?: {
  'sections.skills.0.keywords.2': [
    { text: 'Postgres', start: 0, marks: ['bold'] }
  ]
}
```

So the ATS score, the BM25 tokenizer, the Jev evaluators, the digit
check, the action-verb check, page-fit estimation, the AI's edit-matching
and the resume parser all keep reading exactly the text the candidate
wrote. `tests/unit/rich-text/scoring-invariance.test.ts` asserts the
score breakdown is **deeply equal** with and without marks — that test is
the feature's real guarantee.

## The one genuinely hard problem: offsets drift

A mark is stored as a character offset, and **any** edit to the field
invalidates it — including edits the user did not make (Scout rewriting
a bullet). A naive implementation then bolds the wrong words, and the
user cannot tell.

So each span stores the literal text it covers as well as the offset,
and resolution happens at render time in one pure function:

1. **Exact hit** — keep it where it is.
2. **Re-anchor** — the text is still there, just moved; take the
   occurrence CLOSEST to the original offset.
3. **Drop** — the text is gone; report it.

**The failure mode is a missing mark, never a wrong one.** Losing a
bold is a cosmetic annoyance the user can re-apply; bolding the wrong
words is a lie on the resume.

## The second hard problem: two surfaces, one value

The editor and the share link must agree about what a marked line looks
like, or the feature re-creates the bug the product already shipped once
— the list badge and the scorecard showing different ATS numbers
(`docs/drift/2026-10-23-list-score-badge-divergence.md`).

So **one component renders the marks for every surface**. `RichText` is
used by the editor's idle render, by the read-only `Field*` helpers, and
by `classic-readonly` (the share link and the marketing preview). They
cannot disagree about a marked line, because there is only one
implementation.

And it renders a **fragment**, not a wrapper element — otherwise every
unmarked field in every resume would gain an extra `<span>` and every
print and page-break test would break. The unmarked output is
**byte-identical** to what it was before: verified by rendering the
pre-feature implementation and the new one against the same fixture and
diffing the markup.

## The gesture that had to be negotiated

The editor's primary interaction is **click a line → it becomes an
input**. A drag-selection ends with a `click` event too, so the naive
implementation would open the editor and destroy the selection the user
just made — every selection would immediately become an edit, which
feels broken on first use.

The resolution: `startEdit()` reads `window.getSelection()` first. A
non-collapsed selection anchored inside this field means the click was a
selection gesture, not an edit gesture → don't open the editor. A plain
click leaves the selection collapsed → the editor opens, exactly as
before.

The toolbar's buttons call `preventDefault()` on `mousedown`, so
applying a mark does not collapse the selection before the mark lands.

**Double-click-a-word is deliberately not in v1.** The first click of a
double-click leaves the selection collapsed, so it opens the editor and
the word never gets selected. Supporting it means deferring the editor
open by ~250ms on every click — making the product's primary
interaction feel laggy for a secondary convenience. Deferred, not
forbidden.

## The lesson

**A feature nobody can find is not a feature** — that was the agent
intro bubble. This one is the mirror image: **a feature that does
something the user cannot predict is worse than no feature.** The
overlay has to survive the text moving under it, and it has to read the
same on every surface, or it becomes a thing the user distrusts.

The deeper rule is the one this codebase already wrote down for the
scorecard: **one helper called by both surfaces, so they agree by
construction.** It is not a style preference. It is the difference
between a feature and a bug.

## Follow-ups (not in this change)

- **Auto-bold the posting's skills** (slice 2) — bold every requirement
  skill the resume demonstrates, underline the must-haves. The inputs
  already exist (the requirement evaluation knows which skills the
  resume shows).
- **Scout can format too** (slice 3) — one AI tool; the path vocabulary
  already exists.
- **The dropped-mark count is not surfaced in the UI yet.** The
  resolution already reports drops; the editor does not show them.
- **Bold text is wider**, so the page-fit estimate drifts slightly on a
  heavily formatted resume. Accepted for now; the fix is a measured
  bold-width term in the page-fit table.
