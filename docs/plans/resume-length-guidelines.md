# Resume length guidelines — measured, not estimated

Status: **data for the chat assistant's length advice.** Measured 2026-10-22.

Why this exists: the assistant has to answer "will this fit on one page?"
and it cannot render the document. Everything it said about length was a
guess from the user's prose, which is how users end up printing, finding
three pages, and coming back annoyed.

## The harness

| piece | what it is |
|---|---|
| `app/dev/design-lab/measure/` | dev-only route that renders ONE template with a known amount of content, using the real print CSS |
| `scripts/measure-page-counts.cjs` | drives Chromium, prints to PDF with `preferCSSPageSize: true`, counts pages with `pypdf` |
| `app/dev/design-lab/measure/content.ts` | deterministic resume generator (no `Date.now()`, no `Math.random()`) |

The route mirrors the real preview page exactly: same `max-w-[8.5in]`
column, same `.printable` wrapper carrying the four `--resume-*` vars,
same template component. `page.pdf({ preferCSSPageSize: true })` honours
the `@page { size: letter; margin: var(--resume-margin) }` rule, so the
pagination is the browser's own "Save as PDF" pagination.

```
pnpm dev                                   # in one shell
node scripts/measure-page-counts.cjs --content=minimal --template=modern
node scripts/measure-page-counts.cjs --content=full --settings=standard,compact
```

`--content=full` includes the gallery sample's projects / volunteer /
awards / certificates. `--content=minimal` is the identity + experience +
skills + education skeleton.

### A note on `networkidle`

The driver waits for `domcontentloaded` plus a `.printable` selector, NOT
`networkidle`. The Next dev server keeps an HMR websocket open, so
`networkidle` can hang indefinitely — it stalled the sweep on the 5th
combination of the classic template before this was changed.

## The numbers

One page holds this many work entries, at three bullets per entry
(minimal base: identity + experience + skills + education):

| template | default settings | tightened layout | tightest preset |
|---|---|---|---|
| Classic | 2 roles | 3 roles | 4 roles |
| Minimal | 2 roles | 3 roles | 3 roles |
| Modern | 2 roles | 2 roles | 3 roles |
| Jake | 2 roles | 3 roles | 3 roles |
| Executive | 1 role | 2 roles | 3 roles |
| Creative | 1 role | 2 roles | 3 roles |

In bullet terms: **~6 bullets on one page at default settings, ~8 when
tightened, ~10-12 at the tightest preset.**

Executive and Creative are the densest — they give up a role at default
settings in exchange for their visual treatment.

### Section overhead

The `full` base (adding projects, volunteer, awards and certificates to
the minimal skeleton) is **two pages with a single work entry**. So each
extra section costs roughly half a page, and a resume carrying all of
them is already two pages before any job history exists.

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

## The bug this harness found

`@page { margin: var(--resume-margin, 0.4in) }` was never picking up the
per-resume value.

The reason was a wrong assumption recorded in `app/globals.css`: *"CSS
custom properties DO propagate into `@page` via the standard cascade."*
They do not — not from a descendant. `@page` lives outside the normal
element tree and resolves custom properties against the **root** element
(`:root` / `<html>`). The vars were set inline on `.printable`, a
descendant, so `@page` always fell back to 0.4in.

**Every resume was printing with a 0.4in margin, whatever the user picked.**

It looked like it worked, because `.printable { padding: var(--resume-margin) }`
DOES resolve the descendant value — so the on-screen preview changed while
the PDF did not. The setting was a no-op in print and visible in preview.

The proof is in the measurement, not in reasoning: the "compact margin,
everything else standard" column was **identical to "standard" across all
27 measured combinations**, while line-height and section-spacing (which
descendant rules consume normally) did change the result.

Fixed by `components/editable/print-settings-vars.tsx`, which mirrors the
four properties onto the root element. Re-measured after the fix: the
margin column now differs from standard, as it should.

## Caveats

- Bullets in the generator are 110–150 characters, which is what wraps to
  two lines at 11pt on a 7-inch text column. Short bullets make every
  number optimistic; long ones make it pessimistic.
- One work entry = one company with one position.
- The numbers are for Letter. A4 is shorter.
- These are estimates for the assistant to reason with, not a page
  counter. The assistant cannot render the document, so it should say
  "about one page" rather than promising a page count it cannot check.
