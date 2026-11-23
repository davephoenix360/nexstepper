# Drift — the printed resume carried the editor's placeholder text

Date: 2026-11-24
Branch: `main`

## What prompted this

The founder, on the resume templates:

> *"in some resume templates (for example the Jake's resume template) we
> provide like the 'Relevant Coursework' part of the 'Education' section we
> do not provide a way for users to hide those little parts or we do not hide
> them automatically from print when they are empty. Also, the way they are
> displayed is taking up too much space since we show the courses vertically
> instead of horizontally to save space. Also, when the user is in dark mode,
> the background in the print is also dark. That shouldn't be the case, the
> background of the resume print should always be white."*

Three reports. Each one turned out to be the visible edge of a larger
defect, and the larger defect was worse than the report.

## Report 1 — the sub-parts (Jake's "Relevant Coursework")

**What it is.** `sections.education[].courses` is a PART of the Education
section. Until now the only choice was the whole Education section or
nothing — there was no way to say "keep the degree, drop the coursework",
which is exactly the choice a candidate makes when the coursework is
irrelevant to the job.

**What was fixed.**

1. **A part gets its own hide slug.** `coursework` joins the section
   slugs in the SAME list (`data.print.hiddenSections`) — one place, one
   mechanism, one thing to learn. The vocabulary lives in
   `lib/print/print-slugs.ts` (the templates need it; the chat layer
   does not own it) and the chat tool's `updatePrintHiddenSections`
   schema now accepts it.
2. **An empty part hides itself.** No courses → the "Relevant
   Coursework" heading does not print.
3. **The courses render horizontally.** The editor IS the print (the
   editor's Print button calls `window.print()` on the editor's own
   DOM), so the editor's one-per-line bullet list was a vertical list
   in the PDF. The editor now uses the same 4-column grid the read-only
   render always used.

## Report 2 — the dark-mode print

The preview page and the share link printed on a **near-black sheet**
in dark mode.

The mechanism is a specificity bug, and it is worth remembering because
it is not obvious:

- Tailwind v4's `dark` is a **class variant**
  (`@custom-variant dark (&:is(.dark *))`), so `dark:bg-zinc-950`
  compiles to `.dark\:bg-zinc-950:is(.dark *)` — specificity **(0,2,0)**.
- `print:bg-white` compiles to `.print\:bg-white` — specificity
  **(0,1,0)**.

Higher specificity wins, so the dark background beat the print
utility. The `body { background: white !important }` rule that already
existed was unlayered and did beat the dark background — but it only
covered `body`, and the leak was on the wrapper elements around the
resume.

**Fixed** with an unlayered `!important` rule in the `@media print`
block covering `html, body, .print-paper, .printable-root,
.printable`, plus `color-scheme: light` so the UA does not pick a dark
canvas of its own accord. `!important` settles it without depending on
the variant order: an important declaration beats a normal one
regardless of layers.

The surfaces are listed **explicitly** rather than with a wildcard on
purpose — `* { background: white !important }` would flatten the indigo
section accents and the chip fills, which the existing
`print-color-adjust: exact` rule exists to preserve.

## Report 3 — the empty section heading

**The one the founder did not report, and the worst of the three.**

A section heading is template CHROME — it always prints. So a section
with nothing in it printed a bare heading:

```
Summary
Experience
Education
Skills
```

on the candidate's resume, with nothing under them.

The Classic template has always handled this: its editor path carries
`printHiddenIf(empty)` on the section wrapper, and its read-only path
skips the section entirely. The other five templates did not, and the
reason is structural — their section WRAPPER sits OUTSIDE the
per-section renderer:

```jsx
// Minimal — the wrapper is outside, so the heading is already
// committed to the DOM when the renderer returns null.
<SmartSection title="Projects">
  <MinimalProjects mode={mode} />
</SmartSection>
```

`SmartSection`'s documented contract — "in read-only mode, render only
if children is non-null" — could never fire, because `children` is a
React ELEMENT (`<MinimalProjects />`), not the renderer's return
value. React does not let a parent ask whether a child rendered `null`.

**Fixed** with a shared predicate, `isResumeSectionEmpty(data, slug)`
in `lib/resume-schema/resume-data.ts`. It is stricter than "the array is
empty": an array holding one entry the candidate added but never filled
in is ALSO empty, because nothing in it would print. Every section
wrapper now uses it — read-only renders nothing at all, the editor
keeps the section visible (the user needs its "+ Add" affordance) but
marks it `print:hidden`, which is exactly what Classic already did.

## The defect underneath all three: the READ-ONLY render printed placeholders

While surveying the other templates I built a probe that simulates the
print stylesheet (removes every `print:hidden` / `.no-print` element)
and then reads the text that survives. The first run printed, for
**all six templates**:

```
minimal   Your name · Senior Software Engineer · email@example.com ·
          (555) 123-4567 · example.com · City · A couple of lines
          summarizing who you are. · Company · Remote · Position ·
          Category · Institution · Degree · Location · Major
jake      Your name · Institution · City, State · Company · Position ·
          Category: · Language: · Fluent
```

