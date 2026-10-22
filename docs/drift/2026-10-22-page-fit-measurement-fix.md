# Drift — the page-length numbers were measured wrong

Date: 2026-10-22
Branch: `feat/chat-agent-v3-phase-a`
Plan: `docs/plans/chat-agent-v3.md` (Phase F)
Data: `docs/plans/resume-length-guidelines.md`

## What prompted it

The user said "Yes finish it" to the page-count work: measure real page
counts across content volume × page settings × template so the agent can
estimate how many pages a resume will be and how much hiding a section or
tightening the layout actually buys.

The first pass produced a formula, a calibration script, and a summary
table. Every number in it was wrong, and the reason it was wrong is worth
writing down because **the wrong numbers looked completely reasonable**.

## The two bugs

### 1. The DOM was measured at the screen width, not the paper width

The printed page lays out at the paper width MINUS the page margin — 7.0in
at the default 0.75in margin, not the 8.5in the screen shows. The
measurement harness measured `.printable`'s `scrollHeight` in an 8.5in
viewport.

A wider column wraps less text per line, so it reports a SHORTER resume
than the one that prints. And because the error grows with content volume,
it was worst exactly where it mattered: near a page boundary.

Caught by comparing the DOM height against the PDF page count at three
points. At 8.5in the formula said "2 pages" for a resume that printed on
1; at 7.0in the same resume measured 9.19in against a 9.5in page, which
is exactly 1 page.

### 2. The `@page` margin was not in force when the PDF was rendered

`@page { margin: var(--resume-margin, 0.4in) }` resolves custom properties
against the **root** element. The per-resume value is written to
`document.documentElement` by `PrintSettingsVars` inside a `useEffect`.

The harness was printing PDFs before that effect had run, so **all 486
PDFs were printed with the 0.4in fallback margin**, whatever preset was
requested. The "standard" / "compact" / "tightest" columns differed only
in line height, spacing and font size — the margin column was inert.

This is the same class of bug the `app/globals.css` comment describes
(`@page` not seeing a descendant's custom property) biting a second time,
one level up: the fix for the first one was in place, but the *harness*
had to wait for it.

The tell was in the PDF geometry: reading the text positions straight out
of a rendered PDF showed a 0.40in left margin on every sample, including
the ones that asked for 0.5in and 1in. Waiting for the root variable and
re-rendering produced 0.75in / 0.5in / 1.00in as requested.

## What changed

### The harness

`scripts/lib/print-harness.cjs` now owns the geometry and the wait, so no
measurement script can get it wrong:

- `contentWidthPx(margin)` — the width to measure the DOM at.
- `waitForRootMargin(page)` — blocks until `--resume-margin` is on
  `:root`, and **warns loudly** if it never arrives rather than quietly
  measuring the fallback.
- `openMeasurePage(page, url)` — load, wait for fonts, wait for the root
  mirror, switch to print media.

All three measurement scripts (`measure-page-counts`, `measure-page-formula`,
`measure-section-space`) use it. `measure-page-counts` also gained resume
support, so a re-run only pays for what is missing.

### The formula

`scripts/measure-page-formula.cjs` was rewritten. It now:

- measures the DOM height at the paper content width,
- fits `height = fixed + roles × (perRole + bullets × perBullet)` by least
  squares over all 27 measured points per template and setting (the old
  version derived the three terms from 3 points),
- validates the result against the REAL page counts and prints the
  accuracy rather than assuming it.

**478 of 486 page predictions are correct (98.4%)**, up from 291 of 324.
The eight misses are all within 0.1in of a page boundary.

### The agent can now ask

New tool `estimatePageCount` (`lib/chat/tools/estimate-page-count.ts`),
backed by `lib/chat/page-fit.ts`. It returns the estimated page count, the
content height in inches, where the height went, and what hiding each
visible section would save and what the resume would then print as.

The prompt table is now GENERATED from the measurements
(`lib/chat/page-fit.generated.ts`) instead of hand-written. The old
hand-written table was wrong and nothing would have flagged it.

### Honest limits

The eight misses sit on a page boundary, and two of them are in the
expensive direction — the estimate says two pages where the document
prints on one. That is the direction that could make an agent talk a user
into cutting work they did not need to cut.

A four-parameter search over the fit reaches 486/486, but the optimum sits
at the edge of the search range for every parameter: it is fitting the
sample's particular bullet-length mix, not a real effect, and it would not
generalise to a user's own bullets. The plain least-squares fit was kept.

The `estimatePageCount` tool's own output says "about", and the prompt
tells the model to say "possibly spilling to two" rather than promising a
page count it cannot check.

## Collateral fixes

- `executeUpdatePrintSettings`'s TypeScript signature did not declare
  `itemSpacing`, even though the tool's Zod schema accepted it — the knob
  was in the contract and invisible in the implementation.
- `printSettingsSummary` and the `getPrintSettings` tool output omitted
  `itemSpacing` too, so the model was told about four knobs when there
  are five.

## Tests

- `tests/unit/chat/page-fit.test.ts` (19 tests) holds the estimator
  against `tests/fixtures/measured-page-counts.json` — 486 real page
  counts, committed.
- `tests/unit/chat/system-prompt-length.test.ts` (9 tests) pins the
  prompt to the generated tables and to the "measure, don't guess"
  instruction.
- `tests/unit/chat/tools-schema.test.ts` pins the tool list to eight and
  the `itemSpacing` contract.

## Honest dev note

The first attempt to fix the accuracy was an additive offset searched
against the 486 measurements, on the theory that the DOM height and the
printed page disagree by a constant. The search ran to the edge of its
range for most templates, which is the signature of a mis-specified model
rather than a missing correction. The real cause was the width and the
margin — two things that had nothing to do with an offset. The offset
approach was abandoned, and `scripts/calibrate-page-formula.cjs` was
removed rather than left in the tree as a trap.
