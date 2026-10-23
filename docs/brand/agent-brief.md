# Nexstepper — AI Agent Brand Brief

**Purpose:** hand off to an image generator to produce a mark/avatar for
the Nexstepper AI assistant, and to define the personality that mark has
to earn its personality from.

Every fact below is sourced from the repo, not invented — the product's
voice from `docs/brand/logo-brief.md`, the palette from
`app/globals.css`, the assistant's actual behaviour from
`lib/chat/system-prompt.ts`, and the logo's geometry from
`public/brand/nexstepper-icon-clean.png`.

**Companion doc:** `docs/brand/logo-brief.md` (the product's own mark).
Read both before generating anything — the agent's mark has to look like
it belongs to the same product without repeating the product's symbol.

---

## 1. What the agent actually is

Not a chatbot. A **staff member with a clipboard**.

Read the product's own definition of itself in
`lib/chat/system-prompt.ts`:

> You are the Nexstepper assistant — a professional resume writer, resume
> reviewer, and hiring recruiter, all in one. You are embedded in the
> user's resume editor, you can see their actual resume below, and you
> have tools that edit it. You are expected to DO things, not just
> suggest them.

Three roles, one job: **turn the user's document into something an
employer's screening software will pass**, and tell them the truth while
doing it.

| | |
|---|---|
| **What it reads** | The user's actual resume, the pasted job description, the ATS score breakdown, the measured page-fit tables |
| **What it does** | Edits the document with tools, scores it, measures how much fits on a page |
| **What it will not do** | Invent a skill, inflate a bullet, add a degree, claim a change landed when it did not |
| **What it sounds like** | A sharp colleague at the next desk. Three sentences, a recommendation, a reason. |
| **Its superpower** | It has already read the document before you opened the chat. It opens with a verdict, not a question. |

**The one-sentence positioning:** *It read your resume and the job
description before you did, and it has an opinion.*

---

## 2. Naming

The product's name carries a documented decision that rules out the
obvious choice. From `docs/brand/logo-brief.md`:

> A _stepper_ is **the person who takes the next step** — the customer,
> not the tool.

So the assistant is **not** "Stepper". The user is the stepper. The
assistant is the thing that shows them which step to take.

| | Name | Why |
|---|---|---|
| **Recommended** | **Scout** | It goes ahead, checks the ground against the job posting, and comes back with a report. Short, warm, active, and the verb works in copy: *"Scout found three gaps worth closing."* It describes the agent's actual behaviour — it always arrives already informed. |
| **Alternate A** | **Wren** | A small, sharp, fast bird. If you want a warmer, more characterful mark that could grow a little personality, this is the one. Distinctive as a wordmark; slightly less literal about the job. |
| **Alternate B** | **Gauge** | Leans on the measurement character — real PDF page counts, a real rubric, a real score. *"Gauge says you're at 3.2 pages."* Distinctive, a little industrial, strongest if you want the mark to feel like instrumentation. |

Whichever you pick, the product's name stays **Nexstepper** and the
agent is a character inside it, not a co-product. The relationship reads
like a tool and the person using it, or a studio and its lead — not a
parent and a child brand.

---

## 3. What the mark has to survive

These are hard constraints from the product, not preferences.

| Constraint | Why |
|---|---|
| **Legible at 16px** | It is the chat trigger's icon and a favicon-scale mark. |
| **Legible at 24px** | The chat header avatar. |
| **Works as a single-colour stamp** | The product's own logo inverts wholesale for dark mode (`dark:invert`) because it is monochrome. The agent's mark must be able to do the same. |
| **Flat, 2–4 strokes maximum** | The house rule from the logo brief. |
| **Reads in a 32px circle** | The chat header renders the avatar in a rounded circle. The mark must be centred with generous margin so a circular crop never clips it. |
| **No text** | It gets rendered at 16px. |
| **Transparent background** | It sits on white panels, on the dark app, and inside the indigo chat trigger button. |

### Where it will appear

- **Chat header avatar** — 32px, inside a circle, beside the agent's name
- **Chat trigger button** — 56px, currently a lucide `MessageSquare` on indigo
- **Typing / "agent is working" indicator** — this is where a mark earns personality: it can have a subtle "thinking" state
- **Empty state** — *"Ask about your resume"* panel
- **First-run introduction** — the moment you meet it

---

## 4. Direction

### Do

- Build a **geometric, monoline symbol with one filled element**. The
  outline says "tool"; the single filled accent says "there is a point
  of view here".
- **Abstract a document, do not draw one.** The mark should evoke
  *review, measurement, annotation* — not a page, a sheet of paper, a
  scroll, a file.
- Let the mark express **"I have already read it."** An editorial
  annotation mark, a reading instrument, a verdict.
- Tie it to the product's own visual language: the staircase logo is
  **rounded, thick-stroke, geometric**. The agent's mark should be
  compatible in stroke weight and terminal roundness, and a clear
  *different symbol*.
- Carry **one** accent colour. The app chrome is deliberately colourless
  slate, so the mark is one of the only places colour can live.

### Do not

- **Do not draw a staircase, steps, a path, or an upward arrow.** The
  product's logo IS a staircase. The agent's mark must be unmistakably
  not it. (This is the single most likely way a generator will fail
  this brief.)
- **Do not draw a robot, a face, a head, a helmet, or a human avatar.**
  The logo brief rules out robotics and sparkle motifs as overused and
  un-human for a product whose voice is "calm competence."
- **Do not draw a résumé, document, paperclip, briefcase, or envelope.**
  A documented reason for rejecting the name "Resumotive" was that
  a résumé-in-a-circle boxes the brand in.
- **Do not do a gradient blob, a swoosh, or a soft 3D render.** Explicitly
  ruled out in the logo brief: "the generic 'abstract swoosh / gradient
  blob' AI-logo look."
- **Do not do a chat bubble.** It is the current placeholder and it says
  "chat", not "agent with a point of view". It also collides with the
  product's own Feedback pill, which is a chat bubble.
- **No circuit boards, no brains, no sparkles, no binary, no glowing
  rings.**

---

## 5. Prompt for the image generator

### 5.1 The master prompt

> Design a minimal geometric **brand mark for an AI agent** that works
> inside an AI-assisted resume builder called Nexstepper.
>
> **The agent's character:** it is embedded in a resume editor. It has
> already read the user's resume and the job description before the user
> opened the chat, and it arrives with a specific opinion and a plan
> rather than a greeting. It measures (real page counts, a real
> screening score) instead of guessing, it edits the document itself,
> and it never flatters the user or invents facts about them. It is a
> sharp, honest, quietly confident colleague — closer to Linear or
> Notion than to a consumer AI app.
>
> **The mark:** a single abstract geometric symbol, built from 2–4
> monoline strokes with rounded terminals, plus one small solid filled
> element in the accent colour. It should read as *a point of view
> located precisely* — an editorial annotation, a reading instrument, a
> verdict marked on a document — rather than as a picture of an object.
>
> **Must survive:** being rendered at 16px as a favicon, at 24px as a
> small avatar, inside a 32px circle, and as a single-colour stamp with
> no fill detail. Centred, generous margin, nothing close to the edges.
> Flat vector. Solid transparent background.
>
> **Palette:** near-black navy #0F172A for the strokes, one vivid indigo
> #6366F1 for the single filled accent element. No other colours.
>
> **Absolutely do NOT include:** a staircase, steps, a path, an upward
> arrow, a robot, a face, a head, a helmet, a chat bubble, a speech
> bubble, a document, a sheet of paper, a résumé, a paperclip, a
> briefcase, an envelope, a pen, a magnifying glass, a circuit board, a
> brain, a sparkle, a binary pattern, a glowing ring, a gradient, a
> 3D render, a soft blob, a swoosh, or any text or letters.
>
> **Feel:** calm competence. Precise, editorial, quietly confident.
> Deliver the mark alone, centred, on a transparent background, at
> 1024×1024.

### 5.2 Three directions to run

Run all three, pick the strongest. Each is a different *idea*, not a
different style of the same idea.

---

#### Direction A — "The Bracket" *(recommended)*

> A single square bracket `[ ]` drawn in monoline with rounded
> terminals, in near-black navy, with the **lower-right corner
> replaced by a single solid indigo dot** — as if something has been
> pinpointed inside the marked region.
>
> It reads as: *this exact part of the document, and here is my point
> of view on it.* Editorial, precise, a proof-reader's annotation.
>
> Monoline stroke, rounded terminals, 2 elements total (the bracket,
> the dot). Flat, centred, transparent background, 1024×1024. Must
> survive 16px and a 32px circular crop.

**Why it works:** a bracket is the most legible possible way to say
"precisely here". The dot says "and here is the thing". It is not a
picture of anything, so it cannot be mistaken for a generic AI mark,
and it is unmistakably not the staircase.

---

#### Direction B — "The Dial"

> A thin open ring, drawn as a single monoline stroke in near-black
> navy, with a short tapered **needle** in vivid indigo pointing
> up-and-right from the centre, and a tiny solid indigo pivot dot at
> the centre.
>
> It reads as: *a bearing.* Which way. Not a compass rose — a quiet
> instrument dial, like the readout of a measuring device.
>
> The ring should be an **open arc (about 300°), not a closed circle**,
> so the mark does not read as a generic "loading spinner".
>
> Flat, centred, transparent background, 1024×1024. Must survive 16px
> and a 32px circular crop.

**Why it works:** the product's most distinctive existing visual is the
**ATS radar chart**. A dial is the same idea in one glyph, and it ties
the agent to the score the user came to look at. It also gives the
"thinking" state somewhere to go: the needle can sweep while the agent
works.

**Risk:** "compass/gauge" is a well-trodden path for "AI guidance" marks.
Judge it against Direction A on distinctiveness, not on concept.

---

#### Direction C — "The Step" *(strongest brand tie, most risk)*

> A **single** L-shaped step — one riser, one tread — in near-black
> navy, with the **tread filled solid in vivid indigo**. One step only.
> Not a staircase: exactly one riser and one tread, centred in a
> square, with a single filled horizontal bar.
>
> It reads as: *the next step, this one, highlighted.*
>
> Flat, centred, transparent background, 1024×1024. Must survive 16px
> and a 32px circular crop.

**Why it works:** the strongest possible brand tie to "Take the next
step", and a natural sibling of the staircase logo — same geometric
language, one step instead of four.

**Risk, and it is real:** the product's logo is a multi-step staircase.
One step is a legibility risk (at 16px an L plus a bar can read as a
corner) *and* a confusion risk (a viewer may not immediately tell it
from the logo). Use this one only if the result is unmistakably a
single step.

---

### 5.3 Negative prompt

If your generator takes one:

> robot, humanoid, android, face, head, eyes, helmet, mascot, character,
> chat bubble, speech bubble, message square, envelope, email, document,
> sheet of paper, page, résumé, CV, paperclip, briefcase, business
> suitcase, pen, pencil, magnifier, magnifying glass, funnel, target,
> bullseye, crosshair, staircase, stairs, step ladder, upward arrow,
> chevron, path, road, circuit board, motherboard, chip, binary, code,
> brain, neural network, sparkle, star, magic wand, glowing orb, halo,
> ring, lens, aperture, gradient, gradient mesh, swoosh, blob, 3d render,
> octane render, glossy, drop shadow, glassmorphism, text, letters,
> words, watermark, mockup, lanyard, business card, desk

---

## 6. Personality and voice

Half of "branding an agent" is the copy. The mark is the name tag; this
is the character. The agent's own system prompt already sets the
standard — *"You are a sidebar, not an essay"* and *"Be concise and
actionable. Specific suggestions, not generic advice."* This is how
that reads in the product.

### Six rules

1. **Lead with the verdict.** Not a greeting, not a restatement of the
   question. The first sentence is the finding.

   > ❌ "Great question! Let me take a look at your resume for this role."
   > ✅ "Your Dayforce role is doing all the work — the JD wants Node, and your stack is Python."

2. **Have an opinion.** Recommend one thing. The user can say no.

   > ❌ "You could consider reordering your sections, or perhaps adding a projects section, or highlighting your skills differently."
   > ✅ "Move Dayforce to the top. It's the only role the JD cares about."

3. **Show the number.** The agent's credibility is that it measured
   instead of guessing. Say the number.

   > ✅ "That's 3.2 pages at 11pt. Two pages is the target."
   > ✅ "Intent Coverage is 38. That's the one worth fixing."

4. **Never inflate.** This is non-negotiable and it is in the system
   prompt. It will not add a skill the user does not have, and it will
   not praise a weak bullet.

   > ❌ "Great work on that bullet — really impressive!"
   > ✅ "You wrote 'helped with the migration'. Say what you changed, or cut it — 'helped' reads as nothing."

5. **Say when it failed.** If a tool could not apply a change, say so
   plainly and ask the one question that would unblock it.

   > ✅ "I didn't apply that — there are two roles called 'Platform Engineer' and I didn't want to guess which one."

6. **Warm, not cute.** No exclamation marks, no emoji, no "you've got
   this!". The product's voice is *"self-aware, warm, never precious."*
   Warmth shows up as remembering what the user said three turns ago,
   not as cheerleading.

### Register

- **First person, active.** "I moved the payments work up."
- **Short sentences.** Three to a sentence, two to three sentences to a reply.
- **No preamble, no summary of what you're about to do.** Then do it.
- **Preserve the user's voice.** If they wrote "led", the agent writes
  "led", not "spearheaded".
- **Never mention being an AI model.** It is *the assistant*. It doesn't
  have a model name, and it doesn't apologise for being software.

### The introduction

The first thing the agent says should already be informed — the product
has a first-session analysis ready, so it opens with findings, never
with "what would you like to work on?"

> ✅ "Three things worth fixing before you send this: your Dayforce role
> is missing a start date, the summary leads with skills the JD doesn't
> ask for, and at 11pt this runs to 2.4 pages. Want me to start with
> the date?"

---

## 7. Handing the result back

### What is already built

The mark was generated from **Direction A, "The Bracket"** on 2026-10-22 and
is now implemented, not just described:

| | |
|---|---|
| Source SVGs | `public/brand/agent/nexstepper-agent-mark.svg` (two-colour) and `-stamp.svg` (monochrome) |
| Component | `components/brand/agent-mark.tsx` — inline SVG, so each part can carry its own transform |
| Motion layer | `app/agent-mark.css` — the states, the keyframes, the reduced-motion fallback |
| State vocabulary | `lib/brand/agent-mark.ts` — what each state MEANS and what causes it |
| Review surface | `/dev/design-lab/agent-brand` — every size, every state, every placement, and a filmstrip of the motion |

The **motion language** is the part that was not in the brief and is worth
knowing about: the mark has seven states, and the chat UI drives them. An
agent that is doing something should look like it is doing something — a
static avatar next to a "Thinking…" line cannot tell "reading your resume"
from "about to ask you a question" from "couldn't apply the change".

| State | What the mark does |
|---|---|
| `idle` | A halo behind the dot breathes, so it never looks frozen |
| `reading` | The brackets scan apart and back, like a gaze moving across a line |
| `verdict` | The brackets close in and the dot turns amber — a moment, not a mode |
| `working` | A radar ring pulses out of the dot. The agent is measuring, so the mark measures |
| `applied` | The dot becomes a check |
| `needs-you` | The dot slides out toward the bracket that marks the question |
| `blocked` | The brackets pull apart and the dot goes grey. It will not guess |

**The name is still open** — the shortlist above is a recommendation, not a
decision. `AGENT_DISPLAY_NAME` in `lib/brand/agent-mark.ts` is the one place
it lives; the mark does not depend on it.

### What is left to do

1. **Pick the name.** The shortlist above is a recommendation, not a
   decision. `AGENT_DISPLAY_NAME` in `lib/brand/agent-mark.ts` is the
   one place it lives, and the mark does not depend on it.
2. **Nothing else.** The mark is in the product: the floating trigger,
   the chat header, the message avatar, and the empty state, all
   driven by the agent's live state.

### The motion language, and how it is driven

The states are not decoration — they are the agent telling you what it
is doing before it says anything. The derivation is pure and lives in
`lib/brand/agent-mark.ts` (`deriveAgentState`); the one part that
cannot be pure — SETTLING, so a moment announces itself and then gets
out of the way — is `useAgentMarkState`.

| State | What the mark does | What triggers it |
|---|---|---|
| `idle` | A halo behind the dot breathes, so it never looks frozen | Nothing in flight |
| `reading` | The brackets scan apart and back, like a gaze moving across a line | A reply is streaming |
| `working` | A radar ring pulses out of the dot. The agent is measuring, so the mark measures | A tool call has been announced and its result has not arrived |
| `verdict` | The brackets close in and the dot turns amber | The turn ended with a statement — a finding or a decision |
| `applied` | The dot becomes a check | A tool reported `ok: true` |
| `needs-you` | The dot slides out toward the bracket that marks the question | The turn ended with a question |
| `blocked` | The brackets pull apart and the dot goes grey. It will not guess | A tool reported `ok: false`, or never answered |

`applied`, `blocked` and `verdict` are **moments**: they settle back to
idle on a timer. If they did not, one finding would leave the mark
amber forever and the user would learn to ignore it. `needs-you` is
deliberately not a moment — the agent is genuinely waiting for an
answer, and it stays that way until the user replies. It also survives
a page reload, because the last assistant message is the anchor, so
the mark can greet you with "waiting for you" if you never answered.

**Three surfaces, one state:** the floating trigger, the chat header,
and the avatar beside each message. The header's second line swaps the
resume name for a status while the agent is busy.

---

*Brief written 2026-10-22. Re-verify the palette against `app/globals.css`
if the tokens change.*
