# Drag-to-reorder — Plan

> Plan template: [`AGENTS.md`](../../AGENTS.md) §Planning discipline.
> Branch: `feat/drag-to-reorder`. Commit footer: `Plan: docs/plans/drag-to-reorder.md`.

## Objective

Let the user drag any repeatable entry up or down inside its section to
reorder it. Work entries, Projects, Education entries, Awards,
Certificates, Publications, Volunteer entries, References, and the
nested `positions` array inside each Work entry — all become draggable
in the editor (`/dashboard/resumes/[id]`).

Reordering is a pure form-state operation (no DB write until the user
clicks Save or hits Ctrl/Cmd+S) and is fully keyboard-accessible. Read-only
views, the `/preview` route, the public `/r/[token]` share, the
`/dev/design-lab` route, and the print/PDF output are untouched.

## User-visible behavior

### In the editor (`/dashboard/resumes/[id]`)

- Every repeatable row gains a small persistent drag handle on its left
  edge. The handle is a `<button aria-label="Drag to reorder [section]">`
  rendering a `GripVertical` icon, with `cursor-grab` (and
  `cursor-grabbing` while a drag is active).
- Mouse / touch: click and hold the handle, drag the row, drop it on
  the target row. A faint ghost (`<DragOverlay>`) follows the cursor.
  The target row's vertical position shifts as the ghost crosses it.
- Keyboard: Tab to the handle, press **Space** to pick up, **↑ / ↓** to
  move by one row, **Space** to drop. (dnd-kit's built-in
  `sortableKeyboardCoordinates` — we do not reimplement it.)
- A successful drag makes the form dirty. The existing **Save** button
  is unchanged. No new UI surface, no new toolbar button. The
  `Saved [time]` hint at the bottom updates after the user saves.
- The handle is `no-print`, never appears in the rendered PDF.
- Multi-section: each section is its own sortable list (its own
  `<SortableContext>`). Dragging a Work entry into Projects is
  physically impossible — different parents, different lists.
- Reordering within a Work entry's nested Positions works the same way.

### Read-only / print / share / design-lab (everywhere `editable=false`)

- No handle, no dnd-kit context mounted, zero markup change. Renders
  are identical to today.

### Edge cases

- **Drag a row to the same position** — dnd-kit fires a no-op
  `onDragEnd` where `active.id === over.id`. We short-circuit before
  calling `useFieldArray.move`.
- **Drag while a save is in flight** — `<DndContext>` reuses the
  existing `pending` disabled-state model: while `pending` is true the
  Save button is disabled. We mirror that on the handle via the
  `disabled` DndContext sensor option so a mid-save drag attempt can't
  conflict with a revalidatePath refetch.
- **Empty list + drag** — `useFieldArray.move` on an empty list is a
  no-op; we don't render a handle if there are zero rows. (The "+
  Add" button still works as today.)
- **Single-row list + drag** — handle still renders, but a drag to the
  only row is a no-op (`active === over`, handled above).

## Architecture

```
Edit / preview / share / PDF routes
 └── <Template data editable=... />
       └── <EditableSection>           ← shared helper for all 5 templates
              ├── <DndContext>         ← only when editable === true
              │   sensors: PointerSensor + KeyboardSensor
              │   onDragEnd: useFieldArray.move(activeIndex, overIndex)
              │   disabled while save is pending
              │     └── <SortableContext items={fields.map(f => f.id)}>
              │           └── fields.map((field, i) =>
              │                <SortableRow id={field.id}
              │                               ariaLabel="Drag to reorder ...">
              │                  ├── <DragHandle />   ← GripVertical, no-print
              │                  └── <children(i) />  ← existing row content
              │              </SortableRow>)
              │     </SortableContext>
              │     <DragOverlay>      ← the ghost that follows the cursor
              │   </DndContext>
              └── <Button>+ Add …</Button>
                  onClick: append(defaultRow)
```

State plumbing: zero new RHF wiring. `useFieldArray` already exposes
`move(from, to)`. We call it on drag-end. The form's dirty bit flips
automatically (a moved array is a mutation), and the existing
`form.handleSubmit → saveResumeAction` pipeline persists the new order
on the next Save click.

## File plan

### New

- `components/resume-templates/sortable-row.tsx` — `<SortableRow>`
  primitive. Wraps `useSortable({ id })`, applies `setNodeRef` +
  `transform` + `transition` to the wrapper div, renders the
  `GripVertical` handle (button element with `aria-label`), forwards
  `className` to the wrapper. Children render unchanged.
