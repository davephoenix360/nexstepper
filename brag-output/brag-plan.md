# Brag Plan: Nexstepper

## What is this app?

Nexstepper is an AI resume builder: you keep one master resume, paste a job
posting, and it parses that posting into structured requirements, scores your
resume against the posting's own ATS rubric, and puts an agent named **Scout**
in the room to tell you which requirements you're missing and to fix the ones
your resume already proves.

## The angle

**Every other resume tool gives you a score. This one tells you what the score
is hiding — and refuses to lie about the rest.**

A score is the easy part. The hard part is the sentence underneath it:
*"These requirements from the JD are not evidenced in your resume: event-driven
architectures, Kafka, OpenTelemetry."* That is the product's own copy, and it
is the thing competitors do not do. So the video is not "look, our score went
up" — it is "here is exactly what you're missing, here is the one of those you
already had but never called it, and here is the two you genuinely don't have,
which we are not going to pretend you do."

The honesty is the brag. The score only moves by what is true.

## Hook (first 2-3 seconds)

The ATS scorecard assembles on a clean light ground and lands on **75** with a
**Good** badge — the verdict every resume tool gives you. The seven dimension
bars sweep in behind it. It looks like a win.

Then the beat breaks it: *"Good enough to send."*

## Key moments (the middle)

- **The miss list.** Under the scorecard, the product's own tip resolves into
  three rose chips — **event-driven architectures**, **Kafka**,
  **OpenTelemetry** — and the honest count: *(top 3 of 6)*.
- **Scout.** The chat panel opens on the right. Scout reads the posting the
  way a recruiter does and says the thing no generator says: *"Nothing on the
  resume shows those, so I left them out."*
- **The one it can fix.** Scout's rewrite surfaces the word the posting used:
  the resume line reads *"Built the **event-driven** transcription pipeline"*
  — because that pipeline already was event-driven; the resume just never used
  the posting's word for it. **event-driven architectures** lifts out of the
  miss list, the count goes *(top 3 of 6)* → *(top 3 of 5)*, Keywords goes
  **68 → 72**, and the score goes **75 → 76**.

## Outro / punchline

The two chips that are genuinely absent stay on screen — **Kafka**,
**OpenTelemetry**, **Prometheus** — in the same rose as before. Nothing was
invented to make the number look better.

**Nothing invented.**

Wordmark, then `nexstepper.com`.

## User flow worth showing

The variant editor's scorecard is the centrepiece, because the product's loop
lives there: a real variant resume (Jordan Ellis — Cartwheel (Backend
Platform)) scored against a real posting, the missing requirements surfaced on
the scorecard, Scout acting on them, and the scorecard recomputed.

- **Entry → key action → result:** scorecard (75, Good, 7 bars) → the miss
  list resolves → Scout types → the resume line changes → the chip leaves the
  list → **76**, Keywords **72**.

## Tone

- Preset: **polished**
- Creative direction: *the product's own light UI, filmed honestly.* Confidence
  through restraint — long holds, no glitter, no inflated number.
- Interpretation: fewer scenes (4), longer holds, the motion is the product's
  UI doing its job rather than effects performing at it. The only flourish is
  the one the product earns: the chip lifting out of the list.

## Format: landscape — 1920x1080
## Duration: ~21.5 seconds

## Visual identity (from the project)

Taken from `app/globals.css` and the Tailwind tier palette in
`components/scorecard/dimension-bar.tsx` — no design spec exists in the repo.

- Background: `#F4F4F5` (app `--muted`)
- Card surface: `#FFFFFF` (app `--background` / `--card`)
- Text: `#09090B` (app `--foreground`)
- Muted text: `#757578` (app `--muted-foreground`)
- Accent: `#6366F1` (app `--primary`, `hsl(238 84% 67%)`)
- Border: `#E4E4E7` (app `--border`)
- Missing / destructive: `#EF4444` (app `--destructive`)
- Tier bars: `#84CC16` lime-500 (Good, 65–79), `#10B981` emerald-500 (Strong,
  ≥80), `#F59E0B` amber-500 (Partial, 50–64) — `TIER_BAR_BG` in the scorecard
