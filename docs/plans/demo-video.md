# Demo Video — Plan

## Objective

Give Nexstepper a product video that sells the thing competitors don't sell:
**the resume gets fixed, not just scored.** Jobscan, Teal, Huntr and
Resume Worded all end their demo on a number. Ours ends on a resume that
changed and a score that moved because of it. The video's job is to make a
stranger believe, in under two minutes, that this product understands the
difference between "here is your score" and "here is what to do about it."

The video is a marketing asset, not a feature tour. It is the thing a visitor
plays instead of reading the landing page, and the thing a candidate sends to a
friend.

## The one promise

> **It reads the posting the way a recruiter would, tells you exactly what's
> missing, and fixes it with you.**

Every beat either sets this up or pays it off. Anything that doesn't serve it
is cut — including features we're proud of.

**The narrator is Scout.** Not a founder, not a voice actor, not "the
application." The same voice rules that govern the agent
(`docs/brand/agent-brief.md` §6) govern the voiceover, so the video and the
product speak with one mouth: first person, active, short sentences, no
preamble, no exclamation marks, no emoji, lead with the finding, show the
number, warm but not cute.

## User-visible behavior

A visitor lands on `nextepper.com`, sees a poster frame with a play button,
presses play, and within 8 seconds understands what the product is and what
makes it different. Within 75 seconds they have watched a resume get worse
before it got better, and a score move as a result. At 2:15 they know what to
do next.

## Scope (in)

- One **master cut**, 1920×1080, target **2:00–2:30**.
- One **hero cut** (0:55–1:00) derived from the master for the landing page.
- One **vertical cut** (9:16, 0:30–0:35) for LinkedIn / Instagram / TikTok / X.
- One **micro-loop GIF** (3–4s) of the score moving, for the landing page.
- A full **voiceover script** with timings (below), ready to record.
- A **seed script** that builds a deterministic demo account so the shoot is
  repeatable.

## Non-goals (out of this plan)

- **A feature tour.** No "here's our seven-axis radar chart, and here's our
  three-step flow, and here's the pricing page." The radar appears for 2
  seconds inside the payoff beat and is never named.
- **The sign-up flow.** It opens on a Cloudflare Turnstile widget. Captcha in
  a demo video is a punchline, not a selling point.
- **The employer / organization product.** Not built, not hinted. One product,
  one story.
- **A live product demo.** No "and now I'll log in as a real user with a real
  name and a real job." The data is a seeded demo account.
- **Voice talent.** The founder records it. Scout's voice is a character, not
  an ad campaign.
- **Multiple shoots.** One master, recut three ways. Three separate shoots
  means three sets of branding drift and three times the effort.

## Length and formats

| Cut | Length | Aspect | Where it lives |
|---|---|---|---|
| Master | 2:00–2:30 | 16:9 | Landing page (fallback), sales, docs, `nextepper.com/demo` |
| Hero | 0:55–1:00 | 16:9 | Landing page, muted autoplay-capable, captions burned in |
| Vertical | 0:30–0:35 | 9:16 | LinkedIn, Instagram, TikTok, X |
| GIF | 0:03–0:04 | 16:9 | Landing page, inline next to the hero copy |

**Why the master is longer than the hero.** The payoff — Scout's edits and the
score moving — needs room to breathe. Rush it and the video becomes a montage
of features with no payoff, which is exactly what every competitor's demo
already is. The hero cut is a **recut**, not a separate film: same footage,
same takes, tighter.

**Why 8 seconds is the deadline.** A landing-page video competes with the
hero copy, the resume preview, and the CTA. If the first cut doesn't establish
"resume tool + this posting + a problem," a visitor bounces and the rest of
the runtime doesn't matter.

**Shoot the master even if only the hero is needed.** The hero is derived from
it. Shooting only 60 seconds means re-shooting when the hero needs to become
a full tour.

## The storyboard

Six beats. Each beat earns the next one.

### Beat 1 — Cold open (0:00–0:15) · The gap

**Visual.** Black → the resume, scrolling slowly down. Clean, professional,
believable — the kind of resume someone is proud of. Hold on the work
history. Hard cut to the scorecard: **«SCORE_BEFORE»/100**, tier badge, and
the miss list — *"Missing 4 must-have skills."*

**VO.**
> This resume is good. It doesn't show four of the things the posting asks for.

**Why.** The category's whole promise is a number, so the cold open has to be
a number — then immediately undercut it. The tension is "this looks fine to
me, and it's still wrong." That is precisely the complaint that produced the
scorecard-tips drift memo: a candidate scored 49 and could see the numbers but
no way to improve them.

**Do not** open on the logo. Open on the thing that's broken.

### Beat 2 — Setup montage (0:15–0:24) · Context in 9 seconds

