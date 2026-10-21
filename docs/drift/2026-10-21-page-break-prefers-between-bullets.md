# 2026-10-21 — page breaks prefer between bullets, not between entries

Branch: `fix/print-page-break-per-entry-avoid` (local only — **not merged**)

## The report

> "page breaks were skipping, or reluctant to actually break between
> bullet points. So like it would prefer to move the whole work
> experience section down. The Modern resume template is working
> properly — not skipping unnecessarily, breaking at reasonable
> points, not leaving too much white space. But the other templates
> that are not Modern, I'm seeing that issue."

## Root cause

Four templates put `print:break-inside-avoid` on the **outer
per-entry wrapper**:

```jsx
// classic / minimal / executive / creative — BEFORE
<div className="print:break-inside-avoid" data-testid="work-entry-0">
  <div className="flex items-baseline justify-between gap-3">   {/* title */}
    <h3>Acme Inc.</h3>
  </div>
  <ul><li>Bullet 1</li><li>Bullet 2</li><li>Bullet 3</li></ul>
</div>
```

`break-inside: avoid` on a block taller than the remaining page
space tells the print engine: *do not split this block.* The engine
therefore pushes the **entire entry** — header plus every bullet —
to the next page, and the slice of the previous page it vacated
becomes dead space.

The user's phrasing maps exactly onto this: the engine is "reluctant
to break between bullet points" and would "rather move the whole
work experience section down."

Modern never had the class on the wrapper (`modern.tsx:366` is a
bare `<div>`), which is why it looked correct. Jake (the sixth
template) also places it correctly — on the company row and the
position row, not on the entry wrapper — which is why it was not
measured as broken either.

## Fix

Move the class **inward** by one level, to the title row, and add a
new per-bullet guard in the shared `FieldBullets` component:

```jsx
<div data-testid="work-entry-0">                              {/* no class */}
  <div className="... print:break-inside-avoid">              {/* title row */}
    <h3>Acme Inc.</h3>
  </div>
  <ul>
    <li className="print:break-inside-avoid">Bullet 1</li>   {/* each bullet */}
    <li className="print:break-inside-avoid">Bullet 2</li>
  </ul>
</div>
```

That yields a three-part preference the engine can satisfy
independently:

| Element | Class | Effect |
|---|---|---|
| section header row | `print:break-after-avoid` | header never orphans from its body |
| per-entry title row | `print:break-inside-avoid` | company + title stay glued to their first bullet |
| each `<li>` | `print:break-inside-avoid` | a bullet never splits mid-sentence |
| entry wrapper / `<ul>` | *(nothing)* | **the engine may break between bullets** |

The last row is the actual fix. The two guards above it are what
make "break between bullets" safe rather than ugly.

Because `FieldBullets` is shared, the per-bullet rule lands on all
six templates at once, including Classic's read-only path and Jake.

## Files changed

- `components/resume-templates/classic.tsx` — work / projects /
  education / volunteer
- `components/resume-templates/classic-readonly.tsx` — same four
  (**this is the file the design lab and the public share route
  render for Classic**, so it was easy to miss — the first pass
  fixed only `classic.tsx` and the harness measured 0 units)
- `components/resume-templates/minimal.tsx` — same four
- `components/resume-templates/executive.tsx` — same four
- `components/resume-templates/creative.tsx` — same four
- `components/resume-templates/field.tsx` — `FieldBullets` gains
  per-`<li>` `print:break-inside-avoid`
- `tests/unit/print-page-breaks.test.tsx` — new strict guard + Jake
  fixture + third header-placement style
- `scripts/measure-page-breaks.mjs` — new CDP measurement harness

## Measurement

`scripts/measure-page-breaks.mjs` drives headless Chrome over the
DevTools Protocol against `/dev/design-lab`, emulates print media,
densifies the sample resume until it spans several pages, and
simulates the engine's page-fill — accumulating dead space whenever
an atomic block is pushed past a boundary.

```
template   layout     units  pages  dead-space-px  dead-space-in
---------  ---------  -----  -----  -------------  -------------
modern      post-fix       26      3              0              0
modern      pre-fix        26      3              0              0
classic     post-fix       12      4              0              0
classic     pre-fix        12      4            207            2.2
minimal     post-fix       70      4              0              0
minimal     pre-fix        70      4            218            2.3
executive   post-fix       70      4              0              0
executive   pre-fix        70      4             94              1
creative    post-fix       70      4              0              0
creative    pre-fix        70      4             94              1
jake        post-fix       26      3              0              0
jake        pre-fix        26      3              0              0
```

