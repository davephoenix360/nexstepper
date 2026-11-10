# Drift: the 21-second launch video, and a dimension that cannot move

**Date:** 2026-11-10
**Author:** Mavis (autonomous run, user-approved)
**Status:** shipped locally — not pushed

## What happened

The `/brag` skill was installed (project-local, `.agents/skills/brag`) and
run against the Nexstepper product to produce a short launch video. Output:

```
brag-output/
  brag.mp4             1920x1080, 30fps, 648 frames, 21.6s, H.264 + AAC
  brag.jpg             poster (frame at 17.2s, the payoff), baked into frame 0
  brag-plan.md         the creative north star + grounding table
  composition-brief.md the Hyperframes handoff brief
  share-copy.txt       the caption
  composition/         the Hyperframes project (index + 2 sub-compositions)
```

Rendered with Hyperframes 0.9.28 on `hyperframes render --quality delivery`.
`hyperframes check` passes: 0 errors, 87/87 WCAG AA contrast checks.

## The measurement, and why the video says what it says

The video's whole claim is a **number moving**, so the number had to be
measured rather than predicted. It was, against the real seeded demo fixture
and the real scorer:

| | before | after |
|---|---|---|
| Overall | **75** | **76** |
| Keywords | **68** | **72** |
| Format | 82 | 82 |
| Impact | 74 | 74 |
| Experience match | 69 | 69 |
| Intent coverage | 90 | 90 |
| Role fit | 50 | 50 |
| Seniority fit | 100 | 100 |
| Tier | Good | Good |
| ATS Keyword Match tip | *…not evidenced in your resume: **event-driven architectures**, Kafka, OpenTelemetry (top 3 of 6).* | *…not evidenced in your resume: Kafka, OpenTelemetry, Prometheus (top 3 of 5).* |

The one edit: the resume bullet reads *"Built the asynchronous transcription
pipeline (FFmpeg + Whisper + custom diarization)…"*. Changing **asynchronous**
to **event-driven** — which is what the posting asked for, and what the
pipeline already was — surfaces one genuinely-evidenced requirement and moves
the score by exactly one point.

**The score moves one point, and that is the point.** Every other number in
the film is the product's own output: the score, the tier badge, the seven
dimension labels, the miss list, the tip copy, and Scout's line *"Nothing on
the resume shows those, so I left them out."* — captured verbatim from a live
`/api/chat` turn against the running app.

Measured how: `scripts/seed-demo.ts` seeds the Cartwheel variant and prints
its score; the recompute path is the one the "Recompute" button runs
(`scoreResumeHybridFromEnvelope` → `recordScoreSnapshot`). The dev fixture was
**restored to its pristine 75 baseline afterwards** (`pnpm seed:demo:reset`),
because an applied edit would destroy the "before" state that
`docs/plans/demo-video.md` Beat 1 opens on.

## The finding: Role fit is pinned at 50 for every resume

While measuring, one thing refused to move.

**Role fit is not a measurement. It is a constant.** It renders 50 for every
resume, always, because the async title-similarity helper is never called:

- `lib/scoring-async/score-hybrid.ts:97` — the enhanced scorer calls
  `scoreResumeFromEnvelope(..., { roleFitSimilarity: null }, ...)`.
- `lib/scoring/score.ts:584` — the engine reads `precomputed.roleFitSimilarity`.
- `lib/scoring/dimensions/role-fit.ts:45-50` — a null similarity returns
  `NEUTRAL_ROLE_FIT_SCORE` (50) with `fallback: true`.
- `lib/scoring-async/role-fit.ts:64` — `roleFitSimilarity()` exists and works,
  but **no production caller invokes it**. The only callers are tests.

Confirmed empirically: the dimension stayed at 50 across four experiments —
the pristine fixture, a relabelled headline (*Senior Backend Engineer*), a
reframed job title, and both together. It never budged, while every other
dimension responded. The two seeded variants both render Role fit 50 — and
Seniority fit, which *is* computed, renders 100 and 50 respectively. That
asymmetry is the signature of a fallback, not a measurement.

**Why this matters here:** `docs/plans/demo-video.md` Beat 6 treats Role fit
as the bar that "moves off 50" — the payoff of the 2:16 master. On the current
engine it cannot, and no edit to the resume changes that. The number on
screen would be 50 regardless of what the video implies.

**What the brag video does about it:** nothing, deliberately. It renders Role
fit faithfully at 50 — the app really does show that — but no caption, VO line
or graphic in the film treats it as a gap or a fix. The film's payoff is the
miss list and the Keywords bar, both of which move for real.

**Recommended follow-up (not done here — it is a product decision, not a
video decision):** either call `roleFitSimilarity()` from the hybrid scorer so
the dimension means what the UI says it means, or change the dimension's
label so it does not promise a measurement it is not making. The first is
one awaited call in `score-hybrid.ts`; the second is a copy change. Leaving it
as-is is a third, defensible option — but then the 2:16 plan's Beat 6 has to
change too.

> **UPDATE — 2026-11-10, later the same day.** The first option was taken:
> `roleFitSimilarity()` is now called from the hybrid scorer, so Role Fit is
> a real measurement rather than a constant 50. See
> `docs/drift/2026-11-10-one-score-three-surfaces-and-role-fit.md`.
>
> **Consequence for this memo:** the "Role fit is pinned at 50" finding below
> is **fixed**, and the demo video's Beat 6 ("Role fit moves off 50") is
> filmable as written again. The measured table above is still accurate for
> the state of the engine **at filming time** — it was measured before the
> fix, and the film renders the app faithfully. A re-record would show a
> different Role fit number, and the "never budged" claim below describes
> the engine as it was, not as it is.

## Also worth knowing

- **The dev server moved to port 3002.** Another project on this machine
  (`whotshop-marketplace`) already holds port 3000. `Better Auth`'s
  `trustedOrigins` only lists `http://localhost:3000`, so requests to 3002
  must present `Origin: http://localhost:3000` to authenticate. Worth
  knowing before anyone concludes the auth routes 404.
- **`hyperframes check` flags `<style>` outside `<template>`** in
  sub-composition files, and the styles then never apply — the symptom is
  text rendering at browser-default sizes and a "text below floor" warning,
  not an error. Move the style block inside the template.
- **A throwing `onUpdate` callback silently kills the rest of a GSAP
  timeline.** A malformed selector (`'#' + '#v-keywords'`) threw inside the
  tick, and every tween after it stopped applying while the ones before it
  looked fine. The snapshot was the only thing that caught it — `check`
  reported 0 errors. Snapshot key frames and actually look at them.

## Files

- `brag-output/brag-plan.md` — the plan, the grounding table and the
  storyboard, beside the render it produced.
- `brag-output/composition-brief.md` — the Hyperframes handoff brief.
- `docs/plans/demo-video.md` — the 2:16 master, unchanged. Its Beat 6 needs
  the Role fit decision above before it is filmable as written.
