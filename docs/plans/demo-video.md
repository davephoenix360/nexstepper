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
- **Six Guidde recordings**, one per beat, captured in Product Demo mode.
- **A second, larger deliverable:** the five product guides described in
  "Second deliverable — the product guides". These are captured in Guidde's
  step-by-step mode and are worth more than the marketing video.

## Non-goals (out of this plan)

- **Guidde's auto-generated script.** Guidde writes a script for you from what
  it captured. For a *how-to guide* that is exactly right. For the hero video
  it is wrong: the script is the argument, and ours says things a generic
  summariser would not — "Kafka, I can't fix. You haven't done it." Replace
  Guidde's generated copy with the written script, and record your own voice
  rather than Magic Mic's AI one.
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
history. Hard cut to the scorecard: **75/100**, tier badge **Good**. Then the
camera drifts to the weakest bar: **Role fit — 50**.

**VO.**
> Seventy-five out of a hundred. A good score. On one dimension, half marks.

**Why.** The category's whole promise is a number, so the cold open has to be
a number — then immediately undercut it. But the undercutting here is better
than "your score is low": **75 is a good score and the resume is still wrong
for this job.** A candidate who scores 74 and can see the numbers but no way
to improve them is precisely the complaint that produced the scorecard-tips
drift memo. Here the fix is visible: role fit is 50 because the resume calls
Jordan a *Senior Software Engineer* and the posting wants a *Senior Backend
Engineer*.

**Do not** open on the logo. Open on the thing that's broken.

**Do not** open on a low score. A "47" cold open would be a lie about this
fixture — the engine says 75, and the video has to say 75.


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
the resume go **bold**; the must-haves go **bold + underline**. The button's
result line reads *"Bolded N skills, underlined M must-haves."* — **read N and
M off the screen during rehearsal and write the real ones here.**

**VO.**
> Nexstepper reads the posting before it reads you. It knows which lines are
> real skills and which are just noise. Must-haves get underlined.

**Why.** This is the first proof that the product *understands* the posting
rather than string-matching it. The underline is doing real work: it
distinguishes a must-have from a nice-to-have at a glance, which no keyword
matcher in the category does. And it's visually satisfying in a way a score
number is not — one click, and the resume visibly changes.