**Visual.** Three fast cuts, no VO:
1. A PDF dropped into the import zone → parsed sections fill the outline.
2. A JD pasted → the panel resolves into structured requirements, must-haves,
   seniority.
3. A variant created from the master.

**On-screen text**, one word each, lower third: `Import.` → `Paste.` →
`Tailor.`

**Why.** A stranger opening mid-product has no idea what they're looking at.
This beat answers "what is this?" in nine seconds so the rest of the video
can assume the answer. It is fast enough to not be boring because there is no
narration over it.

**Do not** narrate the three steps. The landing page's HowItWorks section
already does this properly, in text, for people who want to read it.

### Beat 3 — The reading (0:24–0:42) · What the posting actually wants

**Visual.** The **"Highlight this job's skills"** button in the editor
(`components/rich-text/job-skill-highlight-button.tsx`). Click it. Skills in
the resume go **bold**; the must-haves go **bold + underline**. The result
line reads *"Bolded 7 skills, underlined 3 must-haves."*

**VO.**
> Nexstepper reads the posting before it reads you. It knows which lines are
> real skills and which are just noise. Must-haves get underlined.

**Why.** This is the first proof that the product *understands* the posting
rather than string-matching it. The underline is doing real work: it
distinguishes a must-have from a nice-to-have at a glance, which no keyword
matcher in the category does. And it's visually satisfying in a way a score
number is not — one click, and the resume visibly changes.

**This beat is why the product has this feature.** It was built for the
candidate who needs to know where the employer's eye should land. It is also,
coincidentally, the single most shareable three seconds in the product.

### Beat 4 — Scout (0:42–1:25) · The agent works

**Visual.** The agent intro bubble rises above the floating trigger (the
45-second idle moment — in the video it just appears). Click. The chat panel
opens, Scout's mark in the header. Scout's verdict streams in. Then the
**edits land in the resume**: a bullet rewrites in place, a work entry
reorders, a section is dropped. The mark goes `working` → `applied`.

**VO.**
> Then Scout reads the resume against the posting. Not keyword matching. It
> asks whether the resume actually shows what the role needs.

*beat — the edits land*

> Three gaps worth closing. I moved the billing work up, rewrote the throughput
> bullet, and dropped the section that wasn't earning its place.

**Why.** This is the beat that separates us from the category. Everyone else
shows you a score; we show the agent reading a document and having an opinion.
The second VO line is deliberately *first person* — that's Scout's register
from the brand brief, and it's what makes the agent feel like a colleague
rather than a feature.

**Note for the shoot.** The chat header shows the model as *"Scout · Claude
Haiku 5.5"* (`components/chat/chat-window.tsx`). Leave it. It's honest, it's
modern, and name-dropping the model builds credibility with exactly the
technical audience that reads SaaS demo videos.

### Beat 5 — The payoff (1:25–1:45) · The number moves

**Visual.** Recompute. The score animates **«SCORE_BEFORE» → «SCORE_AFTER»**.
The radar shape shifts. The dimension bars fill.

**VO.**
> «SCORE_BEFORE» to «SCORE_AFTER». Nothing invented. Every change is something
> your resume already proves.

**Why.** This is the money shot and it must be the last thing the viewer sees
before the close. The clause "nothing invented" is the honesty claim, and it
is **true**: the agent's system prompt forbids inventing skills, inflating
bullets, or claiming a change landed when it didn't.

**The numbers in the VO must be the numbers on screen.** A demo video that
says 71 and shows 68 is the same class of bug as the list-badge/scorecard
divergence — two surfaces, one value, disagreeing. Fill both placeholders from
the actual seeded footage, and check them against the render.

### Beat 6 — The refusal (1:45–1:55) · Proof it's honest

**Visual.** A second posting that names no real skills. The honest message:
*"This posting doesn't name skills your resume lists — nothing to highlight."*

**VO.**
> And when the posting doesn't name real skills, it says so. It won't bold
> something you don't have.

**Why.** Eight seconds of credibility. Every competitor will bold whatever
looks good. This one refuses. Putting the refusal **after** the payoff is
deliberate: the viewer has already seen the feature work, so this reads as
a variation rather than an interruption — and it converts the biggest
objection ("is this just keyword matching dressed up?") into evidence.

**Cut it from the hero cut** if the hero needs to be under 55 seconds.

### Beat 7 — Close (1:55–2:15) · Ship it

**Visual.** Export → the PDF opens. The share link copies. Back to the
scorecard. End card: the Nexstepper mark, the tagline, the URL.

**VO.**
> Export it. Send it. Apply.

**End card.** `public/brand/nexstepper-horizontal-clean.png`, wordmark in
Manrope, tagline **"Take the next step."**, `nexstepper.com`. Three seconds,
static, silent.

