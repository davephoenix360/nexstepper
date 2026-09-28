# Collapsible sections — Plan

> Plan template: [`AGENTS.md`](../../AGENTS.md) §Planning discipline.
> Branch: `feat/collapsible-sections`. Commit footer: `Plan: docs/plans/collapsible-sections.md`.

## Objective

Two related UX cleanups on `/dashboard/resumes`, both backed by the
native `<details>` element (no JS, server-rendered initial state, fully
accessible):

1. **Variant list collapse per master** — the variant `<ul>` under
   each master card becomes a `<details>` with a custom summary row.
   Click summary → collapse / expand. Default open.
2. **Create-master card collapse** — the "Create a master resume"
   card becomes a `<details>` with a button-styled summary. Default
   closed on the populated dashboard so the page reads as a library,
   default open on the empty-state dashboard so first-time users can
   create their first resume in one click.

Both pieces use the same primitive (`<details>` + `<summary>`) so
keyboard interaction, screen-reader semantics, and "expanded / collapsed"
ARIA state are handled by the platform.

## User-visible behavior

### Variant list (per master card)

- The variant count `3 variants` (or `No variants yet`) **moves from
  the master card header** to a **summary row** that sits above the
  variants `<ul>`, with a `ChevronDown` icon on the right that flips
  to `ChevronUp` (CSS `rotate-180`) when the section is open.
- The summary row is the toggle. Click it → collapse / expand.
- Default state: **open** for all masters with ≥1 variant.
- When `variantCount === 0`, no summary row + no `<details>` are
  rendered — the header still shows "No variants yet" (no collapse
  affordance for an empty list).

### Create-master card

- The `Card` becomes a `<details>` with the form inside.
- The summary is a button-styled element: a `Plus` icon, the title
  "Create a master resume", and a `ChevronDown` that flips when open.
- Default state:
  - `families.length === 0` (empty dashboard) → **open**. First-time
    users see the form immediately.
  - `families.length > 0` (populated dashboard) → **closed**. The
    page reads as "your library" with a single "+ Create" button to
    expand the create form.
- Server-decided initial state — no persistence across refreshes
  (acceptable for v1; localStorage can come later if it bites).

## Scope (in)

- `<details>` + `<summary>` markup in two places.
- A small CSS rule in `globals.css` to hide the native disclosure
  triangle (we render our own chevron).
- A small unit test confirming the variant count string still
  appears (it moved from header to summary but stays in the markup).

## Non-goals (out of this plan)

- **localStorage persistence** for collapsed state across refreshes.
  The user said "ability to minimize" — server-decided initial state
  is enough for the ask.
- **"Collapse all / Expand all"** buttons for the variant list. Each
  master collapses independently.
- **Animations** on the chevron. CSS `rotate-180` on `[open]` is
  instant; a smooth transition would be nice but is out of scope.
- **Animation on the details content itself**. `<details>` has a
  built-in instant show/hide; we'd need the new `interpolate-size`
  CSS or Radix Collapsible for animated height. Not in scope.

## Architecture

`<details>` is the right primitive here:

- **No JS state to manage** — the browser owns open/close.
- **SSR-friendly** — server decides initial state via the `open`
  attribute, no hydration mismatch potential.
- **Accessible by default** — `<summary>` is keyboard-focusable,
  Space/Enter toggles, screen readers announce "disclosure,
  collapsed/expanded".
- **Zero new dependencies** — no Radix Collapsible, no headless-ui.

The only styling work is:

1. Hide the native disclosure triangle:
   ```css
   details > summary { list-style: none; }
   details > summary::-webkit-details-marker { display: none; }
   ```
2. Replace with our own `ChevronDown` icon, rotated 180° when
   `[open]` is set:
   ```tsx
   <details className="group" open={...}>
     <summary className="...">
       ...
       <ChevronDown className="... group-open:rotate-180 transition-transform" />
     </summary>
     {children}
   </details>
   ```

The `group-open:rotate-180` Tailwind v4 variant produces
`.group\:open\:rotate-180:is([open], :popover-open, :open) { ... }` —
already verified in the live CSS bundle (the dialog uses the same
mechanism).

## Files

- **New:** none.
- **Changed:**
  - `app/(dashboard)/dashboard/resumes/_components/resume-list.tsx`
    — wrap the variants `<ul>` in `<details>` with a summary row;
    remove the variant-count `<span>` from the master header (now
    lives in the summary). Add `group` class on the `<details>` and
    `group-open:rotate-180` on the chevron.
  - `app/(dashboard)/dashboard/resumes/page.tsx` — wrap
    `<CreateMasterResumeForm>` in `<details open={families.length === 0}>`
    with a button-styled summary. Use `<Card>` as the visual shell
    when open, plain border + padding when closed (so the button
    reads as a single card-shaped button).
  - `app/globals.css` — add the 2-rule CSS to hide the native
    disclosure triangle.
  - `tests/unit/resume-list.test.tsx` — keep the existing assertions
    that look for "2 variants" / "1 variant" in markup; add an
    assertion that the `<details>` element exists for the populated
    case and is absent for the empty case.

## DB / schema

No changes.

## Dependencies

None. Pure HTML + 2 lines of CSS + Tailwind utilities that already
exist.

## Acceptance criteria

1. On a populated dashboard, every master card shows a "N variants ▾"
   summary row above the variants list. Clicking it collapses the
   list; clicking again expands it.
2. On an empty dashboard (no resumes), the create card is **open**
   so the form is visible. The first resume can be created without
   any extra clicks.
3. On a populated dashboard, the create card is **closed** by
   default; the page reads as a library with a "+ Create" button
   affordance. Clicking the summary opens the form.
4. The native disclosure triangle is invisible — we render our own
   chevron that rotates 180° between open and closed states.
5. `<details>` keyboard interaction works: Tab to summary, Space/
   Enter to toggle.
6. All 976 existing tests still pass; the updated
   `resume-list.test.tsx` still passes with the variant-count
   string moved from header to summary.

## Test plan

- **Unit:** `tests/unit/resume-list.test.tsx`
  - Existing assertions for "2 variants" / "1 variant" still hold
    (string moved, not removed).
  - New assertion: when a master has ≥1 variant, the rendered HTML
    contains a `<details>` element wrapping the variants.
  - New assertion: when a master has 0 variants, no `<details>`
    element wraps anything (the variant-count `<span>` in the header
    is still present).
- **Manual smoke (post-deploy):**
  - Empty dashboard → form is visible.
  - Populated dashboard → form is collapsed; click "+ Create" → form
    expands.
  - Master with 3 variants → click summary → variants collapse,
    chevron rotates up.

## Rollback plan

Revert the commit. Pure markup change, no data implications.

## Open questions

None. `<details>` is the obvious primitive and the empty-vs-populated
default split is the obvious UX choice.