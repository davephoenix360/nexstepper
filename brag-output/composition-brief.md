# Hyperframes Composition Brief: Nexstepper

## Objective

Create a short launch-style brag video for **Nexstepper**, an AI resume
builder. The video's claim is not "our score went up" — it is **"this tells
you what you're missing, and it won't lie to make the number look better."**

## Output

- Composition directory: `brag-output/composition/`
- Rendered video: `brag-output/brag.mp4`
- Format: landscape — 1920x1080
- Duration: ~21.5 seconds

## Source Material

- Project root: `C:\Users\DiepreyeCD\Documents\nextep-saas`
- Primary files read:
  - `app/globals.css` (palette), `app/layout.tsx` (Manrope)
  - `components/scorecard/scorecard.tsx`, `components/scorecard/dimension-bar.tsx`
    (7 dimensions, tier badge, tier bar colours)
  - `components/scorecard/radar.tsx` (dimension label mapping)
  - `lib/scoring/score.ts`, `lib/scoring/dimensions/role-fit.ts` (tier bands)
  - `lib/scoring/tips.ts` (the ATS Keyword Match tip copy)
  - `lib/brand/agent-mark.ts` (Scout's name and mark)
  - `scripts/demo-fixtures.ts` (the seeded resume, the posting, the resume lines)
  - `scripts/seed-demo.ts` (the measured scores)
  - `public/brand/nexstepper-horizontal-clean.png`,
    `public/brand/agent/nexstepper-agent-mark.svg`
- Product name: **Nexstepper**
- Tagline / strongest claim: *"Tailored, ATS-scored resumes for every job you
  apply to."* (landing H1, `components/marketing/hero.tsx`)
- Key UI or visual moment to recreate: **the ATS scorecard panel** — headline
  score, 5-tier badge, seven dimension bars with tier-coloured fills, and the
  per-skill miss list under them.
- Copy that must appear verbatim:
  - `Jordan Ellis — Cartwheel (Backend Platform)`
  - `Good`
  - `Keywords` / `Format` / `Impact` / `Experience match` / `Intent coverage` / `Role fit` / `Seniority fit`
  - `These requirements from the JD are not evidenced in your resume:`
  - `event-driven architectures` / `Kafka` / `OpenTelemetry` / `Prometheus`
  - `(top 3 of 6)` → `(top 3 of 5)`
  - `Nothing on the resume shows those, so I left them out.`
  - `Built the asynchronous transcription pipeline (FFmpeg + Whisper + custom diarization) that the team still ships today.`
  - `Nothing invented.`
  - `nexstepper.com`

## Creative Direction

- Tone preset: **polished**
- Creative direction: *the product's own light UI, filmed honestly.* One
  surface, real copy, real numbers, long holds.
- Interpretation: 4 scenes, fewer moves, the motion is the UI acting. The only
  flourish is the chip lifting out of the miss list — the one moment the
  product earns. Nothing pulses, nothing glows, nothing bounces.
- Angle: every other resume tool gives you a score; this one tells you what
  the score is hiding and refuses to fake the rest.
- Hook: the scorecard assembles and lands on **75** with a **Good** badge —
  the verdict every tool gives you — then *"Good enough to send."*
- Outro / punchline: the still-unanswered chips stay rose on the dimmed card,
  then **Nothing invented.**, wordmark, `nexstepper.com`.
- Avoid:
  - Generic SaaS language ("supercharge", "10x", "game-changing")
  - Abstract filler visuals (mesh gradients, floating particles, glass cards)
  - Unrelated visual redesign — the palette, type and card are the product's
  - Any number the product did not actually produce

## Visual Identity

- Background: `#F4F4F5`
- Text: `#09090B`
- Accent: `#6366F1`
- Surface / card: `#FFFFFF`, border `#E4E4E7`, muted text `#757578`
- Destructive (missing requirements): `#EF4444`
- Tier colours (from `TIER_BAR_BG` / `TIER_BADGE`): lime `#84CC16`, emerald
  `#10B981`, amber `#F59E0B`; badge `Good` = bg `#ECFCCB`, text `#365314`,
  border `#D9F99D`
- Display font: **Manrope** — not a Hyperframes bundled family, so ship it:
  `assets/fonts/manrope-latin.woff2` and `assets/fonts/manrope-latin-ext.woff2`
  with an `@font-face` in the file that uses them. Weights 400–800.
- Body font: Manrope 400/500; the numeric values use the app's mono treatment
  (`font-mono tabular-nums`) — use the bundled JetBrains Mono for those.
- Visual references from the project: the scorecard panel, the 5-tier badge,
  the dimension bars, the agent mark.

## Storyboard

Use `brag-output/brag-plan.md` as the creative contract. Scene summary:

1. **A good score** — 5.6s — the scorecard card settles, **75** counts up, the
   **Good** badge lands, seven dimension bars fill one by one on the beat grid
   (Keywords 68, Format 82, Impact 74, Experience match 69, Intent coverage
   90, Role fit 50, Seniority fit 100).
2. **Not evidenced** — 5.8s — the miss list resolves under the bars: the
   product's tip sentence, three rose chips, `(top 3 of 6)`.
3. **Scout** — 6.2s — the card widens, Scout's chat panel slides in on the
   right, his real line types out, the resume line changes *asynchronous* →
   *event-driven*, the chip lifts out of the list, `(top 3 of 5)`, Keywords
   **68 → 72**, score **75 → 76**.
4. **Nothing invented** — 4.0s — the card dims with the unanswered chips still
   rose; **Nothing invented.** lands; wordmark and `nexstepper.com`.

## Audio

- Audio role: sparse professional accents under a warm bed.
- Audio arc: bed establishes → thins under the miss list → returns with Scout
  → thins to silence under the wordmark. Narration is always the foreground.
- Music: `happy-beats-business-moves-vol-11-by-ende-dot-app.mp3`
  (87.6s, 114.84 BPM, beat every 0.5224s)
- Music treatment: `data-volume="0.34"`, ducked to 0.12 across each narration
  line via a `data-automation` volume lane, `data-fade-out="1.6"` at the end.
- Music cue guidance: bundled preset read —
  `assets/music/cues/happy-beats-business-moves-vol-11-by-ende-dot-app.music-cues.md`.
  Strong cues: **5.80s** (the score landing on 75) and **12.65s** (Scout's
  panel arriving). Beat grid for the seven bar fills — beats at 2.15, 2.67,
  3.19, 3.72, 4.24, 4.76, 5.28s.
- Audio-reactive treatment: **none** — a working app surface should not pulse.
- Audio-coupled moments:
  - Scene 1 — the 75 counting up (soft ticks), seven bars filling on the
    beat grid (one soft click each)
  - Scene 2 — one tick per missing-requirement chip
  - Scene 3 — key ticks under Scout's typed line, one low impact on the chip
    lifting out
  - Scene 4 — one chime on the final line
- SFX selection guidance: use low high-frequency-risk sounds for the
  repeated bar clicks (`click-soft` over `click`); a `key-press` under the
  typed line; `impact-bass-1` for the chip lift; `chime` for the final line.
  No whooshes, no risers, no glitz.
- SFX analysis guidance: `<skill-dir>/assets/sfx/sfx-analysis.md`
- Exact SFX choice: Hyperframes picks filenames, timestamps, density and
  volume against the implemented animation.
- Audio files: copy the music and the chosen SFX into
  `brag-output/composition/assets/`.

## Hyperframes Instructions

Follow the current Hyperframes composition contract (`data-*` timing,
`references/format.md`; motion and eases in `references/motion.md`; the look
in `references/look.md`). The brag plan and this brief replace `SPEC.md` and
the storyline step — do not write a `SPEC.md` and do not propose a storyline.
`check` is the only gate.

LOOK: light neutral ground `#F4F4F5`; white app surfaces `#FFFFFF` with 1px
`#E4E4E7` hairlines and a soft `0 24px 48px rgba(9,9,11,.06)` shadow, 16px
radius; ink `#09090B`; one indigo accent `#6366F1`; rose `#EF4444` used only
for the genuinely-missing requirements; tier colours lime/emerald/amber exactly
as the scorecard renders them; Manrope 200–800 as the single family. Scale the
UI up for video — the scorecard renders larger than life so the numbers read
on a phone. BANNED: dark-mode neon, gradient meshes, glassmorphism, the
purple-blue SaaS glow, emoji, stock 3D, pill-everything, and any pulsing or
breathing UI.

Requirements:
- Show at least one real UI, copy, or visual element from the source project —
  the ATS scorecard, its seven labelled bars, the tier badge and the miss list.
- Keep all text readable in the final render.
- Keep the video within 15-25 seconds.
- Include the planned music/SFX layer.
- Treat the audio notes as guidance, not a cue sheet.
- Use `fromTo` (not `from`) inside every scene; the host re-seeks scenes.
- Give the host, the scene root and the timeline key the same id.
- Keep ids unique across the assembled page.
- Run `hyperframes check` before render and fix every error it reports,
  including WCAG contrast failures.
- Keep creation and rendering local.

## Voiceover

Enabled. `af_heart`. Generate each line as its own WAV so it can be placed
exactly, then wire each onto its own audio track.

| Line | Start |
|---|---|
| "Your resume scores seventy-five." | 0.60s |
| "Good enough to send." | 3.60s |
| "Not good enough to get the interview." | 6.10s |
| "Scout tells you exactly which requirements you're missing." | 12.10s |
| "It fixes what you can prove." | 15.90s |
| "Nothing invented." | 18.60s |

Adjust the starts after measuring the generated WAV durations, so each line
lands on its scene and the music ducking lane can be computed from the real
durations.