**A candidate who left their location blank got "City, State" printed
on their resume. One who left their summary blank got the entire
placeholder sentence — "A couple of lines summarizing who you are." —
on the page they sent to employers.**

The mechanism: the read-only render (`editable={false}`) IS the print
path for the preview page and the public share link. The editor prints
its own (editable) DOM, where `EditableText` already hid its
placeholder with `print:hidden` — that fix was made years ago, for the
editor. The read-only branch of `Field` / `FieldArea` / `FieldChips`
never got it, because nobody noticed that the two paths print different
documents.

So the same resume printed from the editor was clean, and printed from
the preview page was not. **Two surfaces, two answers** — the drift
this repo keeps warning about, in the one place nobody was looking.

### Everything the probe found

| Defect | Where | Now |
|---|---|---|
| Placeholder text printed | `Field`, `FieldArea`, `FieldChips` read-only branches | `print:hidden` |
| "Add major" printed | `FieldChips` read-only empty state | `print:hidden` |
| "Company" / "Institution" / "Award" printed | `classic-readonly.tsx` — 11 hard-coded fallback labels | wrapped in `<Placeholder>` (`print:hidden`) |
| "Degree" / "Language:" / "Category:" printed | Jake's read-only fallbacks | `print:hidden` |
| "Minor: " printed | Jake + Classic added the prefix before checking the value | filter first, then prefix |
| ", , " printed | `FieldChips` joined EMPTY keyword strings | blank chips dropped before the join |
| "· ·" printed | Creative + Executive contact strip — unconditional separator spans | `FieldSeparator`, a value-aware separator |
| Empty section headings printed | 5 of 6 templates | `isResumeSectionEmpty` |
| A dead "Portfolio & Tools" heading printed | Creative — the renderer was `return null`, and it duplicated the Projects section's `id` | section removed |

### The separator rule

Creative and Executive render their contact strip as a row of `Field`s
with a literal "·" span between each pair, and the separators did not
know whether the values around them had anything in them. With the
placeholders now hidden, the separator became the only thing left
visible:

```
· (555) 123-4567        ← email is blank, so the separator leads
· ·                     ← everything is blank
```

**The rule** (the same one the editable header line already used): a
separator before value N renders only when value N has content AND at
least one value before N has content. The first clause kills trailing
separators, the second kills leading ones, and together they kill the
all-empty case.

`FieldSeparator` reads the values the same way `Field` does — live from
the form in the editor, from the saved envelope in read-only mode —
using the same explicit-`mode` branch `useSectionPrint` uses.

## The measurement

`tests/unit/print/print-cleanliness.test.tsx` (37 tests) simulates the
print stylesheet with jsdom and asserts on what survives. The
placeholder literals are collected **from the template sources at test
time**, so a template that grows a new placeholder is covered
automatically — a hard-coded list would only ever catch the leaks we
already knew about.

Verified failing on the old code (14 failures, one per defect class)
and passing on the new.

## The lesson

**The editor is not the print.** The editor's Print button calls
`window.print()` on the editor's own DOM, so an editor-only affordance
that is not marked `print:hidden` lands on the candidate's resume —
and so does a fix applied to only one of the two render paths.

The trap is that the EDITOR path was already correct. `EditableText`
hid its placeholder years ago. The read-only path — the preview, the
share link, the print — was not, and it looked correct on screen
because the placeholder is grey and reads like an editor hint.

**A grey placeholder on screen and a grey placeholder on the page are
not the same thing.** The first is an affordance; the second is a bug.
The only way to tell them apart is to simulate the print stylesheet and
read what is left.

Two more worth keeping:

- **A section heading is chrome, and chrome always prints.** A section
  with nothing in it prints a bare heading. The rule is not "hide the
  body" — it is "do not render the section at all".
- **A parent cannot ask whether a child rendered `null`.** The
  `SmartSection` contract was written down, documented and believed —
  and could not work, because React elements are opaque. Emptiness has
  to be decided from the DATA.

## Files

| File | Change |
|---|---|
| `lib/print/print-slugs.ts` | **new** — the part-slug vocabulary |
| `lib/resume-schema/resume-data.ts` | `isResumeSectionEmpty` |
| `components/resume-templates/field.tsx` | placeholders stop printing; `FieldSeparator`; blank chips dropped |
| `components/resume-templates/section.tsx` | the empty-section rule |
| `components/resume-templates/{minimal,modern,executive,creative,jake}.tsx` | the empty-section rule; `FieldSeparator`; Jake's coursework |
| `components/resume-templates/classic-readonly.tsx` | `<Placeholder>`; blank keywords; blank minors |
| `app/globals.css` | the white-paper rule |
| `app/(dashboard)/…/preview/page.tsx`, `app/r/[token]/page.tsx` | `print-paper` |
| `lib/chat/tools/types.ts` | the tool accepts part slugs |
| `tests/unit/print/print-cleanliness.test.tsx` | **new** — 37 tests |
