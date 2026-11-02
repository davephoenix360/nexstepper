# The agent introduced itself — a speech bubble above the trigger

**Date:** 2026-11-02
**Surface:** the resume editor, on variants
**Trigger:** a real user never noticed the assistant existed

## Context

A user built a master resume, created a variant for a pasted job
description, got an ATS score of ~49 — and **never noticed the AI
assistant existed**. He did not know it was there.

That is not a bug. It is a discoverability failure, and it is the kind
that no error message ever reports. The agent's trigger is a 56px mark
in the bottom-right corner of the editor, it carries no label, and
nothing on the page says what it is. A user who never happens to hover
it has no reason to believe it is anything but decoration.

Separately, he could see the score and could see which requirements he
had — but no route from "49" to "here is what to do". That half is a
separate piece of work (it needs his actual resume, JD and score
snapshot to design against), and it is deliberately NOT in this change.

## What shipped

A speech bubble above the trigger, after **45 seconds**, saying:

> **I'm Scout.**
> Want to improve your ATS score? I can tell you exactly which
> requirements this resume is missing — and help you fix them.

A Free user also gets: *"Your free plan includes 20 messages a day."*
That line matters because the "Free · 20/day" badge only appears once
the chat panel is OPEN — which is exactly the user who never knew the
assistant was there.

The chat panel also now names the model answering ("Scout · Claude
Haiku 5.5" on Pro, "Scout · Beam" on Free).

## The two decisions worth arguing about

### 1. When does it show?

A bubble that nags is worse than no bubble. So the decision is a pure
predicate with the windows named:

| state | show? |
|---|---|
| never seen | **yes** |
| opened in the last 24 hours | no |
| dismissed in the last 7 days | no |
| otherwise | **yes** |

It lives in `lib/chat/agent-intro.ts` as `shouldShowAgentIntro`, with
the storage helpers beside it, because "should it show?" is the part
that is easy to get wrong and the part worth testing.

**45 seconds** is a judgement call. Too short and it interrupts someone
who has only just arrived; too long and they have already left. It is
a named constant, so changing it is one line.

### 2. Where does it sit — and what does it push out of the way?

The bubble goes **directly above the trigger**, with a tail pointing
down at it. That is the placement that makes the association obvious:
the thing talking is the thing under it.

But the space directly above the trigger is exactly where the floating
**Feedback pill** lives. That is not a coincidence — it is the overlap
this codebase already fought once and solved with
`lib/ui/floating-actions.ts`. The pill is mounted by the dashboard
layout; the trigger by the editor page. They cannot know about each
other in React, so the trigger **publishes** an offset and the pill
**reads** it.

So the bubble rides that mechanism rather than inventing a second one:
while the bubble is up, the trigger publishes a LARGER offset and the
pill steps above the bubble. No new coupling, one source of truth.

**The bubble's height is measured, not assumed.** A `ResizeObserver`
reports it, because the copy wraps differently at different widths and
a hard-coded constant would put the pill back on top of the bubble the
first time the text wrapped to three lines. The measurement also feeds
the offset back to the pill the moment the bubble comes down, so the
pill never gets stranded above the trigger for good.

The invariants are arithmetic, and they are asserted in
`tests/unit/ui/floating-actions.test.ts` like every other offset in that
module: **the bubble's bottom edge is above the trigger's top edge, and
the pill's bottom edge is above the bubble's top edge.**

## What this does not do

- **It does not personalise by score.** A user with a 95 does not need
  help; a user with a 49 does. That is tempting and wrong for v1: it
  makes the bubble feel like a judgement, and the score is already
  visible on the page.
- **It does not promise to edit.** The agent's diagnosis is reliable;
  its edit rate is not the same on every model (the free chain edits in
  3 of 5 attempts). So the copy leads with what it can always do.
- **It is not a tour.** One bubble, once.
- **It does not appear on the master resume.** The chat does not exist
  there.

## The guard

- `tests/unit/chat/agent-intro.test.ts` — the predicate (never seen,
  seen recently, dismissed recently, stale state, both timestamps) and
  the copy, including that the headline names the agent from
  `AGENT_DISPLAY_NAME` rather than from a literal — a rename must not
  leave a speech bubble talking about the old agent.
- `tests/unit/ui/floating-actions.test.ts` — the geometry invariants.
- `tests/interaction/agent-intro-bubble.test.tsx` — 15 DOM tests with
  the fake clock: it does not appear early, it appears after the delay,
  it stays quiet after a use or a dismissal, the × dismisses it, Escape
  dismisses it, an outside click dismisses it, it hides when the agent
  opens, the invitation fires, it reports a height of 0 when it is down,
  and it is `no-print`.

## The lesson

**A feature nobody can find is not a feature.** The assistant was
built, paid for, and good — and a user scored 49 without ever seeing
it. Nothing in the product was broken. The product was just quiet.

The generalisable version: *the absence of a complaint is not the
absence of a problem.* A user who never opens the assistant produces no
error, no support ticket, and no signal — they just quietly do the
thing the tool was supposed to help with, without the tool.

The second half of this drift memo is the other lesson: **the free
tier's advertised 20/day was a lie**, because a turn on the Pro chain
costs ~20.8K tokens against a 300K daily cap — so a Free user was
rejected at ~14 messages while the badge said 20. Routing free users to
their own $0 chain (13.0K/turn, most of the prompt cached) fixed it.
That is in `docs/drift/2026-11-01-chat-chain-tool-call-reliability.md`.