## The voiceover script

Full text, ready to record. `«»` marks a value that must be read off the
actual seeded footage.

```
[0:00]  This resume is good. It doesn't show four of the things the
        posting asks for.

[0:15]  (no VO — three fast cuts, one word each on screen)

[0:24]  Nexstepper reads the posting before it reads you. It knows which
        lines are real skills and which are just noise. Must-haves get
        underlined.

[0:42]  Then Scout reads the resume against the posting. Not keyword
        matching. It asks whether the resume actually shows what the role
        needs.

[0:58]  Three gaps worth closing. I moved the billing work up, rewrote
        the throughput bullet, and dropped the section that wasn't earning
        its place.

[1:25]  «SCORE_BEFORE» to «SCORE_AFTER». Nothing invented. Every change is
        something your resume already proves.

[1:45]  And when the posting doesn't name real skills, it says so. It
        won't bold something you don't have.

[1:55]  Export it. Send it. Apply.
```

**Read it at ~150 words per minute.** The script above is ~150 words, which
lands the VO at about 60 seconds of speech inside a 2:15 video — the rest is
silence, UI, and cuts. That ratio is deliberate. A demo crammed with
narration sounds like a slideshow with a voiceover.

**Record the VO separately from the screen.** You will re-record the voiceover
five times and re-record the screen twice. Keeping them separate makes the
first five cheap and lets the edit re-sync instantly. Do not narrate live
while screen-recording.

## Recording prep

**The blocker: there is no seed script.** `scripts/` currently holds
`verify-share-schema.mjs`, `sync-pending-migrations.mjs`,
`render-subprocessor-notice.ts` and `measure-page-breaks.mjs` — no fixture
seeder. Without one, every take is different: the score differs, the miss
list differs, Scout's edits differ, and nothing is repeatable.

**Build `scripts/seed-demo.ts`.** It should create a demo account with:

- A realistic **master resume** (use a synthetic candidate — see Risks).
- A realistic **JD**, pasted from a real posting, with genuine skills and
  must-haves.
- The **variant**, created from the master against that JD.
- A **chat session with Scout** — and here's the trick: **run the agent once,
  for real, during seeding.** Let Scout actually read the resume and produce
  its real edits, then persist the session, the revisions it wrote, and the
  score snapshots. The footage then plays back a session that genuinely
  happened, but it is 100% deterministic.
- A **second JD** with no real skills, for Beat 6.
- A **Pro subscription** row, so the Pro-gated surfaces (inline-issue AI
  rewrite, Optimize) are visible.

This seeder is worth building even if the video never happens: it gives you a
demo environment for sales calls that doesn't expose a customer's real resume
and doesn't move every time you open it.

**Determinism checklist.** Same account, same resume, same JD, same score, same
Scout reply, same edit set, every time. If a take differs, the seeder missed a
field — most likely the score snapshot (`resolveRenderedBreakdown` reads the
latest persisted snapshot, so it must be written, not recomputed live).

**Account state.** Pro plan active. Free works for the chat (20 messages/day)
but the inline-issue AI rewrite is Pro-gated, and you want that surface in the
footage.

**Environment.**

- Browser zoom **125%**. A 1080p frame recording a 100%-zoom browser makes
  the scorecard text illegible on a phone, which is where a lot of these get
  watched.
- Clean browser profile. No bookmarks bar, no extensions, no extension icons.
- Notifications off — Windows Focus Assist on, Slack closed, phone in another
  room.
- **Hide the cursor** for shots where it isn't doing anything; keep it for
  the click on "Highlight this job's skills" and the chat trigger, where the
  hand is part of the story.
- Prepare the resume PDF and the JD text in a text file, ready to paste, so
  no take is spent typing.

## Production spec

**Capture.** 1920×1080, 60fps. Tool on Windows: **ScreenPal** (free; built-in
zoom, callouts, cursor smoothing, click sounds) or **OBS**. ScreenPal is the
right pick for a solo founder — its zoom-and-punch effect is the standard
SaaS-demo look and it takes about ten minutes to learn.

**Edit.** **Descript** — edit the video by editing the transcript. It removes
filler words, generates captions, and lets you re-order beats by moving text.
For a founder making one video with no editor, it is the difference between
"two days" and "two weeks." Fall back to DaVinci Resolve (free) if you
already know it.

**Type.** **Manrope** — the product's own face (`app/layout.tsx`, via
`next/font/google`; `docs/brand/logo-brief.md` §3). Captions and lower-thirds
use it. No other typeface appears in the video.

**Color.** Whatever `app/globals.css` resolves to. Grade the footage to match
the product rather than the other way round — a demo that looks nicer than
the product is a lie.

