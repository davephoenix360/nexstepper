# The agent introduction bubble — Plan

> Plan template: [`AGENTS.md` § Planning discipline](../../AGENTS.md#planning-discipline).
> Branch: `feat/agent-intro-bubble`. Commit footer: `Plan: docs/plans/agent-intro-bubble.md`.

## Objective

A real user created a master resume, made a variant for a pasted job
description, got an ATS score of ~49, and **never noticed the AI agent
existed**. The trigger is a 56px mark in the bottom-right corner of the
editor, and nothing says it is there.

This plan adds a **speech bubble above the trigger** that introduces the
agent after the user has been on the resume for a while and has not
opened it. It also makes the free tier's allowance and the model
answering them visible.

## User-visible behavior

1. The user opens a **variant** (the chat only exists on variants).
2. Nothing happens for **45 seconds**. The editor is not interrupted —
   the user is reading their resume, and a bubble on top of it would be
   an intrusion.
3. A speech bubble appears above the agent's trigger:

   > **I'm Scout.**
   > Want to improve your ATS score? I can tell you exactly which
   > requirements this resume is missing — and fix them.

   For a **Free** user it carries one extra line: *"Your free plan
   includes 20 messages a day."*
4. The bubble can be dismissed — by its × button, by clicking outside, or
   with Escape. It never reappears for **7 days** after an explicit
   dismissal.
5. Opening the agent counts as using it: the bubble does not come back
   for **24 hours**.
6. The bubble is `no-print` — it never appears in a printed PDF.

Separately, inside the open chat panel there is now one small muted line
naming the model that is answering: *"Scout · Claude Haiku 5.5"* on Pro,
*"Scout · Beam"* on Free. And the Free badge reads its allowance from
`PLANS` rather than a hard-coded string, so it cannot drift from what
the server enforces.

## Scope (in)

- The bubble, its copy, its timing, and its dismissal rules.
- The geometry that keeps it off the Feedback pill.
- The Free allowance line on the bubble.
- The model name in the chat panel.

## Non-goals

- **A full onboarding tour.** One bubble, once. Not a multi-step flow.
- **Showing the bubble on the master resume.** The chat does not exist
  there.
- **Personalising the copy per resume or JD.** The copy says what the
  agent can do, which is true for every variant.
- **"How do I improve my score?" guidance on the scorecard.** That is
  the next piece of work, and it needs the real resume + JD + score
  snapshot to design against.
- **Changing when the bubble appears based on the score.** A user with a
  95 does not need help; a user with a 49 does. That is tempting and
  wrong for v1: it makes the bubble feel like a judgement, and the
  score is already visible on the page.

## Architecture

### Four pieces

| piece | file | job |
|---|---|---|
| rules | `lib/chat/agent-intro.ts` | copy, timings, the should-show predicate, localStorage |
| geometry | `lib/ui/floating-actions.ts` | where the bubble sits, and where the pill moves |
| view | `components/chat/agent-intro-bubble.tsx` | the bubble itself |
| wiring | `components/chat/chat-bubble.tsx` | mounts it, publishes the pill's offset |

### The rules (`lib/chat/agent-intro.ts`)

Pure and testable, no React:

```ts
shouldShowAgentIntro(state, now): boolean
```

- no state at all → show;
- dismissed within 7 days → don't;
- opened within 24 hours → don't;
- otherwise → show.

Storage is `localStorage` under `nexstepper:agent-intro`, matching the
undo-history and theme-provider pattern (and degrading to "show it
again" if storage is unavailable, which is the safe direction).

### The geometry — the interesting part

Three elements now compete for the bottom-right corner: the trigger
(24–80px), the **bubble**, and the Feedback pill. The pill is mounted by
the dashboard layout and the trigger by the editor page, so they cannot
know about each other in React — which is exactly why
`lib/ui/floating-actions.ts` exists and why the trigger **publishes** an
offset that the pill **reads**.

The bubble therefore uses that same mechanism rather than inventing a
second one:

- The bubble sits **directly above the trigger**, at
  `CHAT_TRIGGER_TOP_PX + FLOATING_STACK_GAP_PX` (96px), with a tail
  pointing down at the trigger. This is the placement that makes the
  association obvious: the thing talking is the thing under it.
- While the bubble is up, the trigger publishes a **larger** pill offset
  — `bubble bottom + bubble height + gap` — so the pill steps above the
  bubble instead of being covered by it.
- The bubble's height is **measured** (a `ResizeObserver` on the bubble
  element), not assumed. Copy changes, viewport changes and wrapping
  all change the height, and a hard-coded constant would put the pill
  back on top of the bubble the first time the copy wrapped to three
  lines.

The anti-overlap invariant is then arithmetic, and it is asserted in
`tests/unit/ui/floating-actions.test.ts` like every other offset in that
module: **the bubble's bottom edge is above the trigger's top edge, and
the pill's bottom edge is above the bubble's top edge.**

### The model name

`chatModelLabel(plan)` lives next to the model constants in
`lib/ai/providers.ts` — the one place a model swap happens — and returns
a user-facing name (`Claude Haiku 5.5`, `Beam`). The page is a Server
Component, so it resolves the label there and passes it down; the client
never imports the server-only model module.

## Files

### New

- `lib/chat/agent-intro.ts` — copy, timings, predicate, storage.
- `components/chat/agent-intro-bubble.tsx` — the bubble.
- `tests/unit/chat/agent-intro.test.ts` — the predicate and the copy.
- `tests/interaction/agent-intro-bubble.test.tsx` — it appears, it
  dismisses, it does not nag.

### Changed

- `lib/ui/floating-actions.ts` — the bubble's geometry.
- `components/chat/chat-bubble.tsx` — mount the bubble; publish the
  pill's offset from the bubble's measured height.
- `components/chat/chat-window.tsx` — the model line.
- `lib/ai/providers.ts` — `chatModelLabel(plan)`.
- `app/(dashboard)/dashboard/resumes/[id]/page.tsx` — pass the label.
- `tests/unit/ui/floating-actions.test.ts` — the new invariants.

## Risks

**1. The bubble covers the Feedback pill.** The exact bug the
floating-actions module was written to prevent, and the reason the
geometry lives there rather than in Tailwind classes.
*Mitigation:* the bubble measures its own height and the trigger
publishes the pill's new offset; the invariant is asserted in a test.

**2. It nags.** A bubble that reappears every visit is worse than no
bubble.
*Mitigation:* an explicit dismissal suppresses it for 7 days, and
opening the agent suppresses it for 24 hours. Both are in one predicate
that is unit-tested.

**3. It interrupts a user who is busy.** A bubble on top of a resume
someone is reading is an interruption.
*Mitigation:* it waits 45 seconds, it is dismissible, it never appears
while the agent is open, and it does not block anything.

**4. The copy makes a promise the agent cannot keep.** "I can tell you
exactly which requirements this resume is missing" has to be true.
*Mitigation:* the agent's `getAtsScore` tool returns the per-skill
miss list, so it can. But the promise is only about *telling*, not
*editing* — and the free chain's 3-in-5 edit rate means the editing
half is less certain, which is why the bubble leads with the diagnosis.

## Acceptance criteria

1. The bubble appears on a variant **45 seconds** after mount, and not
   before.
2. It does not appear if the agent was opened within 24 hours.
3. It does not appear for 7 days after an explicit dismissal.
4. It disappears when the agent is opened.
5. It disappears on Escape and on an outside click.
6. It is `no-print`.
7. It never overlaps the Feedback pill or the open panel.
8. Its copy names the agent using `AGENT_DISPLAY_NAME`, so a rename
   propagates.
9. A Free user's bubble mentions the 20-message allowance, read from
   `PLANS`.
10. The chat panel names the model that is answering.
11. `pnpm typecheck` clean, `pnpm test` green.

## Test plan

- `tests/unit/chat/agent-intro.test.ts` — the predicate: never seen,
  seen recently, dismissed recently, stale state, storage unavailable.
- `tests/unit/ui/floating-actions.test.ts` — the new geometry
  invariants.
- `tests/interaction/agent-intro-bubble.test.tsx` — real DOM: it
  appears after the delay, the × dismisses it, the agent opening
  dismisses it, and the allowance line is present for a Free user.

## Rollback plan

Revert the commit. The bubble is additive chrome; nothing else depends
on it. The `PLANS`-sourced badge and the model label are separate,
independently useful changes.

## Open questions

1. **45 seconds** is a judgement call. Too short and it interrupts a
   user who is still orienting; too long and they have already left.
   Worth revisiting with real usage.
2. **The model name in the panel.** Naming the model is a trust signal,
   but it is also a promise to keep up to date when the chain changes.
   It resolves from one function, so a swap is a one-line change — but
   it should be a deliberate one.
