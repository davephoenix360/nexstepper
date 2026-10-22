# Resume length guidelines — measured, not estimated

Status: **the data behind the chat assistant's length advice.** Re-measured
2026-10-22 after two measurement bugs were fixed (see "What the harness got
wrong").

Why this exists: the assistant has to answer "will this fit on one page?"
and it cannot render the document. Everything it said about length was a
guess from the user's prose, which is how users end up printing, finding
three pages, and coming back annoyed.

## The harness

| piece | what it is |
|---|---|
| `app/dev/design-lab/measure/` | dev-only route that renders ONE template with a known amount of content, using the real print CSS |
| `scripts/lib/print-harness.cjs` | shared harness: paper geometry, the root-margin wait, Playwright resolution, page counting |
| `scripts/measure-page-counts.cjs` | drives Chromium, prints to PDF with `preferCSSPageSize: true`, counts pages with `pypdf` |
| `scripts/measure-page-formula.cjs` | measures DOM heights at the paper width and fits the height formula against the real page counts |
| `scripts/measure-section-space.cjs` | measures how many inches each section occupies, by difference |
| `scripts/build-page-fit-table.cjs` | → `lib/chat/page-fit.generated.ts` (the prompt table + the estimator's data) |
| `scripts/build-section-space-table.cjs` | → `lib/chat/section-space.generated.ts` |
| `app/dev/design-lab/measure/content.ts` | deterministic resume generator (no `Date.now()`, no `Math.random()`) |

The route mirrors the real preview page exactly: same `max-w-[8.5in]`
column, same `.printable` wrapper carrying the five `--resume-*` vars, same
template component. `page.pdf({ preferCSSPageSize: true })` honours the
`@page { size: letter; margin: var(--resume-margin) }` rule, so the
pagination is the browser's own "Save as PDF" pagination.

```bash
pnpm dev                                            # in one shell
node scripts/measure-page-counts.cjs --content=minimal   # 486 real page counts
node scripts/measure-page-formula.cjs               # heights + the fitted formula
node scripts/measure-section-space.cjs              # per-section inches
node scripts/build-page-fit-table.cjs               # → lib/chat/page-fit.generated.ts
node scripts/build-section-space-table.cjs          # → lib/chat/section-space.generated.ts
```

`--content=full` includes the gallery sample's projects / volunteer /
awards / certificates. `--content=minimal` is the identity + experience +
skills + education skeleton.

### A note on `networkidle`

The driver waits for `domcontentloaded` plus a `.printable` selector, NOT
`networkidle`. The Next dev server keeps an HMR websocket open, so
`networkidle` can hang indefinitely — it stalled the sweep on the 5th
combination of the classic template before this was changed.

## What the harness got wrong

Two bugs made every earlier measurement wrong. Both are worth writing down,
because both produced numbers that looked perfectly reasonable.

### 1. The DOM was measured at the screen width, not the paper width

The printed page lays out at the paper width MINUS the page margin:

| margin | printed content width |
|---|---|
| 0.75in (standard) | 8.5 − 1.5 = **7.0in** |
| 0.5in (compact) | 8.5 − 1.0 = **7.5in** |

The first version measured `.printable`'s `scrollHeight` in a viewport
8.5in wide. Wider means less text wraps per line, so it reports a SHORTER
resume than the one that prints. Every height was wrong, and because the
error grew with content volume, the error was worst exactly where it
mattered — near a page boundary.

The fix: measure in a viewport the width of the paper content area.

### 2. The `@page` margin was not in force when the PDF was rendered

`@page { margin: var(--resume-margin, 0.4in) }` resolves custom properties
against the **root** element, not a descendant. The per-resume value is
written to `document.documentElement` by `PrintSettingsVars` inside a
`useEffect` — so until that effect has run, the page box silently uses the
**0.4in fallback**.

The harness was printing before the effect fired. So all 486 PDFs were
printed with a 0.4in margin, whatever preset was requested, and the
"standard" / "compact" / "tightest" presets differed only in line height,
spacing and font size.

This is the same class of bug the `app/globals.css` comment describes
(`@page` not seeing a descendant's custom property) biting a second time,
one level up. `scripts/lib/print-harness.cjs` now waits for the root
variable before rendering anything:

```js
await page.waitForFunction(() => {
  const v = document.documentElement.style.getPropertyValue('--resume-margin');
  return typeof v === 'string' && v.trim().length > 0;
});
```

### What fixing them did to the numbers

| | before | after |
|---|---|---|
| Formula accuracy across 486 real page counts | 291/324 (90%) | **478/486 (98.4%)** |
| Classic, roles that fit on one page (3 bullets) | 2 / 3 / 4 | **1 / 2 / 3** |
| Executive, roles that fit (3 bullets) | 1 / 2 / 3 | 1 / 2 / 3 |
| Classic, measured height of the full sample | 19.64in | **21.34in** |

The "before" figure is not a fair comparison — it used a different
measurement width and a different margin — but the direction is what
matters: **the page counts the agent was about to quote were optimistic by
roughly half a role, and the section figures were short by a third of an
inch each.**

## The numbers

### How many roles fit on one page

Measured, minimal base (identity + experience + skills + education):

| template | 2 bullets | 3 bullets | 4 bullets |
|---|---|---|---|
| Classic | 2 / 3 / 4 | 1 / 2 / 3 | 1 / 2 / 3 |
| Minimal | 2 / 3 / 4 | 1 / 2 / 3 | 1 / 2 / 3 |
| Modern | 2 / 3 / 5 | 1 / 3 / 4 | 1 / 2 / 3 |
| Executive | 1 / 3 / 3 | 1 / 2 / 3 | 1 / 2 / 2 |
| Creative | 1 / 2 / 3 | 1 / 2 / 3 | 0 / 1 / 2 |
| Jake | 1 / 3 / 4 | 1 / 2 / 3 | 1 / 2 / 3 |

Each cell is `default / tightened / tightest` presets. Creative at four
bullets per role does not fit even one role at default settings — it is the
densest template in the set.

### The height formula

The table above answers "how many roles fit", which is one shape. The
assistant needs to answer "3 roles with 4 bullets each, plus a Projects
section" — so there is a formula:

```
height_inches = fixed + roles × (perRole + bullets_per_role × perBullet)
pages         = ceil(height_inches / usable_inches_per_page)
```

| template | setting | fixed | per role | per bullet | usable page | measured accuracy |
|---|---|---|---|---|---|---|
| Classic | standard | 6.00in | 0.74in | 0.43in | 9.5in | 27/27 |
| Classic | compact | 5.38in | 0.72in | 0.30in | 10.0in | 27/27 |
| Classic | tightest | 5.00in | 0.67in | 0.21in | 10.0in | 27/27 |
| Minimal | standard | 6.25in | 0.65in | 0.46in | 9.5in | 27/27 |
| Minimal | compact | 5.34in | 0.58in | 0.36in | 10.0in | 26/27 |
| Minimal | tightest | 4.91in | 0.54in | 0.28in | 10.0in | 27/27 |
| Modern | standard | 6.02in | 0.70in | 0.45in | 9.5in | 26/27 |
| Modern | compact | 5.10in | 0.59in | 0.33in | 10.0in | 27/27 |
| Modern | tightest | 4.69in | 0.57in | 0.23in | 10.0in | 27/27 |
| Executive | standard | 6.62in | 0.67in | 0.51in | 9.5in | 26/27 |
| Executive | compact | 5.86in | 0.59in | 0.38in | 10.0in | 25/27 |
| Executive | tightest | 5.43in | 0.54in | 0.29in | 10.0in | 26/27 |
| Creative | standard | 7.10in | 0.67in | 0.52in | 9.5in | 27/27 |
| Creative | compact | 5.98in | 0.61in | 0.40in | 10.0in | 27/27 |
| Creative | tightest | 5.54in | 0.56in | 0.31in | 10.0in | 25/27 |
| Jake | standard | 6.72in | 0.70in | 0.45in | 9.5in | 27/27 |
| Jake | compact | 6.03in | 0.60in | 0.29in | 10.0in | 27/27 |
| Jake | tightest | 5.58in | 0.56in | 0.21in | 10.0in | 27/27 |

`fixed` is the skeleton with no job history — header, skills, education.
`usable` is the paper height minus the two margins.

**Accuracy** is how often `ceil(height / usable)` reproduced the REAL page
count across the 27 measured content shapes for that template and setting.
It is reported rather than hidden: the assistant should say "about" when it
quotes a page count. The eight misses are all within 0.1in of a page
boundary — measurement noise from the sample's varying bullet lengths, not
a modelling failure.

### Section overhead

The `full` base (adding projects, volunteer, awards and certificates to
the minimal skeleton) is **two pages with a single work entry** for Classic
and Jake. So each extra section costs roughly half a page, and a resume
carrying all of them is already two pages before any job history exists.

That is the shape most users actually arrive with — a general resume with
everything on it — and it is why finetuning DOWN is the primary operation
rather than a trim.

### Which lever actually moves the needle

Measured one setting at a time (Modern template, minimal base):

| setting changed alone | effect on one-page capacity |
|---|---|
| margin → compact | ~1 extra role at high volume |
| line height → compact | ~1 extra role |
| section spacing → compact | ~1 extra role |
| font size → small | ~1 extra role |

All four are worth roughly the same on their own, and together they buy
about **two roles**. Tightening the layout is real, but it is not a
substitute for cutting: a resume four roles over cannot be rescued by
layout alone.

## How much space does each section take?

The formula needs the height of each section, so each section's **vertical
space** was measured.

### How

By DIFFERENCE: measure the total height of a printed resume, measure it
again with one section hidden, and the difference IS the space that
section occupies.

A first pass measured each section's band as "distance from its heading
to the next heading's top". That is close, but it is off for the LAST
section (0.51in measured vs 0.72in actually saved for `interests`)
because trailing margins and the container's `scrollHeight` do not line
up the way the arithmetic assumes. The delta method has no such edge
cases — and it is exactly the number the assistant needs.

Chromium runs with `emulateMedia({ media: 'print' })`, so the real
`@media print` rules apply, including `print:hidden` collapsing an
excluded section to zero height. That is the render the user's PDF gets.

### The data

Vertical space in inches, default print settings, Letter. One page holds
**9.5 inches** of content at default settings (10.0 when tightened).

| template | header | experience | projects | skills | education | awards | certificates | volunteer | languages | interests | total | pages |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Classic | 2.80 | 6.33 | 2.79 | 1.87 | 1.17 | 1.88 | 0.94 | 1.24 | 1.30 | 1.02 | 21.34 | 2.25 |
| Minimal | 2.38 | 6.46 | 2.75 | 1.55 | 1.16 | — | — | 1.19 | — | — | 15.49 | 1.63 |
| Modern | 2.99 | 6.41 | 2.76 | 1.87 | 0.95 | 1.40 | 0.91 | 1.21 | 0.72 | 0.72 | 19.94 | 2.10 |
| Jake | 2.83 | 6.46 | 2.38 | 1.91 | 1.75 | 1.84 | 0.98 | 1.26 | 1.34 | 1.05 | 21.80 | 2.29 |
| Executive | 2.25 | 7.03 | 2.84 | 1.61 | 1.00 | — | — | 1.26 | — | — | 16.44 | 1.73 |
| Creative | 2.30 | 7.05 | 3.35 | 2.12 | 1.02 | — | — | 1.27 | — | — | 17.11 | 1.80 |

("header" is the name, contact line and summary — it renders outside any
section, so it is the remainder between the total and the sections. A
six-line summary really is a third of a page, and the assistant should
know that.)

Read across the rows and two things fall out:

- **Creative and Executive are the densest.** They spend the most on
  Experience — 7.03in and 7.05in against Modern's 6.41in — and Creative
  spends 3.35in on Projects where Classic spends 2.79in.
- **Projects is the most hideable section, almost everywhere.** 2.38–3.35in
  — a quarter to a third of a page, for content that many resumes do not
  need for a specific role.

### Why this changes the advice

Hiding a section costs the user **nothing** — the content stays in the
resume and stays editable; it just does not appear in the PDF. So the
order of levers is:

1. **Hide a section** — free. Save the inches in the table above.
2. **Tighten the layout** — free, and worth about 3 inches on the sample
   resume (21.34in at default settings → 18.35in compact → 16.53in
   tightest, for Classic).
3. **Cut content** — the only one that costs the user something, so it
   needs their sign-off.

The assistant used to be told "cut content first". That was wrong, and
wrong in the direction that annoys users: it reached for the expensive
lever when two free ones were available.

### Reproducing

```bash
pnpm dev                                             # in one shell
node scripts/measure-section-space.cjs               # → output/section-space/section-space.json
node scripts/build-section-space-table.cjs            # → lib/chat/section-space.generated.ts
```

The prompt table is GENERATED, not hand-written. Hand-copying 100+
measurements into a prompt file is how they end up stale and wrong.

Three things the script had to learn the hard way:

- **It writes the JSON after every template, not once at the end.** The
  first run stalled on the last template and lost every measurement,
  because the output only appeared on completion.
- **It launches a fresh browser per template.** One long-lived browser
  leaked processes across ~200 navigations, ended up with 69 Chrome
  processes alive, and starved the machine into a dev-server OOM.
- **It measures at the paper content width, and waits for the root
  margin.** See "What the harness got wrong" above.

## How the assistant uses this

`lib/chat/page-fit.ts` turns the measured data into a number for the resume
the user actually has. `lib/chat/tools/estimate-page-count.ts` exposes it
as the `estimatePageCount` tool, which returns:

- the estimated page count and the estimated content height in inches,
- where the height went, section by section,
- and — the part users actually ask for — what hiding each visible section
  would save, and what the resume would then print as.

The estimator reproduces the real page count on **478 of the 486 measured
points** (98.4%). The eight misses are all within 0.1in of a page
boundary.

`tests/unit/chat/page-fit.test.ts` holds the estimator against the real
measurements, committed as `tests/fixtures/measured-page-counts.json` —
486 real page counts, so a regression in the harness fails the build
rather than quietly shipping optimistic numbers.

## Caveats

- Bullets in the generator are 110–150 characters, which is what wraps to
  two lines at 11pt on a 7-inch text column. Short bullets make every
  number optimistic; long ones make it pessimistic.
- One work entry = one company with one position.
- The numbers are for Letter. A4 is shorter.
- The formula assumes a typical skills and education block. A user with
  six skill categories instead of three will print longer than the
  estimate.
- These are estimates for the assistant to reason with, not a page
  counter. The assistant cannot render the document, so it should say
  "about one page" rather than promising a page count it cannot check.