**Sound.** A very quiet ambient bed ducked to roughly **-18dB** under the VO,
license-clear (YouTube Audio Library, Artlist, Epidemic). One soft click
sound. **No mechanical mouse click, no risers, no "swoosh."** The brand is
calm competence; a trailer sound bed contradicts the product.

**Captions.** Burned-in on the hero cut (most visitors watch muted) and
shipped as a separate `.srt` on the master.

## Distribution

| Asset | Placement | Notes |
|---|---|---|
| Poster frame | Landing page hero, in place of / beside `ResumePreview` | PNG, the score-moment frame. Show it, don't autoplay — the hero already has a resume preview and a CTA competing for the fold. |
| Hero cut | `nextepper.com/demo` | With a transcript alongside; this doubles as the accessible version. |
| Micro-loop GIF | Landing page, near the copy | Just the score ticking up. Highest-converting asset per square inch; it proves the core value with no click. |
| Vertical cut | LinkedIn, Instagram, X, TikTok | Recomposed, not cropped — the editor is a horizontal three-column layout and a crop destroys it. |
| Master | Sales, onboarding, `nexstepper.com/demo` | With captions file. |

**On the landing page.** A video that autoplays muted in the hero competes
with the resume preview the hero already renders
(`components/marketing/resume-preview.tsx`). Recommendation: **poster frame
with a play button**, replacing the static preview, and the 60-second cut one
scroll down. Test both against the current hero.

## Risks

**1. The footage shows a real person's resume.** GDPR is not a formality in
this product — the legal pages, `lib/data-rights/`, and the erasure log all
exist because you took the posture seriously. A public video is publication.
**Mitigation:** the seeder uses a synthetic candidate. Never a real user's
resume, even anonymised, unless they have given written permission. If you
want a real one, the score from the drift memo (49 on "SWE CleerDental") is a
good choice *only* with consent.

**2. The agent misbehaves on camera.** Scout is a 6-step agentic loop on a
model that occasionally needs a clarifying question instead of an edit. A take
where Scout asks "which Platform Engineer role?" is a bad demo. **Mitigation:**
the seeder persists a real, good session; the shoot replays it. You are never
waiting on a live model during filming.

**3. The score doesn't move, or moves the wrong way.** It happens — the score
can drop if an edit improves prose but removes a keyword. **Mitigation:** pick
the JD and resume pair in the seeder by *running* them until the pair produces
a clean, large, honest improvement. Then lock that pair.

**4. The video overpromises.** A demo that shows a score jumping 47 → 71 when
the real median improvement is 12 points is the kind of thing a reviewer
screenshots. **Mitigation:** use the real numbers from the real seeded pair,
and make the improvement believable. A believable 47 → 61 beats a fantasy
47 → 71.

**5. Editing eats the schedule.** The edit is the long pole, not the shoot.
**Mitigation:** write and approve this script *before* the shoot, and record
the VO before touching the timeline. The script is the deliverable that
unblocks the edit; without it, the editor is guessing.

## Acceptance criteria

- [ ] Master cut is 2:00–2:30, 1920×1080, 60fps, Manrope throughout.
- [ ] The first 8 seconds establish "resume tool + this posting + a problem"
      without narration carrying the meaning alone.
- [ ] The score visibly moves, and the VO number matches the on-screen number
      exactly.
- [ ] Every claim in the VO is true of the shipped product. "Nothing invented"
      is enforced by the system prompt and shown by the Beat 6 refusal.
- [ ] No real candidate's data appears without written consent.
- [ ] The hero cut works muted, with burned-in captions.
- [ ] The vertical cut is recomposed, not a centre-crop of the 16:9.
- [ ] End card uses `public/brand/nexstepper-horizontal-clean.png` and the
      "Take the next step." tagline.
- [ ] `scripts/seed-demo.ts` exists and is idempotent — running it twice
      produces identical state.

## Open questions

1. **Who is the video for?** Job seekers, or also the employers we might one
   day sell to? The script above is candidate-only. Decide before the shoot;
   a dual-audience video is a video for neither.
2. **A face or not?** A founder's voice with no face is a common, effective
   format and cheaper to produce. A face adds trust and adds production.
   Recommendation: **voice only, for cut one.**
3. **Does the hero autoplay?** Recommendation: no — poster frame. The hero
   already carries a resume preview and a CTA.
4. **Is the Beat 6 refusal worth 8 seconds of the hero cut?** It is the best
   trust beat in the piece. The hero cut should probably keep it and cut the
   setup montage to 5 seconds instead.
5. **Who edits?** Descript, founder, one day. Or hand the master to an
   editor with this script and let them build the cuts — at which point the
   script needs to be handed over *as a document*, which is why this file
   exists.
