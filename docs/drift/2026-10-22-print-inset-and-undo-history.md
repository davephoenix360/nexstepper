# Drift — the editor printed with a band of white around it, and it had no undo

Date: 2026-10-22
Branch: `feat/chat-agent-v3-phase-a`
Harness: `scripts/measure-print-isolation.cjs`

## Two things the user reported

1. **Printing from the editor left a band of white around the resume.**
   The share link's print was clean; the editor's was not.
2. **There was no undo or redo.**

## The print bug

### What it was

The share page renders the resume on its own. The editor renders the
same template inside the dashboard chrome — and the chrome's own padding
and vertical rhythm sat BETWEEN the page box and the resume, so in print
they landed **on top of** the `@page` margin.

Measured, not guessed (`scripts/measure-print-isolation.cjs`, which
reproduces the editor's chain and prints it):

| | text inset from the paper edge |
|---|---|
| without isolation | **1.25in** |
| with isolation | **0.75in** (= the `@page` margin) |

The extra 0.5in is exactly the chrome's padding: 16px on `<main>` plus
32px on the page's `<section>`. On top of that, `space-y-6` on two
wrappers added 24px of top margin each.

### Why the share page was clean

Not because it did anything clever — because it has **no chrome at all**.
It renders the template in a bare wrapper with `print:py-0 print:px-0
print:max-w-none`, so nothing can be between the page box and the
resume.

### The fix — and the reason it was a one-liner

`app/globals.css` already had a print-isolation mechanism from the
print-default-opt-in work (Phase 1g):

```css
.printable-root * { visibility: hidden; }
.printable-root .printable,
.printable-root .printable * { visibility: visible; }
.printable-root .printable { position: absolute; left: 0; top: 0; width: 100%; }
```

A page opts in by adding `.printable-root` to its outer wrapper, and the
resume is repositioned to the page origin.

**The preview route was its only consumer — and that route was deleted**
when direct printing from the editor replaced it. The opt-in went with
it, and the editor never inherited it. So the mechanism was still in the
CSS, still tested, and had no user.

The fix is one class on the editor's `<section>`.

### The risk that was retired first

`position: absolute` on the resume could have broken pagination — an
absolutely positioned box that overflows the page has to still fragment.
`scripts/measure-print-isolation.cjs` measures that directly: **3 pages
either way**, so the mechanism fragments correctly.

### Also fixed along the way

- The editor's own wrapper chain is now print-neutral, so the `@page`
  margin is the only margin the printed page has.
- `tests/unit/print-isolation.test.tsx` gains a check that the editor
  opts in — the class is now load-bearing, and a future refactor that
  drops it would otherwise silently reintroduce the band.

## Undo / redo

### Where the history lives

**Local storage, not the database.** The resume is JSON and so is the
history; putting it in Postgres would mean a write per change, a table
to migrate, and a GDPR surface for data the user already asked us to
hold. The history is a transient editing aid — it belongs to the browser
session. The **database still holds the document**: undo/redo never
causes a write of its own, it changes the form, and the existing
debounced autosave picks that up exactly like any other edit.

Storage key: `nexstepper:history:<resumeId>`, capped at 50 entries per
stack. A resume is a few KB of JSON, so 50 entries is a couple of
hundred KB against a 5MB budget.

### The unit of undo

The editor commits a field on **blur** — `EditableText` keeps the draft in
local state and calls `field.onChange` on blur. So a text field is one
atomic change, not a stream of keystrokes, and no coalescing heuristic
is needed: the form state IS the right granularity.

This also means **an AI rewrite is undoable**. The chat writes a
revision, the server hands the editor new data, the form resets, and
because the new state differs from the last one it is pushed as a
normal snapshot. A reset that changes nothing pushes nothing.

### Implementation

`components/editable/use-undo-history.ts`. Snapshots are **serialised
strings**, for three practical reasons: comparing states is an exact
string compare rather than a deep-equality guess; the local-storage
shape is a plain array of strings; and restoring is `JSON.parse` +
`form.reset`.

Undo pops `past` and pushes the current state onto `future`; redo is the
mirror. A new change clears the redo stack, like every editor.

### The gesture

Ctrl/Cmd+Z to undo, Ctrl/Cmd+Shift+Z (or Ctrl+Y) to redo, plus Undo
and Redo buttons in the toolbar.

**The gesture is ignored while focus is inside a text field** — Ctrl+Z
there is the field's own undo, and the user editing one bullet expects
the browser's behaviour, not the whole document to jump back.

### A bug the tests caught

`isRedoShortcut` recognised Cmd+Shift+Z but not **Ctrl**+Shift+Z, which
is the Windows and Linux redo gesture. The test found it on the first
run.

## Tests

- `tests/interaction/undo-history.test.tsx` (14) — one snapshot per
  committed change, undo/redo round trip, a new change clearing the redo
  stack, undo not recording a snapshot of its own, the history landing in
  local storage, a stored history surviving a reload, corrupt and
  wrong-version entries being ignored, the cap, and the shortcut
  predicates.
- `tests/unit/print-isolation.test.tsx` (+2) — the editor opts into
  print isolation and still renders the resume inside a `.printable`
  wrapper (if it ever stopped, the printed page would be BLANK).

Suite: 1946 → 1962.
