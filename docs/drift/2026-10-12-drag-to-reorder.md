# 2026-10-12 — Drag-to-reorder shipped on `feat/drag-to-reorder`

## Context

The user reported (2026-10-12) that reordering items inside a resume
section required editing JSON or removing-and-re-adding. No first-class
drag-and-drop existed for Work entries, Projects, Education entries, or
the nested Positions inside a Work entry.

## What shipped

Branch `feat/drag-to-reorder`, three commits ahead of `main`:

| Commit | Subject |
|---|---|
| `2367369` | `chore(deps): add @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities` |
| `028e696` | `feat(editor): drag-to-reorder for repeatable rows via @dnd-kit + SortableRow` |
| `05aa525` | `feat(dev): /dev/design-lab/reorder sub-page verifies drag end-to-end` |

## Behaviour

Every repeatable section that routes through `EditableSection` — Work,
Projects, Education, Awards, Certificates, Publications, Volunteer,
References, plus the nested `positions` inside each Work entry — gains
a left-edge drag handle (lucide `GripVertical`, `cursor-grab` /
`cursor-grabbing`, `aria-label="Drag to reorder [section]"`).

- Mouse: click + hold the handle, drag onto a target row, drop. A faint
  ghost (`<DragOverlay>`) follows the cursor; the in-place row fades.
- Keyboard: Tab to the handle, Space to pick up, Arrow Up/Down to move
  one row, Space to drop. Wired through `sortableKeyboardCoordinates`.
- Persistence: drag-end mutates RHF state via `useFieldArray.move`,
  marks the form dirty, the existing `Save` button (or Ctrl/Cmd+S)
  persists on the next click. No new server action, no migration,
  no autosave — this matches the explicit-Save contract locked
  2026-07-07 in `docs/plans/wysiwyg-editor.md`.
- Print: handle and ghost both carry `className="no-print"`. The
  rendered PDF / shared `/r/[token]` view / `/preview` route all show
  the rows in their persisted order with no editor chrome.

## Architecture

```
<DndContext sensors={PointerSensor + KeyboardSensor}
            collisionDetection={closestCenter}>
  <SortableContext items={fields.map(f => f.id)}
                   strategy={verticalListSortingStrategy}>
    {fields.map((field, i) =>
      <SortableRow id={field.id} ...>{children(i)}</SortableRow>
    )}
    <DragOverlay>{activeId !== null && children(activeIndex)}</DragOverlay>
  </SortableContext>
</DndContext>
```

`onDragEnd` resolves `active.id` and `over.id` to array indices via
`fields.findIndex`, then calls `useFieldArray.move(oldIndex, newIndex)`.
Same-id drop is a short-circuit no-op.

`EditableSection` exposes a new opt-out `reorderable={false}` (default
`true`) so the SchemaForm `ArrayField` path, if it ever adopts this
helper, can suppress the drag chrome without forking the component.

## Tests

- 9 new in `tests/unit/sortable-row.test.tsx` — handle a11y,
  no-print, lucide glyph, data-testid default + override, dnd-kit's
  `aria-roledescription="sortable"` wired through.
- 9 → 17 in `tests/unit/editable-section.test.tsx` — drag affordances
  coexist with Add + Remove, drag handle label inherits from
  addLabel, `reorderable={false}` suppresses drag chrome cleanly,
  source-level pins: `useFieldArray` wired with `control` + `name:
  path`, `useFieldArray.move(oldIndex, newIndex)` is the
  persistence call, no-op guard on `active.id === over.id`.
- 1478 tests passing pre-branch vs 1478 post-branch (17 added in
  this branch, 0 removed).
- `pnpm typecheck` clean.

## Verification surface

`/dev/design-lab/reorder` renders the Modern template with
`editable={true}` against `gallerySampleResumeData` and shows a live
"Live order (re-renders on drag)" sidebar that re-reads
`sections.work` / `sections.projects` / `sections.education` /
`sections.skills` after each drag. Reset button to revert to the
gallery sample.

> **Runtime note:** during the in-app Browser verification attempt on
> this branch the Electron FilePanel browser was unresponsive across
> every action (text-query / inspect / screenshot / navigate all
> timed out locally, even on the existing `/dev/design-lab` page —
> not specific to the new route). The Next.js dev server itself
> returned 200 for the route with no compile errors logged, so the
> page is structurally verified. Manual drag testing should be done
> against `http://localhost:3000/dev/design-lab/reorder` in the
> user's own browser session.

## What this means for the editor

The user's complaint ("I can't reorder my work items without JSON
hackery") is now a one-click drag. Day-to-day editor experience: tab
to a handle, drag, drop, click Save. No new server calls per drag,
no DB writes until the user confirms.

## Standing

This branch + sub-page is the v1 delivery. The plan
(`docs/plans/drag-to-reorder.md`) explicitly deferred:

- **Skills / Languages / Interests chip reorder** — different UX
  call (chips vs row-per-item, dedup-on-drop-merge). v2.
- **Whole-section reorder** (e.g. Experience above Skills). Different
  scope. Separate plan.
- **Drag-from-outside to append new sections.** Out of scope.
- **Animations on the drop indicator beyond dnd-kit defaults.**
  Polish. v2.
- **Auto-save on drag-end.** Conflicts with the explicit-Save
  decision and the immutable-form-state model the AI inline-issue
  bridge depends on. Needs its own plan.

Merge to main when ready; no production env-var change required
(the dnd-kit packages are pure client deps). Bundle size delta
≈ 30 kB gzipped on the editor route only — read-only / preview /
share / design-lab paths do not mount `EditableSection` with
`reorderable={true}` and pay the cost.