- Tier badge: `#ECFCCB` bg / `#365314` text / `#D9F99D` border — `TIER_BADGE`
- Display font: **Manrope** (the app's only family, `app/layout.tsx`), shipped
  locally as `assets/fonts/manrope-latin.woff2` + `-latin-ext.woff2`
- Body font: Manrope 400–500; values in the mono style of the real
  `DimensionBar` (`font-mono tabular-nums`)
- Strongest visual element: the ATS scorecard itself — the 5-tier badge, the
  seven dimension bars with their tier-coloured fills, and the per-skill miss
  list

## Share copy (draft)

Your resume scores 75. Good enough to send — not good enough to get the
interview. Nexstepper tells you exactly which requirements you're missing, fixes
the ones your resume already proves, and leaves the rest alone. Nothing
invented.

## Audio direction

- Role: sparse professional accents under a warm bed. The music is a floor, not
  a driver.
- Music: `happy-beats-business-moves-vol-10-by-ende-dot-app.mp3` is the wrong
  shape (its strong cues all land after 15s); **`happy-beats-business-moves-vol-11-by-ende-dot-app.mp3`**
  (87.6s, 114.84 BPM) is the pick — strong cues at **1.60s, 3.70s, 5.80s,
  8.96s, 12.65s, 17.91s, 22.65s**, spread across the whole window, with a beat
  every 0.52s for the sequential bar fills.
- Music treatment: starts at 0.34 under the narration (the narration is the
  foreground), ducks to 0.12 across each VO line and returns between them;
  fades out under the final wordmark.
- Music cue guidance: bundled preset read —
  `assets/music/cues/happy-beats-business-moves-vol-11-by-ende-dot-app.music-cues.md`.
  Strong-cue locks: **5.80s** (the score landing on 75) and **12.65s** (Scout's
  panel arriving). Beat grid for the seven bar fills.
- Audio-reactive treatment: **none** — the palette is a working app, and a
  pulsing UI would read as fake. The music is there to carry the cuts, not the
  pixels.
- SFX posture: sparse and motion-matched. A soft click per dimension bar
  arrival (seven, on the beat grid, low volume), a soft key-tick under Scout's
  typed line, one low impact on the chip lifting out, and a single chime on
  the final line. No whooshes, no risers, no glitz.
- Audio-coupled moments: the 75 counting up (a soft tick per ten), the seven
  bars filling on the beat grid, the chip lifting out of the miss list (the
  impact lands with it), Scout's typed line (key ticks).
- Restraint rule: the music must never rise above the narration, and no SFX
  may land on a beat that carries a word the viewer is reading.

## Voiceover script

Narration is on (`af_heart`, en-US female — warm, unhurried, matching Scout's
register). Lines are generated as separate clips so each can be placed exactly.

| # | Line | Start | Notes |
|---|---|---|---|
| V1 | "Your resume scores seventy-five." | 0.60s | |
| V2 | "Good enough to send." | 3.60s | |
| V3 | "Not good enough to get the interview." | 6.10s | |
| V4 | "Scout tells you exactly which requirements you're missing." | 12.10s | grounded in the product's own intro-bubble copy |
| V5 | "It fixes what you can prove." | 15.90s | |
| V6 | "Nothing invented." | 18.60s | |

## Storyboard

### Scene 1 — A good score — 5.6s

Light `#F4F4F5` ground. A white scorecard card arrives from 4% large and
settles (0.55s, `power4.out`) — the app's own surface, 1px `#E4E4E7` border,
soft shadow, 16px radius.

Inside, top-left in muted 22px: **Jordan Ellis — Cartwheel (Backend Platform)**
(the real seeded variant name). Below it the headline number **75** counts up
from 0 in 0.7s at 140px, weight 800, with `/100` beside it in muted. The
**Good** tier badge (lime-100 bg / lime-800 text / lime-200 border) fades in
beside it.

The seven dimension rows are present from the start as real UI — label left,
thin tier-coloured track, tabular-nums value right — and the **fills** sweep in
one by one on the beat grid from 2.15s. Their values are the measured ones:
Keywords **68**, Format **82**, Impact **74**, Experience match **69**, Intent
coverage **90**, Role fit **50**, Seniority fit **100**. Bar colours are the
real tier colours: lime-500 for 68/74/69, emerald-500 for 82/90/100, amber-500
for 50.

Sequential/interaction: **yes** — seven bars fill one by one, each on a beat
(0.52s apart), each with a soft click.

Audio intent: the bed establishes; the score landing gets one low swell.

Audio-coupled idea: counter ticks with the count-up; clicks on each bar fill.

Music: vol-11 from 0, ducked under narration.

Transition mood: clean → Scene 2.

### Scene 2 — Not evidenced — 5.8s

Same ground, same card. Beneath the bars, the scorecard's per-skill miss list
resolves in — a white panel with a hairline border. Its line is the product's
own tip copy, verbatim:

> These requirements from the JD are not evidenced in your resume:

Then three rose chips (`#EF4444` on a rose-50 tint, 1px rose-200 border) arrive
one at a time: **event-driven architectures**, **Kafka**, **OpenTelemetry** —
and under them the honest count **(top 3 of 6)**.

The score stays at 75. Nothing about this scene is decoration; it is the
product's own output.

Sequential/interaction: **yes** — three chips arrive one by one, 0.65s apart,
each with a soft tick.

Audio intent: the bed thins; this is the turn in the sentence.

Audio-coupled idea: one tick per chip.

Transition mood: soft → Scene 3.

### Scene 3 — Scout — 6.2s

The card **widens** from 1000px to 1600px (0.45s, `power3.out`) — one
container morphing to make room for the second surface. The scorecard keeps the
left column; a chat panel slides into the right column.

The chat panel is Scout's: the real agent mark
(`public/brand/agent/nexstepper-agent-mark.svg`), the name **Scout**, and a
message bubble that types out, character by character, Scout's real line from
the live product:

> Nothing on the resume shows those, so I left them out.

Below the bubble, a card shows the line Scout rewrote — from Jordan's own
bullet, with the word the posting needed highlighted:

> Built the **event-driven** transcription pipeline

Then the payoff, on the left: the **event-driven architectures** chip lifts
out of the miss list and the count changes **(top 3 of 6)** → **(top 3 of 5)**.
The Keywords bar grows **68 → 72** and the headline number ticks **75 → 76**.
The tier badge stays **Good**.

Sequential/interaction: **yes** — Scout types, the chip lifts, the bar grows,
the number ticks.

Audio intent: the bed returns; one low impact on the chip lifting.

Audio-coupled idea: key ticks under the typed line; the impact lands with the
chip's lift.

Transition mood: clean → Scene 4.

### Scene 4 — Nothing invented — 4.0s

The card dims and recedes (scale 0.97, opacity 0.35, 0.4s). The three chips
that remain — **Kafka**, **OpenTelemetry**, **Prometheus** — are the last
thing visible on it, still rose, still unanswered. That is deliberate: they
are the honest ones.

Then the final line lands, large and still, centred:

**Nothing invented.**

Below it the wordmark (`public/brand/nexstepper-horizontal-clean.png`) and
`nexstepper.com`.

Sequential/interaction: **yes** — the card recedes, the line lands, the
wordmark fades up.

Audio intent: the bed thins to nothing under the wordmark; one chime on the
final line.

Audio-coupled idea: the chime lands with the line; the music fades out under
the wordmark.

Transition mood: soft → end.

**Music mood for this video:** upbeat but restrained — a professional floor.
**Audio summary:** a steady 114.84 BPM bed carries the cuts and the seven bar
fills; the narration sits on top of it; the bed ducks to 0.12 across every
line and thins to silence under the wordmark.

---

## Grounding — every on-screen claim, and where it came from

| On screen | Source |
|---|---|
| `75` → `76` | measured with the shipped engine (`scoreResumeHybridFromEnvelope`) against the real seeded Cartwheel fixture; `scripts/seed-demo.ts` prints "renders 75 from the persisted snapshot" |
| `Good` tier badge | `tierLabelFor()` in `components/scorecard/dimension-bar.tsx` (65–79 = Good) |
| Keywords 68, Format 82, Impact 74, Experience match 69, Intent coverage 90, Role fit 50, Seniority fit 100 | the seeded snapshot's dimension scores, rendered as `Math.round` does |
| "These requirements from the JD are not evidenced in your resume:" | `buildDynamicTips` — `ATS Keyword Match`, verbatim from the real output |
| event-driven architectures, Kafka, OpenTelemetry / (top 3 of 6) | same tip, pristine fixture |
| Kafka, OpenTelemetry, Prometheus / (top 3 of 5) | same tip after the one edit |
| "Nothing on the resume shows those, so I left them out." | Scout's real reply, captured from `/api/chat` against the live app |
| "Jordan Ellis — Cartwheel (Backend Platform)" | the seeded variant's real name |
| "Built the asynchronous transcription pipeline (FFmpeg + Whisper + custom diarization)…" | the seeded resume's real bullet |
| Scout | `AGENT_DISPLAY_NAME` in `lib/brand/agent-mark.ts`; the mark SVG is `public/brand/agent/nexstepper-agent-mark.svg` |
| "Nothing invented." | the demo video's own promise line, `docs/plans/demo-video.md` |
| Manrope | `app/layout.tsx` |
| Colours, tier bar/badge colours | `app/globals.css`, `TIER_BAR_BG` / `TIER_BADGE` |

**Not claimed anywhere:** no "10x", no "beat X%", no invented metric, no
"higher score" that the engine did not produce. The score moves **one point**
because that is all the truth is worth — and the video says so.

**Known engine limitation (deliberately not shown):** Role Fit is pinned at
the neutral 50 for every resume, because `lib/scoring-async/score-hybrid.ts`
passes `{ roleFitSimilarity: null }` into the sync engine and the async
`roleFitSimilarity()` helper is never called from the scorer. The scorecard
renders it faithfully, but no line in this video claims it is a gap or a fix.

---

## What actually shipped

- **Composition:** `brag-output/composition/` — `index.html` (root, audio
  tracks) + `compositions/app.html` (the app) + `compositions/outro.html`.
- **Render:** `brag-output/brag.mp4` — 1920x1080, 30 fps, 648 frames, 21.6 s,
  H.264 + AAC stereo, poster baked into frame 0.
- **Loudness:** −14.3 LUFS integrated, true peak −1.3 dB (two-pass
  `loudnorm`, social target). The music ducks to 0.12 under every narration
  line; measured, the narration sits ~5 dB above the bed.
- **Poster:** `brag-output/brag.jpg` — frame at 17.2 s, the payoff.
- **Copy:** `brag-output/share-copy.txt`.
- `hyperframes check` passes: 0 errors, 87/87 WCAG AA contrast checks, motion
  and audio clean. One advisory warning remains — `app.html` is a long file
  and would split further along the scene seam.

**The edit card shows the line Scout rewrote, not a before/after diff.** The
first composition swapped the word in place; a fixed-width slot left a visible
gap after the narrower word, and the "before" was never more legible than the
chip leaving the list already was. The shipped version states the line once,
with the changed word highlighted, and lets the miss list carry the change.