**Verified on the seeded fixture:** the Cartwheel posting classifies as **16
genuine skills and 1 eligibility gate** (the bachelor's degree), so the
button has real work to do and the eligibility list gets a green chip. The
Northwind posting classifies as **0 genuine skills**, so the same button
refuses — that's Beat 6.


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

> Two of these I can fix. Your headline says Software Engineer; this posting
> wants a Backend Engineer. And you never say "event-driven" — but the
> transcription pipeline is event-driven. You just didn't call it that.

> Kafka, I can't fix. You haven't done it. I'm not going to write it for you.

**Why.** This is the beat that separates us from the category. Everyone else
shows you a score; we show the agent reading a document and having an opinion.
The second VO line is deliberately *first person* — that's Scout's register
from the brand brief, and it's what makes the agent feel like a colleague
rather than a feature.

**The refusal is the point of the beat.** A demo where the agent fixes
everything is a demo of a generator. A demo where the agent fixes two things
and says "I can't fix the third, you haven't done it" is a demo of a
*colleague*. The seeded analysis already says exactly this — *"Core
requirements are well evidenced … but the resume shows no Kafka or
event-driven work and no order, payments, or fulfilment domain experience,
which are the core of this role."* Scout's refusal rules turn that into a
sentence worth hearing.

**Note for the shoot.** The chat header shows the model as *"Scout · Claude
Haiku 5.5"* (`components/chat/chat-window.tsx`). Leave it. It's honest, it's
modern, and name-dropping the model builds credibility with exactly the
technical audience that reads SaaS demo videos.

### Beat 5 — The payoff (1:25–1:45) · The number moves

**Visual.** Recompute. The score animates from **75** to whatever it really
becomes. The radar shape shifts. The dimension bars fill — and **Role fit
moves off 50**, which is the bar the cold open put on screen.

**VO.**
> Seventy-five to «SCORE_AFTER». Nothing invented. Every change is something
> your resume already proves.

**Why.** This is the money shot and it must be the last thing the viewer sees
before the close. The clause "nothing invented" is the honesty claim, and it
is **true**: the agent's system prompt forbids inventing skills, inflating
bullets, or claiming a change landed when it didn't. Scout's edits here are
reframings — the headline becomes "Senior Backend Engineer", the Go service
bullet moves up and says what it already meant.

**«SCORE_AFTER» comes from the rehearsal.** Run the chat once, click
Recompute, read the number off the screen, then write it into the script.
Do not predict it. And **do not let it reach 100** — Kafka and OpenTelemetry
are genuinely absent from Jordan's history, and a video that ends at 100 would
be the one lie in an otherwise honest product.


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
[0:00]  Seventy-five out of a hundred. A good score. On one dimension,
        half marks.

[0:15]  (no VO — three fast cuts, one word each on screen)

[0:24]  Nexstepper reads the posting before it reads you. It knows which
        lines are real skills and which are just noise. Must-haves get
        underlined.

[0:42]  Then Scout reads the resume against the posting. Not keyword
        matching. It asks whether the resume actually shows what the role
        needs.

[0:58]  Two of these I can fix. Your headline says Software Engineer;
        this posting wants a Backend Engineer. And you never say
        "event-driven" — but the transcription pipeline is event-driven.
        You just didn't call it that.

[1:12]  Kafka, I can't fix. You haven't done it. I'm not going to write
        it for you.

[1:25]  Seventy-five to «SCORE_AFTER». Nothing invented. Every change is
        something your resume already proves.

[1:45]  And when the posting doesn't name real skills, it says so. It
        won't bold something you don't have.

[1:55]  Export it. Send it. Apply.
```

**The 0:58 and 1:12 lines are predicted, not confirmed.** They follow from
what the seeded analysis actually found — *"Core requirements are well
evidenced (Go services, gRPC over PostgreSQL on Kubernetes/Terraform/AWS,
nine years, owned on-call), but the resume shows no Kafka or event-driven
work and no order, payments, or fulfilment domain experience"* — and from the
agent's refusal rules. Run the chat once during rehearsal and **rewrite these
two lines in Scout's actual words.** The structure must survive: one fixable
gap, one fixable gap, one gap Scout refuses to close.

**Read it at ~150 words per minute.** The script above is ~160 words, which
lands the VO at about 65 seconds of speech inside a 2:15 video — the rest is
silence, UI, and cuts. That ratio is deliberate. A demo crammed with
narration sounds like a slideshow with a voiceover.

**Record the VO separately from the screen.** You will re-record the voiceover
five times and re-record the screen twice. Keeping them separate makes the
first five cheap and lets the edit re-sync instantly. Do not narrate live
while screen-recording.

## Recording prep

**The seeder is built.** `scripts/seed-demo.ts` + `scripts/demo-fixtures.ts`.

```bash
pnpm seed:demo          # seed if the demo account is missing
pnpm seed:demo:reset    # wipe the demo account and re-seed
```

It creates a demo account — `demo@nexstepper.com` / `nexstepper-demo`, on the
Pro plan — holding:

- a **master resume** for a synthetic candidate (Jordan Ellis, Senior Software
  Engineer — deliberately a generalist headline against a backend-platform
  posting),
- a **tailored variant** of that master against *Senior Backend Engineer,
  Platform* @ Cartwheel,
- a **real, computed ATS score** for that variant, persisted as a snapshot
  through the same query helper the Recompute button uses,
- a **first-session analysis**, so Scout opens the conversation already
  informed instead of asking what it can work out itself,
- a **second posting that names no genuine skills** (Customer Operations
  Specialist @ Northwind Supply), for the refusal beat.

It refuses to run against the production database. The repo has two Neon
projects, `.env.local` is the dev one, and the seeder compares the resolved
host against `.env.production.local` and aborts if they match.

**What the seeder produced on 2026-11-02** (these are the real numbers — the
scorecard will render exactly this):

| | |
|---|---|
| **Overall score** | **75** |
| Keywords | 68.1 |
| Format | 82.3 |
| Impact | 74.1 |
| Experience match | 69.2 |
| Intent coverage | 89.5 |
| **Role fit** | **50** |
| Seniority fit | 100 |

And the two highlight beats, verified by running the same Jev evaluation the
button runs:

| Posting | Genuine skills | Eligibility gates | What the video shows |
|---|---|---|---|
| Cartwheel (Backend Platform) | 16 | 1 (the degree) | Bold + underline, must-haves distinguished |
| Northwind Supply (Customer Ops) | **0** | 1 | The honest refusal |

**Read those numbers off the screen during rehearsal and put them in the
script.** Do not write a number that isn't the one on screen — a video that
says 71 while the card says 75 is the list-badge bug in a video.

### What the fixture is designed to prove

The candidate's evidence is **strong** — Jev scores Go 2.93, gRPC 2.49,
distributed systems 2.47, Kubernetes 2.23, Terraform 2.03, AWS 2.12. The
resume has the work.

But the resume's headline says **Senior Software Engineer**, and the posting
wants a **Senior Backend Engineer**. Role fit is 50, and the ATS keyword
match is only 68, because the resume never says "distributed systems",
"event-driven" or "microservices" — even though the migration bullet means
exactly that.

That is the demo's thesis in one candidate: **the resume shows it; the
resume doesn't say it.** Scout's honest job is to reframe, not to invent.
And Kafka (evidence 0.14) and OpenTelemetry (0.02) are genuinely absent, so
the score after the fix still won't be 100 — and shouldn't be.

### Determinism checklist

Same account, same resume, same JD, same score, same Scout reply, same edit
set, every time. The seeder is idempotent: the second run is a no-op, so the
AI calls are never repeated and the demo state cannot drift between takes.

### Account state

Pro plan active (`plan=pro`, `status=active` — a local mirror row, not a real
Stripe subscription). The inline-issue AI rewrite is Pro-gated, and you want
that surface in the footage.

### Environment


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

## Before the session — the manual test

Run this once in your own browser, **before** you open Guidde. It takes about
ten minutes and it tells you three things the plan cannot: the real number
after Scout's edits, the real behaviour of the highlight button, and how long
the chat pause actually feels.

`pnpm preflight:demo-video` automates the machine-checkable half of this
(server up, credential authenticates, scorecard renders 75, chat route
answers, probe session cleaned up). **The steps below are the half only you
can do** — the ones that involve reading Scout's actual words and watching
the screen.

### 0. Preconditions

`pnpm dev` running. Browser at **http://localhost:3000/sign-in**. Sign in with
`demo@nexstepper.com` / `nexstepper-demo`.

The dev build compiles routes on demand, so **the first load of the editor
page will hang for a few seconds**. Warm it up during the manual test, not
during a recording.

### 1. The resume list

Expect **two** resumes: "Jordan Ellis — Master Resume" and "Jordan Ellis —
Cartwheel (Backend Platform)". The variant's badge must read **75**.

**If the badge says anything else, stop and tell me.** That would be the
list-badge-vs-scorecard divergence this repo already fixed once, coming back.

### 2. Open the variant

Expect: **75**, tier badge **Good**, and the seven dimensions —
Keywords 68, Format 82, Impact 74, Experience match 69, Intent coverage 90,
**Role fit 50**, Seniority fit 100. The radar chart renders. The resume
reads *Jordan Ellis · Senior Software Engineer · Halcyon Systems · Rotosignal*.

### 3. The highlight button

Click **"Highlight this job's skills"**. Expect a pause of a second or two,
then skills in the resume going **bold**, must-haves going **bold +
underline**, and a result line: *"Bolded N skills, underlined M must-haves."*

**Write down N and M.** The script needs the real numbers. Expect N ≈ 16.

**If it says "nothing to highlight", stop** — the fixture is wrong.

### 4. Scout

Click the floating trigger, bottom-right. The chat panel opens; the header
should read **"Scout · Claude Haiku 5.5"**.

The intro bubble only appears after **45 seconds of idle** — don't wait for
it. If you want it on camera, leave the editor open while you record another
beat and grab it in that take.

### 5. The chat turn — the one that matters

Send the prompt. **Time the dead pause before the first token.** Measured
twice today it came in at **4.3s and 11.7s** — so it varies. Anything over
about 8 seconds must be jump-cut in post.

Then read Scout's reply. The script's two lines at 0:58 and 1:12 are
**predictions** — copy Scout's actual words and rewrite them. The structure
must survive: one fixable gap, one fixable gap, one gap Scout refuses to
close.

### 6. The edits

Expect the headline and bullets to change in place. The agent mark goes
`working` → `applied`.

### 7. Recompute — the money shot

Click **Recompute**. The score recomputes.

**Write down the new number. That is «SCORE_AFTER».** Do not predict it.

Check that **Role fit moved off 50** — that is the bar the cold open put on
screen.

**If it reaches 100, something is wrong.** Kafka and OpenTelemetry are
genuinely absent from Jordan's history, so the score must not reach 100. A
video that ends at 100 is the one lie in an otherwise honest product.

### 8. The refusal

Open the **Northwind Supply — Customer Operations Specialist** application.
Click "Highlight this job's skills" again.

Expect: **"This posting doesn't name skills your resume lists — nothing to
highlight."**

**If it marks anything, stop and tell me** — Beat 6 cannot be filmed.

### 9. Export and share

Export → PDF (check the print preview renders the resume). Share → copy link.

### 10. Re-seed before the shoot

**This matters: the manual test dirties the data.** Scout's edits in step 6
changed the resume, so the "before" state is no longer 75.

```bash
pnpm seed:demo:reset
```

The shoot must start from a clean seed, or Beat 1 opens on the wrong number.

## Guidde: what the trial gives you, and what it doesn't

You are on the **free Business trial**, so you already have the good parts:
the **desktop app**, **Magic Mic**, the **Brand Kit**, unlimited text-to-voice,
analytics, and no video cap.

**What the trial does not have: MP4 download.** Guidde's export help is
explicit — *"Export via Download is available on: Pro, Business and Enterprise
plans"* and *"Export is Not Available: During the free (Business) trial."*
The pricing FAQ says the same: *"Some features (like MP4 export) require an
active paid subscription."*

So you can capture, edit, preview and share during the trial, but you cannot
download the file — and a file you cannot download is a file you cannot cut.

**The plan:**

| When | What |
|---|---|
| **Now** | Use the trial for the manual test and the rehearsal. Set up the **Brand Kit** (upload `public/brand/nexstepper-horizontal-clean.png`, set Manrope) — it is included. |
| **Before the shoot** | Upgrade to **Pro** ($19/creator/month on annual billing). It gives MP4 export, no watermark, the Brand Kit and blur-sensitive-info. |

Nothing is lost if you upgrade later — content created during the trial stays
in the account, and the FAQ is explicit that videos survive the downgrade to
Free (where you just can't export more than the last 25).

**Also worth knowing while you are in there.** Magic Mic turns your spoken
narration into a cleaned AI voiceover and your original voice is not recorded
or stored. It is excellent for the **product guides**. For the **hero video**,
keep your own voice — a founder's real voice on a landing page outperforms a
synthetic one, and the narration is only 160 words.

## Production spec — Guidde

**Guidde is the capture engine.** Not the editor. It is very good at one thing
(turning a screen recording into a narrated, captioned, on-brand video in
minutes) and it has no timeline editor at all, so the cut has to happen
somewhere else. Splitting it that way is the whole trick.

### What you need

| | Free | Pro ($19/creator/mo annual) | Business ($39/mo annual) |
|---|---|---|---|
| Web-app capture (Chrome/Edge extension) | ✅ | ✅ | ✅ |
| How-to videos | 25 | Unlimited | Unlimited |
| **MP4 / GIF / PDF export** | ❌ | ✅ | ✅ |
| **Watermark removed** | ❌ | ✅ | ✅ |
| **Brand Kit** (fonts, colours, logo) | ❌ | ✅ | ✅ |
| **Blur sensitive info** | ❌ | ✅ | ✅ |
| **Magic Mic** (spoken → clean AI voice) | ❌ | ❌ | ✅ |
| Desktop app (native windows) | ❌ | ❌ | ✅ |

**Take Pro.** It is $19/month and it is the plan that removes the two blockers
for a *public marketing* video: the watermark and the lack of MP4 export. Free
gives you share links only — you cannot download the file, so you cannot cut
it, so it cannot become the master.

**Skip Business unless you want Magic Mic.** Magic Mic (speak while you work →
Guidde cleans your narration into a polished AI voiceover, pauses removed) is
excellent, but it is Business-only and it replaces your voice with an AI one.
For the *hero* cut, keep your own voice — a founder's real voice on a landing
page outperforms a synthetic one, and the narration is 160 words, so you will
record it five times and that is fine.

**Magic Mic is the right tool for the product guides** (below), where the
voiceover is narration rather than a founder speaking.

**Nothing is installed on this machine yet.** The Chrome extension is
`oacmmmjedhheaijfjidilonpngccnhdl`, the Edge one is
`pldeojbhedianlcaejpfbnckfhkacphe`. The desktop app is Business-only, and you
do not need it — the entire demo happens in the browser.

### The setting that decides everything

Guidde has two recording modes and picking the wrong one kills the payoff:

- **Screen Capture / Product Demo** → "always produce continuous video steps by
  design." Continuous screen motion.
- **Step-by-step Guidde** → every click becomes either a video step or a
  **static step** (a still image with an auto-generated callout), depending on
  whether you were speaking at the time.

**Record every beat of the hero video in Product Demo / Screen Capture mode.**
The step-by-step mode turns the score animating from 75 to 84 and Scout's
bullet rewriting in place into two still screenshots with arrows on them — which
is a how-to guide, not a demo, and it destroys the two beats that make the
video worth watching.

For **Beat 2** (the 9-second setup montage: import → paste JD → tailor) the
step-by-step mode is actually *better* — it is literally three steps — and
Guidde's **Screen Walkthrough** (animates the cursor between interaction points
with a click effect, no arrows or text) is the standard SaaS-demo look. But
test it: if the continuous capture already looks clean, keep one mode for the
whole video. A video that changes visual grammar mid-way reads as two videos.

### The capture plan

Record **one Guidde per beat** — six short clips, not one long one. Each
recording is under the 10-minute limit, each is easy to re-take, and the
editor can then assemble six clean sources instead of digging through a single
long take. Six recordings also means a botched take costs you one beat.

| Beat | Guidde | Mode | Notes |
|---|---|---|---|
| 1 — Cold open | `01-cold-open` | Product Demo | Scroll the resume, cut to the scorecard, let it sit on Role fit 50 |
| 2 — Setup montage | `02-setup` | Step-by-step + Screen Walkthrough | Import, paste JD, create variant |
| 3 — The reading | `03-highlight` | Product Demo | Click "Highlight this job's skills", skills go bold, must-haves underline |
| 4 — Scout | `04-scout` | Product Demo | Open chat, send the prompt, watch the edits land |
| 5 — The payoff | `05-score` | Product Demo | Click Recompute, hold on the score moving |
| 6 — The refusal | `06-refusal` | Product Demo | Switch to the Northwind posting, click highlight, it refuses |
| 7 — Close | `07-close` | Product Demo | Export → PDF → share link |

**Beat 4 will have a dead pause.** The chat waits for the model — five to
fifteen seconds of a still screen while the reply streams. The seeded
first-session analysis means Scout already knows the verdict, which makes the
reply faster, but it still is not instant. **Cut the wait in the edit.** A
jump-cut is invisible and it is the only way this beat works.

**Beat 1's agent intro bubble** appears after 45 seconds of idle. You cannot
wait for it on camera. Either let the editor sit idle while you record another
beat and grab the bubble in that take, or cut the bubble entirely — the
narrative does not need it.

**Guidde does not capture system audio** (no browser tab sounds, no app
notifications). Your VO is a separate recording anyway.

### Export, then cut

Export each Guidde as **MP4 with captions burned in** (Guidde's export modal
has an "Include captions" toggle — you want this on, because the hero cut
plays muted for most people).

Then assemble in **CapCut Desktop** (free, Windows, has 9:16 presets and
auto-captions) or **DaVinci Resolve** (free, pro-grade). CapCut is the right
call for a solo founder: the text-based timeline is close to Descript for
trimming-by-script, the vertical preset is one click, and it costs nothing.

**Do the final cut outside Guidde.** Guidde's editor can reorder and trim
*steps* — that is a coarse timeline, not a cinematic one. It cannot recut the
same footage to 60 seconds, it cannot recompose to 9:16 (a three-column editor
cropped to vertical is unusable), and it cannot give you a 3-second static end
card. Those are three of the four deliverables in the distribution table.

### The end card

Build it in the editor, not in Guidde: `public/brand/nexstepper-horizontal-clean.png`,
wordmark in Manrope, tagline **"Take the next step."**, `nexstepper.com`. Three
seconds, static, silent. Guidde's Brand Kit can put the logo on every frame,
which handles consistency — but the end card wants to be a still.

### Brand Kit

Upload the wordmark and set Manrope as the caption font. Guidde applies them
to every guidde, so the documentation guides and the marketing video look like
the same product. The app's own colours come from `app/globals.css` — do not
re-grade the footage to look nicer than the product; a demo that looks better
than the thing it demos is a lie.

### Type, colour, sound

**Type.** Manrope only — the product's own face (`app/layout.tsx`, via
`next/font/google`; `docs/brand/logo-brief.md` §3). No other typeface appears
in the video.

**Sound.** A very quiet ambient bed ducked to roughly **-18dB** under the VO,
license-clear (YouTube Audio Library, Artlist, Epidemic). One soft click
sound. **No mechanical mouse click, no risers, no "swoosh."** The brand is
calm competence; a trailer sound bed contradicts the product.

**Captions.** Guidde can burn them into the exported MP4. Ship the master with
a separate `.srt` as well, and burn them in on the hero cut.

### The GIF micro-asset

Guidde exports GIF, but only of a whole guidde — and the landing page wants a
3-second loop of the score ticking up. Two ways to get it:

1. Record that one moment separately with any recorder, then **upload the MP4
   to Guidde with "Keep the video as is"** and export it as a GIF. Guidde's
   upload flow takes an existing MP4 and can leave it as a single step.
2. Or skip Guidde for it and make the GIF in CapCut.

## Second deliverable — the product guides

**This is where Guidde actually earns its keep for Nexstepper**, and it is
worth more than the marketing video.

Guidde's native output is a narrated step-by-step video *and* a matching
article, from one capture. That is exactly the shape of the content a solo
founder cannot otherwise produce: the feature guides, the onboarding material,
the help-centre content. Nexstepper has features that need explaining —
creating a variant from a posting, highlighting a posting's skills, inviting a
reviewer, sharing a link, exporting a PDF — and each one is a two-minute
capture.

What makes it compounding rather than a one-off:

- **One capture, two outputs.** Video for the landing page and the docs; an
  article for the knowledge base. The founder writes neither.
- **The seeded demo account makes it repeatable.** `pnpm seed:demo` gives you
  the same resume, the same posting and the same score every time, so a guide
  never has to be re-shot because the data moved.
- **Translation into 40+ languages with synced subtitles.** For a resume
  product with international candidates, that is a distribution advantage
  nobody else in the category has.
- **Blur sensitive information.** The seeded resume has a synthetic email and
  phone number, but this also means you can film a guide without ever
  thinking about what is on screen.
- **Brand Kit.** Every guide is on-brand by default.
- **It is also a sales asset.** A "here's how we tailor a resume to your
  posting" walkthrough, recorded against the seeded demo account, is
  something you can put in a sales email.

Suggested first five guides, in the order they block a new user:

1. **Create a variant from a job posting** — the core loop.
2. **Read your ATS score** — what the seven dimensions mean and what the tips
   are claiming. (Also the guide that keeps the scorecard-tips drift from
   happening again.)
3. **Ask Scout to fix a gap** — the agent, and the refusal.
4. **Invite a reviewer / share a link.**
5. **Export to PDF.**

Capture each in **step-by-step mode** with **Screen Walkthrough on** — these
are how-to guides, which is exactly what that mode is for. Turn on **Magic
Mic** (Business) so the narration is cleaned up automatically and
translatable; for guides the AI voice is an advantage, not a compromise.

**Guidde's Knowledge Base** can publish them into a docs site; the integrations
(Zendesk, Slack, Confluence, Salesforce) can drop them where users already
are.

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
where Scout asks "which Backend Engineer role?" is a bad demo. **Mitigation:**
the seeder persists the **first-session analysis**, so Scout opens the
conversation already holding the verdict, the strengths and the gaps — the
three-gap structure is seeded even though the reply is not. Then **rehearse
the full chat once before the shoot** and learn what Scout actually does with
this fixture. Film the take that matches the rehearsal. If Scout refuses to
edit in rehearsal, the fixture is wrong, not the model — change the fixture
until the live behaviour is the one the video needs.

**3. The score doesn't move, or moves the wrong way.** It happens — the score
can drop if an edit improves prose but removes a keyword. **Mitigation:**
rehearse the chat, click Recompute, and read the number off the screen. If it
doesn't move, Scout's edits weren't the ones you expected; adjust the prompt
you send it until it does, then film that.

**4. The video overpromises.** A demo that shows a score jumping 47 → 71 when
the real improvement is 9 points is the kind of thing a reviewer screenshots.
**Mitigation:** the seeded fixture scores **75**, and every number in the
script comes off the screen during rehearsal. A believable 75 → 84 beats a
fantasy 47 → 100 — and the score must **not** reach 100, because Kafka and
OpenTelemetry are genuinely absent from Jordan's history.

**5. Editing eats the schedule.** The edit is the long pole, not the shoot.
**Mitigation:** write and approve this script *before* the shoot, and record
the VO before touching the timeline. The script is the deliverable that
unblocks the edit; without it, the editor is guessing. Six separate Guidde
recordings make the assembly mechanical rather than creative.

**6. Guidde's step-by-step mode flattens the payoff.** This is the one that
ruins the video if you miss it. In step-by-step mode a silent click becomes a
**still image with an auto-generated callout**, so Scout's bullet rewriting in
place and the score animating both arrive as two static frames with arrows.
**Mitigation:** record every hero beat in **Product Demo / Screen Capture**
mode, and check the exported MP4 before moving on — if the score animates in
the export, the mode is right; if it is a still, it is not.

**7. The free plan's watermark and export limits.** A Free-plan guidde cannot
be downloaded at all, and it carries a watermark. **Mitigation:** Pro, $19 per
creator per month on annual billing. If you are on Free today, that is the
first thing to change — nothing else in this pipeline works without it.

**8. The chat beat has a dead pause and the bubble has a 45-second timer.**
Both are timing problems the capture tool cannot solve. **Mitigation:**
jump-cut the pause in the editor; capture the agent intro bubble in a
separate take while the editor idles, or drop it.

## Acceptance criteria

**Seeding (done — 2026-11-02)**

- [x] `scripts/seed-demo.ts` exists and is idempotent — running it twice
      produces identical state, and the second run makes no AI calls.
- [x] It refuses to write to the production database (host compared against
      `.env.production.local`).
- [x] The seeded credential verifies against Better Auth's own hashing, so
      `demo@nexstepper.com` / `nexstepper-demo` genuinely signs in.
- [x] The variant carries a real score snapshot written through the same
      query helper the Recompute button uses, so the scorecard renders
      exactly what the seeder printed.
- [x] The Cartwheel posting classifies as 16 genuine skills + 1 eligibility
      gate, so Beat 3 has real work to show.
- [x] The Northwind posting classifies as 0 genuine skills, so Beat 6's
      refusal fires as written.
- [x] A first-session analysis is persisted, so Scout opens informed.
- [x] `pnpm preflight:demo-video` exists and reports **READY TO SHOOT** —
      server up, credential authenticates, scorecard renders 75, chat route
      answers, probe session cleaned up. It exits non-zero on any failure.

**Capture**

- [ ] Guidde is on **Pro** — no watermark, MP4 export works.
- [ ] Every hero beat is recorded in **Product Demo / Screen Capture** mode,
      and the exported MP4 shows the score *animating* rather than as two
      stills. If it is a still, the mode is wrong.
- [ ] Six separate recordings, one per beat, each re-takeable on its own.
- [ ] Captions are burned into the exported MP4s.
- [ ] The Brand Kit carries Manrope and the wordmark.
- [ ] The recorded footage contains no real candidate data.

**The cut**

- [ ] Master cut is 2:00–2:30, 1920×1080, 60fps, Manrope throughout.
- [ ] The first 8 seconds establish "resume tool + this posting + a problem"
      without narration carrying the meaning alone.
- [ ] The score visibly moves, and the VO number matches the on-screen number
      exactly.
- [ ] The score does **not** reach 100.
- [ ] Every claim in the VO is true of the shipped product. "Nothing invented"
      is enforced by the system prompt and shown by the Beat 6 refusal.
- [ ] No real candidate's data appears without written consent.
- [ ] The hero cut works muted, with burned-in captions.
- [ ] The vertical cut is recomposed, not a centre-crop of the 16:9.
- [ ] End card uses `public/brand/nexstepper-horizontal-clean.png` and the
      "Take the next step." tagline.

**Product guides**

- [ ] Five guides captured: variant-from-posting, read-your-score, ask-Scout,
      reviewer-and-share, export-to-PDF.
- [ ] Each produces both a video and a matching article.
- [ ] Each is captured against the seeded demo account, so a re-shoot never
      needs new data.
- [ ] Sensitive-information blur is on for every capture.
- [ ] At least one guide is published in a second language with synced
      subtitles.

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
5. **Who edits?** CapCut, founder, one day. Or hand the master to an editor
   with this script and let them build the cuts — at which point the script
   needs to be handed over *as a document*, which is why this file exists.
6. **Do the guides get their own voice?** Magic Mic on Business gives you a
   cleaned, translatable AI voice; Pro keeps your own. Recommendation: AI
   voice for the guides (narration, not a founder speaking), your own voice
   for the hero cut.
