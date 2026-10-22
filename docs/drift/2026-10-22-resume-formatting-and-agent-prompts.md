# Drift — resume formatting fidelity + agent prompting UX

Date: 2026-10-22
Branch: `feat/chat-agent-v3-phase-a`
Plan: `docs/plans/chat-agent-v3.md` (Phase E)
Data: `docs/plans/resume-length-guidelines.md`

## What prompted it

A manual pass over the live product, not a test failure. Four
observations:

1. Empty location fields still printed their commas — "123 Main St, , ,".
2. There was no way to adjust the spacing between entries inside a
   section, only between sections.
3. Jake's vertical rhythm was loose enough to look like wasted space.
4. The agent had no starting prompts, and the user had to know what to
   ask.

## What changed

### The stray commas

Jake's header renders all four location slots in EDIT mode, so each is
clickable, and printed a comma before every one of them. The
placeholder text is `print:hidden`; the comma was not. So the printed
line came out as `123 Main St, , ,` — commas with nothing between them.

`components/resume-templates/optional-separator.tsx` now owns the rule:
a separator is always visible on screen (so the empty editor reads as a
list of fields) and visible in PRINT only when the slot it precedes and
something earlier in the row both have values.

The "something earlier" half matters: the printed sequence skips empty
slots, so with city="Edmonton", region="", country="CA" the printed
line is "Edmonton, CA" — the comma belongs to the country slot even
though the region slot sits between them in the DOM.

The other templates use `header-lines.tsx`, which already implemented
the correct rule. Jake was the outlier.

### Item spacing

`sectionSpacing` was the gap between SECTIONS. There was no knob for the
gap between ENTRIES inside one — one work role and the next, one
project and the next, one skill row and the next.

Added `itemSpacing` (compact / standard / relaxed) with a popover
control, a `--resume-item-spacing` CSS var, and three derived gaps:

    --resume-item-gap-tight   0.5x   → skill rows, language rows
    --resume-item-gap         1.0x   → work entries, projects
    --resume-item-gap-wide    1.15x  → the loosest stacks

One knob moves all three rhythms without flattening the hierarchy. All
eight template files now read the vars instead of hardcoded `space-y-*`.

### `coercePrintSettings` is field-tolerant

It used to `safeParse` the whole object and fall back to ALL defaults
on any failure. That is a silent data-loss pattern: adding one field to
the schema would have made every resume stored before that field
existed fail the parse — and the user's chosen "compact margin" would
have reverted to standard.

Each field now falls back to its own default. A bad or missing
`itemSpacing` no longer disturbs the margin.

### Agent prompting

- `lib/chat/suggested-prompts.ts` — the prompts people type to a resume
  AI, JD-aware when a job description is attached. One source feeds both
  the chips and the automatic run, so they cannot drift.
- Chips render in an empty chat.
- When a variant is created from a JD, the chat opens and runs the
  tailoring pass automatically (Pro only — Free users get the chip and
  spend their own daily allowance). Guarded so a reload does not re-run
  it and create a second session.

## The measurement, re-run

Changing the layout invalidated the measured numbers the agent reasons
with, so they were re-measured from real prints after the change:

| template | before | after |
|---|---|---|
| Classic | 19.42in | 19.64in |
| Minimal | 13.93in | 13.59in |
| Modern | 18.04in | 18.02in |
| Executive | 14.64in | 14.31in |
| Creative | 15.13in | 15.00in |
| Jake | 19.70in | 19.88in |

Within noise — which is the point of the mapping: it reproduces the
templates' visual baseline at the default setting, so the knob changes
density without changing the design.

The generated prompt table
(`lib/chat/section-space.generated.ts`) was regenerated from the new
measurements, not hand-edited.

## Honest notes

- The item-spacing knob only affects the ITEM gaps. Section gaps are
  still `sectionSpacing`, and the two are independent.
- The bullets' own `pl-5` indent was left alone. It is the standard
  hanging indent for resume bullets and reads as a list; the complaint
  was about vertical space, not this.
- The auto-run is Pro-gated because it spends a model call on the
  company's behalf. If Free users should get it too, the daily turn cap
  is the existing guard.

## Verification

Typecheck clean, full suite green, build clean.