**6.5 inches of dead space removed** across a four-page resume, and
**zero** on every template afterwards. Modern and Jake read 0 in
both columns because they never had the outer-wrapper class — which
independently confirms the diagnosis rather than assuming it.

Artifacts land in `output/page-breaks/`.

### Honest dev notes on the measurement

1. **No `playwright` in the repo.** The first draft imported
   `playwright-core`; it isn't installed, and adding a dependency for
   a dev script isn't worth it. Node 24 ships a global `WebSocket`,
   which is all CDP needs — so the harness talks to Chrome directly.
2. **The first two runs reported 0 dead space everywhere, including
   the pre-fix column.** Two separate bugs in the harness, both of
   which would have produced a confident, wrong "fixed" answer:
   - The sample resume has **one** work entry, so no page boundary
     ever landed inside an entry. Fixed by cloning entries until the
     resume spans several pages.
   - The page-fill simulation treated "previous entry's bottom" as
     the page boundary, which is not what a print engine does.
     Rewritten to track `used` = how far down the current page we've
     filled, and to add `PAGE_H - used` to dead space only when an
     atomic block doesn't fit.
3. **Classic measured 0 units even after the source fix**, because
   the selector looked for a wrapper class (`group/work-entry`) that
   only exists in `classic.tsx` — the **editor** path. The design lab
   renders `ClassicReadOnly`, a separate file with no such class. A
   DOM probe of the Experience section confirmed the fix was present
   (`mb-4 last:mb-0` on the wrapper, `print:break-inside-avoid` on
   the inner title row) and revealed the wrappers are direct children
   of `<section>`, one level shallower than assumed. Both Classic
   files are fixed.

## Tests

`tests/unit/print-page-breaks.test.tsx` 73 → 85 tests.

New / changed:

- **Per-entry outer wrapper MUST NOT carry `print:break-inside-avoid`.**
  The pre-existing test walked the entry's whole subtree looking for
  the class and would have passed with the bug in place — the class
  was still present, just on the wrong element. The new guard asserts
  the class is absent from the wrapper's opening tag specifically.
- **Title row MUST carry it** — paired with the above so the class
  can't simply be deleted.
- **Jake added to the section-header fixtures** (all 12 section ids).
  Jake puts `print:break-after-avoid` on the `<div>` wrapping the
  `<h2>` rather than on the `<h2>` itself — correct, and arguably
  better, since that wrapper also holds the optional page-number
  badge. The header helper now understands three placements instead
  of two.

### Mutation proof

Reintroducing the original bug in `minimal.tsx` (class back on the
outer wrapper, removed from the title row):

```
FAIL  Per-entry outer wrapper — MUST NOT carry print:break-inside-avoid
      > minimal: per-entry outer wrapper does NOT carry print:break-inside-avoid
AssertionError: minimal: outer per-entry wrapper must NOT carry
print:break-inside-avoid — that pushes the whole entry onto a single
page and wastes blank space when the bullets spill onto a new page
      Tests  1 failed | 84 passed (85)
```

Reverted; back to 85 passing.

**Honest note on the first mutation attempt:** the PowerShell regex
rewrite produced invalid JSX (a stray `className=` emitted as text
after the tag's closing bracket) rather than a real mutation, and the
suite still reported 85 passing. Two lessons: a mutation test only
counts if you confirm the mutation actually applied, and a
syntax-broken file that still "passes" means the runner cached the
previous transform. Redone as a proper `edit` call, which failed the
test correctly.

## Verification

- `pnpm typecheck` — clean
- `pnpm test` — **1660 / 126 files passing**
- `pnpm build` — clean
- `node scripts/measure-page-breaks.mjs` — dead space 0 on all six

## Not done

- **No visual confirmation.** The numbers are geometric (dead space
  at page boundaries), not eyeballed. Worth one look at a real
  multi-page resume in `/dev/design-lab` before merging, per the
  lesson from `fix/print-settings-actually-apply` where a
  "wired correctly" claim was wrong until screenshots proved it.
- **Not merged.** Branch is local only, as requested.
- **`scripts/measure-page-breaks.mjs` is committed as a dev tool.**
  It has no test and isn't wired into CI. If it's only useful
  occasionally, it may belong in `docs/` or be trashed after review.
- **Classic's editor path (`classic.tsx`) isn't reachable from the
  design lab**, so its fix is verified by unit test + source
  inspection only, not by the harness. It renders in the editor with
  `editable={true}`.