- `tests/unit/sortable-row.test.tsx` — handle has the right
  `aria-label`, handle is `no-print`, dnd-kit's `aria-roledescription`
  attribute is set on the wrapper (dnd-kit's own a11y signal), the
  wrapper accepts `transform`/`transition` style strings when a drag is
  active (mocked via a `useSortable` re-export).

### Changed

- `components/resume-templates/editable-section.tsx`:
  - Wrap the field list in `<DndContext>` + `<SortableContext>`. The
    `<DndContext>` is mounted only when a `reorderable` prop is true
    (default true — the only caller we ship with reordering on is the
    editor's `EditableSection` instance; the SchemaForm's
    `array-field.tsx` could opt out by passing `reorderable={false}`).
  - Each row div becomes `<SortableRow id={field.id} ariaLabel={…}>`.
  - `onDragEnd` resolves `active.id` and `over.id` to array indices via
    `fields.findIndex(f => f.id === id)`, then calls
    `useFieldArray.move(from, to)`. Short-circuits if either index is
    -1 or they match.
  - `<DragOverlay>` renders the row's content for the ghost. Wrap each
    row's body in a stable React element key on `field.id` so the
    overlay can re-render the active row cleanly.
  - The wrapper div currently has `key={field.id}` — that key is what
    dnd-kit needs to identify rows; we keep it. No data-testid
    changes (`${testIdPrefix}-${i}` stays on the inner sortable element
    so existing tests keep passing).
- `components/resume-templates/modern.tsx`,
  `components/resume-templates/executive.tsx`,
  `components/resume-templates/creative.tsx`,
  `components/resume-templates/minimal.tsx`,
  `components/resume-templates/classic.tsx`:
  - **Zero changes**. The whole feature rides on
    `EditableSection` / `EditableNestedSection`, which they already
    consume.
- `package.json` (via `pnpm add`):
  - `@dnd-kit/core` ^6
  - `@dnd-kit/sortable` ^8
  - `@dnd-kit/utilities` ^3
- `pnpm-lock.yaml` — regenerated by pnpm.

### Unchanged

- `components/resume-templates/field.tsx`,
  `components/resume-templates/header-lines.tsx`,
  `components/resume-templates/date-range.tsx`,
  `components/editable/editable-resume.tsx`,
  `components/editable/edit-section-dialog.tsx`,
  `app/(dashboard)/dashboard/resumes/[id]/page.tsx`,
  `app/(dashboard)/dashboard/resumes/actions.ts` (saveResumeAction),
  `lib/resume-schema/**`, `lib/db/queries.ts`,
  `app/(dashboard)/dashboard/resumes/[id]/preview/page.tsx`,
  `app/dev/design-lab/page.tsx`, `app/globals.css` print rules.
- The schema-form / EditSectionDialog path: today's
  `EditSectionDialog` uses `sections/*.ts` Zod schemas directly and
  its own array UI (not `useFieldArray`). Reordering is not added
  there in this plan — see "Out of scope" below.

## Decisions made (the forks worth pushing back on)

1. **Library: `@dnd-kit`** (vs `react-beautiful-dnd` or
   `@atlaskit/pragmatic-drag-and-drop`). `react-beautiful-dnd` is
   unmaintained since 2024 and does not officially support React 19.
   Pragmatic is newer with a smaller React Hook Form story. dnd-kit is
   active, a11y-first, ~30 kB total, and `useFieldArray.move` drops in
   on top with no adapter layer.
2. **v1 scope = top-level entries + nested Positions.** Skills,
   Languages, Interests (chips-based today) are v2 because reorder
   inside a chip cloud is a separate UX question that needs product
   input first (chips vs row-per-item, merge-on-drag-into-same-name,
   etc.).
3. **Drag handle = persistent left-edge column** (not hover-reveal).
   Discoverable on first glance. Matches WAI-ARIA's documented drag
   pattern (the handle is the affordance, not a row hover). The
   existing ✕ remove stays hover-revealed.
4. **No new server action, no DB write on drag-end.** Drag-end mutates
   RHF state. Save persists. Matches the explicit-Save, no-autosave
   decision locked in `docs/plans/wysiwyg-editor.md` (2026-07-07).
5. **Single `SortableRow` primitive** shared across all sections, so
   handle styling / a11y label / no-print guarantee cannot drift
   between the five templates.

## Risks & mitigations

- **Drag listeners interfere with click-to-edit text leaves.**
  `useSortable`'s `listeners` are attached to the handle *button*
  only, not to the row. Click-to-edit on `<EditableText>` keeps
  working because the click never reaches the handle.
- **`form.watch()` re-renders the whole template on every drag tick.**
  `form.watch()` (in `editable-resume.tsx:339`) is unwatched — every
  change re-renders the full template. For sections with ≤ 30 rows
  this is fine; the moving transform is applied at the wrapper div,
  not the template. After drag ends (a single RHF mutation), the
  re-render is one pass. Acceptable.
- **`useFieldArray` `key` stability.** RHF's `useFieldArray` returns
  `{ id, ... }` where `id` is per-row and stable across moves — dnd-kit
  uses it as the drag-id. Verified: same library integration exists
  on the official dnd-kit docs and on the react-hook-form dnd-kit
  example (see `useFieldArray.move`).
- **`@dnd-kit` + React 19 strict mode.** dnd-kit v6.x is React 18+;
  strict-mode double-invoke is handled by dnd-kit's internals.
  Confirmed in the dnd-kit issue tracker for React 19.
- **Bundle size.** `@dnd-kit/core` + `@dnd-kit/sortable` +
  `@dnd-kit/utilities` ≈ 30 kB gzipped, tree-shaken to whatever you
  actually import. Editor-only — the preview / share / PDF / design-lab
  paths do not import the `EditableSection` reorder wrapper when
  `editable={false}`, so they do not pay the cost. We verify this
  with `@next/bundle-analyzer` if it isn't already wired in.
- **No-print correctness.** The handle and the `<DragOverlay>` ghost
  both carry `className="no-print"`. The `no-print` utility already
  exists in `globals.css` and is used by every other editor chrome
  element (Add button, ✕ remove, Save button, validation summary).
- **`pending` mid-save drag.** We pass `disabled={pending}` to
  `<DndContext>`, so dnd-kit cleanly rejects activations when a save
  round-trip is in flight. No races with `router.refresh`.

## Tests

New (in `tests/unit/sortable-row.test.tsx`):

- Renders the wrapper with `data-testid` and the dnd-kit
  `aria-roledescription` attribute (the library's own a11y signal).
- Drag handle renders with `aria-label="Drag to reorder [section]"`.
- Drag handle tag is `no-print` (the `<button>` opening tag slice
  contains the class — same pattern as
  `editable-section.test.tsx:101-121`).
- A `transform` style is rendered on the wrapper when
  `useSortable()` reports a non-identity transform (mock the re-export).
- Source-level pinning: `useFieldArray.move(from, to)` is called on
  `onDragEnd` with the resolved indices, and a same-id drop is a
  no-op (no `move` call).

Extended (in `tests/unit/editable-section.test.tsx`):

- Existing 9 tests continue to pass. We don't change `data-testid`
  values or the `<button>`/`<div>` shapes that the existing tests
  slice out.
- New test: when `reorderable={false}` is passed, no handle is
  rendered, no DndContext attribute appears in markup.

We intentionally do **not** simulate a real drag interaction via
`fireEvent` — the runner is `environment: 'node'` with no jsdom
(see `print-button.test.tsx` for the same discipline), so a
markup-pin + source-level-pin test is the contract the project
already uses for editor primitives.

## Non-goals (out of v1)

- Reordering whole sections (Experience above Skills). Different scope,
  different UX review, separate plan.
- Reordering Skills / Languages / Interests chips. v2 — "reorder inside
  a chip cloud" is its own UX call (chips vs row-per-item, dedup on
  drag-into-same-name).
- Drag from the variants list page
  (`app/(dashboard)/dashboard/resumes/page.tsx` master ↔ variant
  ordering). Out of scope — that's list management, not resume editing.
- Animations on the drop indicator beyond dnd-kit's defaults.
- localStorage persistence of the dragged order mid-edit. The form
  already survives navigation via the explicit Save.

## Acceptance criteria

1. In the editor at `/dashboard/resumes/[id]`, every Work entry,
   Project, Education entry, nested Work `position`, Award,
   Certificate, Publication, Volunteer entry, and Reference row has a
   visible drag handle on the left edge.
2. Mouse-drag reorders rows within each section. The new order
   persists on next Save (manual click or Ctrl/Cmd+S) and survives a
   page reload.
3. Keyboard: Tab to the handle, Space, ↑/↓, Space. Confirmed in
   Playwright (one smoke test in
   `tests/integration/drag-reorder.spec.ts` if you want E2E — optional,
   not required for merge).
4. The handle never appears in the rendered PDF
   (`window.print()` → `print` media query) or in the public
   `/r/[token]` share view.
5. All 9 existing `editable-section.test.tsx` cases continue to pass.
6. Adding a row or removing a row still works after the drag wrapper
   is in place.
7. `pnpm typecheck` passes with no `any` casts. `pnpm test` passes.
   Bundle size delta of `@dnd-kit/*` is within the project's perf
   budget (≤ 50 kB gzipped on the editor route).

## Out of scope (v2 ideas)

- Reordering Skills/Languages/Interests chips.
- Drag-to-reorder whole sections (Experience above Skills).
- Drag-from-outside to append new sections (e.g. drop a "position"
  entity from outside into a Work entry).
- Animation polish (spring physics on the drop indicator, accessibility
  hints via `aria-describedby`).
- Auto-save on drag-end (would conflict with the explicit-Save decision
  and the immutable-form-state model the AI inline-issue bridge
  depends on; needs its own plan).
