# Jake's Resume template — drift memo (2026-10-19)

## What shipped

Branch `feat/jake-resume-template`. No migration. No infra change.
Pure UI feature: a sixth template in the registry, modelled on
[Jake Gutierrez's LaTeX/Overleaf template](https://www.overleaf.com/latex/templates/jakes-resume/syzfjbzwjncs).

- `components/resume-templates/meta.ts` — new `JAKE_TEMPLATE_META`
  constant + `templateCategorySchema` extended with `"jake"`.
  `tier: "free"`, `atsSafe: true`, `category: "jake"`,
  `accent: "slate"`, `maxPages: "auto"`, `pageSize: "letter"`,
  tags `["single-column", "serif", "academic", "latex-style"]`.
- `components/resume-templates/jake.tsx` — single client component,
  modern pattern (Field primitive, no classic two-file split).
  Exports `JakeTemplate` (the dispatcher) and `JakeReadOnly` (a
  thin `<JakeTemplate editable={false} />` alias for the server-
  component / print / preview path). Renders all 11 sections
  in `ResumeData` (Summary, Education, Experience, Projects,
  Skills, Volunteer, Awards, Certificates, Publications,
  Languages, Interests) plus References, with Jake's chrome
  applied consistently.
- `components/resume-templates/index.ts` — registered Jake in the
  `templateRegistry` (alphabetical order: classic, creative,
  executive, jake, minimal, modern).
- `components/resume-templates/template-thumbnail.tsx` — new
  `JakeThumbnail` SVG (centered small-caps name block, three
  inline dot-markers for the contact icons, three sections with
  slate hairline rules) + switch case. The thumbnail doc comment
  got a sixth bullet describing Jake.
- 15 new tests in `tests/unit/jake-template.test.tsx`.
- 4 existing test files updated for the 6-template reality:
  `template-meta.test.ts` (registry size 5→6, Jake meta + category,
  Jake is free / atsSafe / jake / slate), `template-gallery.test.tsx`
  (Jake card, thumbnail, badges, preview, version), `print-hide-templates.test.tsx`
  (Jake in summary-hide, in back-compat, new JakeTemplate describe
  block), `design-lab.test.ts` (5→6 anchors + the design-lab page
  text "five" → "six" in `app/dev/design-lab/page.tsx`).
- Total tests: **1636 passing** across 124 files, up from 1613
  on `main` — a delta of **+23**, all of them Jake-specific:
  15 in the new `jake-template.test.tsx`, 3 new assertions in
  `template-meta.test.ts`, and 5 in `print-hide-templates.test.tsx`
  (Jake added to both parameterized fixture arrays = +2, plus a
  new 3-test `JakeTemplate` describe block).

## Visual decisions worth recording

### Why `font-serif`, not `next/font/google` for Lora

The first attempt loaded Lora via `next/font/google`:

```tsx
import { Lora } from 'next/font/google';
const lora = Lora({ subsets: ['latin'], weight: ['400','500','600','700'] });
```

This worked at runtime (the dev server rendered the page with
the Lora font, no font-load flicker because of `display: 'swap'`)
but **broke every vitest that touched the Jake module**:

```
TypeError: Lora is not a function
  at components/resume-templates/jake.tsx:114:14
```

`next/font/google` is a server-only Next.js module — it makes
a build-time HTTP call to download the font, then exposes a
hashed className. Vitest's Node environment has no `next/font`
implementation, so the import returned `undefined` and the
first invocation (`Lora({...})`) threw at module load. The
result: `jake-template.test.tsx`, `print-hide-templates.test.tsx`,
`template-meta.test.ts`, `template-gallery.test.tsx` all failed
to even *load* the suite, not just the Jake-specific tests.

The fallback: `className="font-serif"`, which is Tailwind's
`serif` font-family stack (Lora → Crimson Pro → EB Garamond →
Georgia → serif). It's:
- available in vitest (no font load)
- available offline
- visually close enough at print resolution that a recruiter
  isn't going to tell two A4 resumes apart

If/when we want true Lora at print time, the right path is to
load it in the root `app/layout.tsx` once with `next/font/google`
(so the font ships on every page, not just Jake), then add a
`font-['var(--font-lora)']` Tailwind class to the Jake wrapper.
That's a follow-up — `font-serif` is good enough today.

### Why a single file (modern pattern), not the classic two-file split

Classic's `classic.tsx` + `classic-readonly.tsx` pattern
duplicates the read-only rendering because classic's editor
calls `useFieldArray` and `useFormContext` at the top of the
component, which can't be conditionally skipped — the hooks
fire unconditionally in the editor. So classic splits: one file
with hooks (editor), one without (read-only).

Modern's `modern.tsx` doesn't have this constraint. The
`Field` primitive (`mode.editable ? EditableText : <span>`)
makes the same component work in both modes. Same for
`FieldBullets`, `FieldChips`, `FieldArea`. So modern has no
read-only file.

Jake was a deliberate call: I wrote `jake-readonly.tsx` first
as a full server-component, then **deleted it** in favour of
the modern single-file pattern. The visual verification was
cleaner (one rendering path = one source of truth) and the
editable/read-only semantics are 1:1 with modern.

**Tradeoff:** Jake *is* a client component, so `JakeReadOnly`
is technically a client component too. For the print / PDF
path, Next.js still pre-renders the markup on the server (so
the user gets a fully-populated HTML response before
hydration), but the class technically carries `'use client'`.
The test contract (use `JakeReadOnly` to target the read-only
path explicitly) is the same as for classic. Documented at
the top of `jake.tsx`.

### What "consistent features" actually means for Jake

The user said: *"adhere to all the consistent features and
things that we currently have in each of the resume templates"*.
That required:
- `<Field>` everywhere (so editor + read-only use the same
  primitive — same as modern)
- `EditableSection` + `EditableNestedSection` for the field
  arrays (drag-to-reorder, + Add, ✕ Remove — same as every
  other template post-`feat/drag-to-reorder`)
- `isSectionHiddenFromPrint` + `useSectionPrint` + `PrintPrefsBar`
  for the section chrome (same as modern)
- `data-template` / `data-accent` / `data-max-pages` /
  `data-page-size` attrs on the article wrapper (same as every
  other template, so the print-CSS / page rules apply)
- `print:break-inside-avoid` on name/date rows (same as
  modern's per-row protection)
- `print:break-after-avoid` on every section title (same as
  modern's section breaks)

The only Jake-specific visual touches are the small-caps name,
the hairline rules under section titles, the 4-col coursework
grid, and the inline contact icons. Everything else is shared
machinery.

### Visual verification

Playwright headed screenshot at
`output/playwright/jake-template.png` (also
`output/playwright/design-lab-all.png` for the side-by-side
against the other 5). The Jake article element was screenshot
to e869 in the design lab. Visually matches the original PDF:
- Centered `ALEX MORGAN` in small caps ✓
- Centered address + single-line icon contact row ✓
- Hairline rule UNDER `SUMMARY`, `EDUCATION`, `EXPERIENCE`,
  etc. ✓
- Two-column name/date on Education / Experience / Projects /
  Volunteer / Awards / Certificates ✓
- Italic role / city rows under the name ✓
- 4-column coursework grid in Education (`• Algorithms
  • Operating Systems • Compilers • HCI`) ✓
- Bold `Languages:` `Frontend:` `Backend:` rows for Skills ✓
- `Resumake | TypeScript, Playwright, PDF` project line ✓
- `English: Native` / `Spanish: Conversational` rows for
  Languages ✓
- `Climbing: Bouldering, Sport` rows for Interests ✓

One thing I caught during visual review: the dev-mode cookie
banner overlaps the second Experience row. Not a template
defect — it's `app/_components/cookie-consent.tsx` doing
its job (consent gate) and the design lab is dev-only.

## Round 2 — the date range printed twice (user-reported, same day)

The user screenshotted the design lab and pointed at the Experience
section: `2022 – Present` appeared on **both** the company row and
the position row.

**Root cause.** The schema stores dates on `positions[]`, not on the
work entry, so the company row could only show a range by borrowing
`positions[0]`'s. The first implementation rendered a `DateRange` on
the company row *and* another on position 0's row, both bound to
`sections.work.0.positions.0.*`. Every single-position entry
therefore printed the same range twice, stacked.

**The same bug, second instance.** `location` is a *company*-level
field, but it was rendered under **every** position. A two-position
entry printed the city once per position. I only caught this because
the fix for the date forced me to look at the whole row.

**Fix — each fact renders exactly once:**

| Positions | Company row | Position rows |
|---|---|---|
| exactly 1 | company name + **date range** | title + **location** (inline, right — the original Jake row) |
| 2 or more | company name only (bare) | title + **its own** date range; location once, on position 0 |

A single borrowed range on the company row of a multi-position entry
would misrepresent the whole stint anyway, so "bare" is the honest
rendering there.

**Regression tests** (4 new, in `jake-template.test.tsx`): each
`DateRange` emits exactly one `daterange-dash-readonly` testid, so
counting those inside the Experience section is a direct assertion on
"how many ranges did we print". Verified they fail without the fix
(2-vs-1 and 3-vs-2, plus 2-vs-1 locations) and pass with it.

**Honest note on writing those tests.** My first version counted the
testid across the *whole document* and asserted 1. It failed with
"expected 3 to be 1" — because Education and Volunteer also render
date ranges. The failure looked like the component was still broken;
it was the test measuring the wrong thing. Fixed by slicing to the
Experience section first. The lesson is the same one that bit the
project before: **a count assertion needs a scope, or it is
counting someone else's data.**

## Round 3 — five fields rendered as text and were not editable (user-reported, same day)

The user came back with "I noticed I couldn't edit some things."
Rather than spot-check, I enumerated **every field in the resume
schema** (all 12 section files) and diffed the leaf paths against
what `jake.tsx` bound, using `modern.tsx` as the parity reference.

**Five fields were printed as literal strings, so clicking them did
nothing:**

| Field | Rendered as | Parity |
|---|---|---|
| `basics.phone` / `email` / `url` | `<span>{phone}</span>` | Classic/Creative/Executive/Minimal all bind via `header-lines.tsx` |
| `basics.location.address` / `city` / `region` / `postalCode` | one joined string | others bind via `LocationLineEditable` |
| `basics.profiles[].username` | `linkedin.com/in/${username}` | Classic has a full `OnlineProfilesInline` |
| `work[].location` | `{w.location}` | Modern exposes it |
| `education[].degree.minors` | read-only only ("Minor: Mathematics") | — no editor control at all |

**A sixth, subtler instance of the same bug.** The header blocks were
gated on `isSet(...)`, so on a blank resume the label, address line,
and contact row rendered **nothing at all**. There was no placeholder,
so there was nothing to click — the field could never be filled from
the editor. Fixed by gating on `mode.editable || isSet(...)`: read-only
still collapses empty slots (a blank gap in a PDF looks broken), but
the editor always renders a placeholder.

**Fix.** Every value in the header is now a `<Field>`, keeping Jake's
icons: static icon + static URL prefix + editable username. New
`AddProfileButton` (`no-print`) is the escape hatch when no LinkedIn /
GitHub profile exists yet — there is no path to bind to in that case,
so the slot renders as a hint rather than a fake editable field.
`stripScheme` on the website is a **read-only display transform only**:
the editor must show the raw stored value or the scheme is lost on
save. (An earlier version of this fix stripped the scheme in both
modes; the existing "strips the scheme prefix" test caught it.)

**Rule now written into the file's JSDoc:** a value that appears in
the template must be reachable by clicking it in the editor. Read-only
rendering is just the same `Field` with `editable: false`.

**Regression tests** — 7 new, rendering `editable` inside a real
`<FormProvider>` and asserting on the primitives' own testids:
`editable-<path>` (Field), `keyword-chips-<path>` (FieldChips),
`daterange-dash-<startPath>` (DateRange). Asserting on those rather
than on rendered text is what makes this an *editability* test — a
value can appear in the output and still be unclickable, which is
exactly the bug. Verified all 7 fail without the component fix.

**Editor verification.** `/dev/design-lab/reorder` was hardcoded to
`ModernTemplate`, and the main design lab renders `editable={false}`,
so there was **no way to eyeball Jake's editor** without signing in.
Added `?template=<id>` to the reorder lab (server component reads
`searchParams`, matching the pattern already used by the main design
lab; unknown ids fall back to `modern`). Then confirmed in a real
browser: all six previously-dead paths resolve to real inputs,
clicking `basics.location.city` focuses an `<input>`, and filling it
propagates to the address line. Screenshot at
`output/playwright/jake-editor.png`.

## Round 4 — the "+ Profile" button appended data that rendered nowhere

Asked directly whether "+ Profile" worked. It did not, and the reason
was specific enough to be worth recording.

**Symptom.** Clicking it incremented the row count (`add-profile-2` →
`add-profile-3` — proof the `append` ran and the data was in the form,
so it *would* have saved) but **no new field appeared on screen.**

**Root cause.** Round 3's header hardcoded two slots — a LinkedIn one
and a GitHub one — and looked each up by scanning `profiles` for a
matching `network`. A newly appended row is `{ network: '', username:
'' }`, which matches neither, so it rendered nowhere. The user could
click the button and type nothing, because there was nothing to type
into. The click handler was correct; the *rendering* was the bug.

**Fix.** Stop hardcoding slots; render **one row per profile**.
- Recognised network → the pretty Jake treatment (icon + static URL
  prefix + editable username), `network` field hidden.
- Blank / unrecognised network → an editable `network` field **and**
  an editable `username`. Typing "LinkedIn" into `network` re-renders
  the row as the pretty variant on commit, because `mode.data` is
  `form.watch()`.

Added `RemoveProfileButton` (per row, `no-print`) — without it a
mistyped network could only be corrected by retyping, and dropping a
profile entirely had no affordance at all. Classic has the same
control in `OnlineProfilesInline`.

**A second bug found while verifying.** A stray `title={...}` had
landed in the button's *children* position rather than its attribute
position, so it rendered as the literal text "title=3 profiles" in
the contact row. Caught by reading the live `textContent` of
`jake-contact-line` in the browser — no test would have flagged it,
because the string contains no assertion-relevant tokens. Moved it to
a real `title` attribute.

**Tests:** +2 (`renders an editable row for EVERY profile, including
blank ones`, `flips a blank-network row to the pretty form once
network is set`). The first was verified failing without the fix.

**Browser verification** of the whole cycle: click "+ Profile" → new
row with `network` + `username` inputs → type "LinkedIn" → blur to
commit → network field disappears, row reads
`linkedin.com/in/ <handle>`. Screenshot at
`output/playwright/jake-profiles-fixed.png`.

## Round 5 — the per-row remove button didn't remove the row

User report: added a profile handle, tried to delete it, and it
either didn't remove or "cleared the handle and social data but the
field still stayed."

**Root cause: `useFieldArray` called once per row.** Round 4 put the
remove button in its own component (`RemoveProfileButton`), and that
component called `useFieldArray({ control, name:
'sections.basics.profiles' })` for itself. With N rows there were N
competing subscriptions registered on the same field name, each
overwriting RHF's internal `_fields` state. `remove(i)` therefore ran
against clobbered state: it unset that row's values without shrinking
the array, which renders as exactly what the user described.

Two secondary contributors:
- Rows rendered from `mode.data.sections.basics.profiles.map(...)`
  instead of from `useFieldArray`'s `fields`. Mixing the two means the
  render can disagree with the array RHF actually manages.
- The add button lived in a separate component with its own
  `useFieldArray`, compounding the subscription count.

**Fix.** One `useFieldArray` for the entire list, inside
`JakeProfilesEditor`, rendering rows from `fields` — exactly what
`EditableSectionInner` in `editable-section.tsx` does. `remove` and
`append` are now called from that single instance, inline in the row
and footer. Both per-row hook components were deleted.

**Editor / read-only split.** `JakeOnlineProfiles` now dispatches to
`JakeProfilesEditor` (hooks, needs `FormProvider`) or
`JakeProfilesReadOnly` (no hooks). Required, because the read-only
path is server-rendered with no provider — calling `useFormContext`
unconditionally would throw in SSR / PDF / share. Same split
`DateRange` uses for the same reason.

**Browser-verified** (the only way to verify this — see below):
- Remove profile 0 of 2 → array 2→1, remaining entry shifts to index
  0, add button back to `add-profile-1`
- Add + fill a profile, then remove it → row and both its fields gone,
  contact line back to one profile
- Remove the **last** profile → 0 rows, 0 profile fields, button back
  to `add-profile-0`

**On test coverage — an honest limit.** `renderToStaticMarkup` never
dispatches a click, so **no unit test in this repo can prove that
clicking the remove button removes a row.** Every test added across
rounds 3–5 that asserted `remove-profile-N` *exists* would have
passed against the broken implementation. The suite is not
jsdom-based and adding an interaction harness is a larger change than
this bug warrants.

What the suite *can* pin is the structural invariant that caused it:
a new test asserts `jake.tsx` declares **exactly one**
`useFieldArray(` and that `JakeProfilesReadOnly` touches neither
`useFieldArray` nor `useFormContext`. That is a source-level
assertion, which is normally a smell — but the failure mode here is
*where a hook is declared*, and no rendered-markup assertion can see
that. The read-only split is independently covered: every
read-only render test would throw outright if hooks leaked in.

## Lessons / things to remember

1. **Vitest ≠ Next.js runtime.** Any `next/font/*`, `next/image`,
   `next/router`, or other Next-only module must not be imported
   from a component that the test suite touches. `font-serif`
   is the safe fallback. If a future contributor needs a
   specific font at test time, the right pattern is to load
   it once in `app/layout.tsx` and reference it via a CSS
   variable.

2. **`next/font` test failures look like "function is not a
   function"** with the call site at the top of the file
   (the Lora({}) call). This is *not* the kind of error a
   future contributor will recognize as "the font loader is
   server-only" — they'll try to fix the call site. The
   JSDoc at the top of `jake.tsx` calls this out explicitly
   so a future maintainer doesn't try to "re-add the Lora
   import to make the font work" and break the test suite.

3. **The "five" → "six" updates had three surfaces to find.**
   (a) the test files (3 places: `template-meta.test.ts` size,
   `template-gallery.test.tsx` ids-list, `design-lab.test.ts`
   anchors-count); (b) the design-lab page text
   (`app/dev/design-lab/page.tsx`); (c) the design-lab test
   doc comment. A code review that only checks the test files
   will miss the page text. The actual user sees the page
   text. Both must be updated.

4. **The `JakeSection` chrome intentionally diverges from
   `SmartSection`.** `SmartSection` puts the accent bar to
   the LEFT of the title; Jake puts the hairline rule UNDER
   it. They are *not* the same component. Forcing Jake onto
   `SmartSection` would have lost the visual identity. The
   local `JakeSection` helper is the right call; the only
   cost is one more component to keep in sync with the
   print-hide UX, and the cost is bounded by the print-hide
   tests.

5. **The 4-col coursework grid is read-only only.** In
   editor mode, the user adds courses via a normal
   `BulletList` (one per line). The 4-col grid is purely a
   read-only / print / preview presentation choice. The
   first attempt tried to make the editor render the grid
   too, but `BulletList` doesn't expose a per-item class
   (`itemClassName` was on the modern `FieldBullets` /
   `FieldChips` primitive but not on `BulletList`), and
   even if it did, a 4-col grid is awkward to edit in. The
   editor stays single-col; the read-only path is the grid.

6. **"Renders the value" and "the value is editable" are
   different claims, and only a binding distinguishes them.**
   All three rounds so far were the same mistake wearing
   different hats: a duplicated date, an uneditable phone
   number, a location repeated per position. Each one
   produced correct-looking output. Rendering a value as a
   plain string is indistinguishable from binding it — until
   someone tries to click it. When auditing a template,
   enumerate the schema fields and diff the *paths that are
   bound*, not the strings that appear. And prefer asserting
   on a binding primitive's own testid over asserting on
   rendered text.

7. **Read-only transforms must never be applied on the way
   in.** Stripping `http://` from the website for the Jake
   print look is correct for the PDF and wrong for the
   editor — an editor that showed the stripped string would
   save the stripped value. The existing test caught this
   the moment the field became a real `Field`. Keep
   display transforms strictly on the read-only branch.

8. **An affordance that appends data but renders no field
   is broken, even though the handler is correct.** The
   "+ Profile" button's `append` worked perfectly; the
   array grew; the data would have saved. It still looked
   dead because nothing appeared. When reviewing UI, check
   that a new row is *visible and typeable*, not merely
   that the underlying state changed — and when a component
   looks up rows by matching a value (like `network`),
   remember the empty/initial value matches nothing.

9. **Rendering a list beats hardcoding slots.** The LinkedIn
   slot + GitHub slot design could not represent a third
   network, an unrecognised one, or a brand-new blank row.
   A `map` over the array degrades gracefully; two hardcoded
   slots have exactly the coverage of whatever the matching
   expression happens to match.

10. **One `useFieldArray` per field array. Never one per
    row.** Calling `useFieldArray` with the same `name` from
    several components registers competing subscriptions; they
    overwrite each other's `_fields` state, and `remove()` /
    `move()` silently operate on clobbered data. The symptom
    is not a crash — it is an array that unsets values
    without shrinking. Render rows from `fields`, not from
    `form.watch()`, so the render and the array RHF manages
    cannot disagree.

11. **`renderToStaticMarkup` cannot test interaction.** Five
    rounds of Jake bugs, and rounds 4 and 5 were both
    interaction bugs that a markup assertion would have sailed
    straight past. Adding a remove button and asserting its
    `data-testid` proves it *renders*, not that it *works*.
    Interaction claims need a browser, and saying so is part
    of reporting the result honestly.

## Round 6 — closing the branch (2026-10-20)

The user explicitly asked for a real jsdom interaction harness
rather than one more visual round:

> "you can go ahead to include this so we can close this branch
> as done and merge it in after on final test"

What landed:

- `tests/interaction/harness.tsx` — minimal helper:
  `renderWithForm(defaultValues, ui)` wraps a `FormProvider`
  around whatever you render and exposes a
  `FormCapture` that surfaces the live form handle. Pair with
  `user()` (`@testing-library/user-event`) so clicks fire
  under a real act() boundary.
- `tests/interaction/editable-section-interaction.test.tsx` —
  6 tests against the shared `EditableSection`:
  add-to-empty, append, first-row remove, last-row remove,
  sequential add+remove, full round-trip via save+reload.
- `tests/interaction/jake-profiles-interaction.test.tsx` —
  5 tests for Jake's profile array: add to empty, add to
  non-empty, remove middle, sequential, round-trip. Each one
  asserts DOM *and* `form.getValues('sections.basics.profiles')`
  so a future bug where `remove()` unsets without shrinking
  the array fails the test instead of getting past it.
- `vitest.config.ts` — added `tests/interaction/**` to
  `include`. Global environment kept at `node`, jsdom opted
  into **per file** via the `@vitest-environment jsdom`
  docblock on each test. Why not a global flip: 120+ existing
  suites render through `renderToStaticMarkup` with no DOM
  and run meaningfully faster under `node`; flipping the
  global would slow them all and risk changing behaviour in
  suites that only accidentally work today (e.g. the
  `server-only` alias stub). Keeping DOM tests in their own
  folder makes the dependency obvious to the next reader.
- `package.json` devDeps: `jsdom@^25`,
  `@testing-library/react@^16`, `@testing-library/user-event@^14`.
  `@testing-library/jest-dom` removed (unused).

Mutation evidence — the harness actually catches the bug it
was written for. Reintroducing a per-row `useFieldArray` in
`JakeProfilesEditor` (the bug we shipped round 5 to fix)
made **4 of 5** Jake profile interaction tests fail with
the exact `expected [ { username: 'ada' } ] to have a length
of +0 but got 1` assertion the user typed in their bug
report ("cleared the handle and the field still stayed").
Reverted; suites green.

**Final verification (this round):**
- `pnpm typecheck` clean.
- `pnpm vitest run` → **1663 passed** across **126 files**
  (1652 → 1663, the 11 new interaction tests; the existing
  1588 tests unbroken).
- `pnpm build` → compiled successfully, 25 routes, BUILD_ID
  `J-pE-ljzago5tlflG5Wzg`.

Branch state: 6 commits ahead of `1a82acc`:

| Commit | What |
| --- | --- |
| `b9bb6a8` | feat(templates): add Jake's Resume template as sixth registry entry |
| `ae3c509` | fix(templates): Jake work entries printed the date range and location twice |
| `2e69432` | fix(templates): Jake header/work fields rendered as text and were not editable |
| `7260dc2` | fix(templates): '+ Profile' appended a row that rendered nowhere |
| `cd554cb` | fix(templates): per-row useFieldArray made the profile remove button not remove |
| `9d0676c` | test: add jsdom interaction harness for repeatable form arrays |

Closed in favor of merging into `main`.
