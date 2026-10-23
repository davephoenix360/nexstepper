# Nexstepper — Logo Brief

**Purpose:** hand off to a design tool (MiniMax Design) to generate a minimal
logo. Every fact below is sourced from the repo, not invented — palette from
`app/globals.css`, typeface from `app/layout.tsx`, voice from
`app/(marketing)/pricing/page.tsx`, naming from
`docs/drift/2026-09-25-nextep-rename.md`.

---

## 1. What the product actually is

**Nexstepper** is an AI-assisted resume builder, web SaaS, at `nexstepper.com`.

A job-seeker keeps one **master resume**. They paste in a job description; the
app parses it into structured requirements, scores the resume against that
role's ATS rubric on four weighted dimensions, and produces a **tailored
variant** — same history, same voice, tuned to this one posting. They can then
share a public link, invite reviewers, or collaborate live.

In one line: *the step between "I have a resume" and "I have an interview."*

**What it is not:** it is not a job board, not a career-coaching service, not a
document editor. It is a focused tool that runs between the applicant and the
employer's screening software.

**Category signals to lean on:** precision, structure, score, before/after.

---

## 2. Brand facts

| | |
|---|---|
| **Name** | Nexstepper — one word. `nextep` + `stepper`. |
| **Tagline** | *Take the next step.* |
| **Tagline origin** | Regina Brett — "When in doubt, take the next step." A *stepper* is **the person who takes the next step** — the customer, not the tool. |
| **Brand voice** | Self-aware, warm, never precious. "Students-made-by-students, job-seekers-made-by-a-job-seeker." Funny, but not a meme brand. |
| **Audience** | Job-seekers — students, new grads, career switchers. People who'd "rather be interviewing than formatting." Age ~18–35. Price-sensitive, Free-tier-first, coffee-budget pricing. |
| **Tone of the product** | Calm competence. The app is doing something hard and opaque (ATS scoring) and earning trust by showing its work. |

The voice matters for the logo: this is **not** a loud, high-contrast startup
brand. It should feel like a sharp, honest tool — closer to Linear or Notion
than to a consumer app with a bouncing mascot.

---

## 3. What the product looks like today (use this)

**Typeface — Manrope.** Geometric sans, rounded terminals, slightly soft but
sharp at the same time. Loaded via `next/font/google` in `app/layout.tsx`,
applied to `body` in `globals.css`. The wordmark should be set in Manrope or a
close geometric grotesque.

**Light theme — monochrome slate:**

| Role | Value |
|---|---|
| Primary / brand ink | `hsl(222.2 47.4% 11.2%)` ≈ **#0F172A** (slate-900, cold near-black navy) |
| Foreground | `hsl(222.2 84% 4.9%)` ≈ **#020817** |
| Muted surface | `hsl(210 40% 96.1%)` ≈ **#F1F5F9** |
| Border | `hsl(214.3 31.8% 91.4%)` ≈ **#E2E8F0** |

**Dark theme — inverted:** background `#020817`, primary flips to near-white
`hsl(210 40% 98%)`.

**The only real color in the product** lives in the ATS radar chart
(`--chart-*` tokens): a warm coral `#E76E50`, a muted deep teal `#537470`, a
mid blue, an amber, an orange.

> **Design implication:** the app chrome is *deliberately colorless slate*.
> The logo is one of the only places color can live. A single restrained accent
> will carry more weight here than in a typical colorful app.

> **Correction (2026-10-22).** Two things in this section had gone stale:
>
> 1. The **primary token is now a vivid indigo**, not slate — `--primary:
>    hsl(238 84% 67%)` ≈ `#6366F1`, introduced after this brief was written
>    ("Nextep brand: vivid indigo primary — trust + modern, like
>    Linear/Vercel"). So the app is no longer strictly colourless: indigo is
>    the interactive colour, and the `--chart-*` palette is the *data*
>    colour. The line above is still true about the CHART colours, not
>    about the whole app.
> 2. The mark is **no longer a placeholder** — see below.

**The mark exists now** (added 2026-10-09). It is a **staircase**: three
ascending steps in a single thick rounded monoline stroke, near-black navy
on transparency, with the wordmark "Nexstepper" and the tagline "Take the
next step." alongside. Source files live in `public/brand/`
(`nexstepper-icon-clean.png`, `-horizontal-clean.png`, `-stacked-clean.png`)
and are rendered by `components/brand/logo.tsx`, which applies
`dark:invert` — the artwork is monochrome, so inversion is exact.

So the "greenfield" framing below is history. Two consequences still
matter for any NEW mark in this family (the AI assistant's, for instance
— see `docs/brand/agent-brief.md`):

- The brand is **geometric, monoline, rounded-terminal, monochrome**, and
  it leans on **a repeated shape** (the name contains two "step"s and a
  double "p"; the mark answers with a staircase).
- The staircase is **taken**. A new mark in this family must be a
  *sibling* of it — same stroke language, same roundness, same single
  colour — and unmistakably a different symbol.

---

## 4. Direction

**Do:**
- Build a **geometric, monoline mark** that abstracts *progress / the next
  step* — forward motion, a stepped path, an ascent, a threshold.
- Make it work at **16px favicon** and as a **single-color stamp**.
- Design the mark so it can sit alone; the wordmark "Nexstepper" can be set in
  Manrope Bold, tight tracking (-0.02em), sentence case.

**Do not:**
- **Don't draw a résumé, document, paperclip, or briefcase.** The name was
  explicitly chosen to survive future scope (reviews, collaboration, sharing) —
  a résumé-in-a-circle logo boxes the brand in. This was a documented reason
  for rejecting the name "Resumotive."
- Avoid the generic "abstract swoosh / gradient blob" AI-logo look.
- Avoid robotics, circuit-board, brain, and sparkle motifs — overused, and this
  brand is a human tool.

**A note on the name:** "Nexstepper" contains **two "step"s and a double "p"**.
A repeated shape (two steps, two points, a pair of marks) is a legitimate,
subtle motif here — not a literal staircase.

---

## 5. Prompt for MiniMax Design

> Design a minimal, professional logo for "Nexstepper," an AI-assisted resume
> builder SaaS. The product helps job-seekers keep one master resume, then
> produce a job-specific tailored version and score it against that employer's
> ATS rubric. Tagline: "Take the next step."
>
> **Mark:** a simple geometric monoline symbol that abstracts forward progress —
> the next step. Think stepped path, upward ascent, or threshold. Two to four
> strokes maximum. It must be legible at 16px as a favicon and work as a
> single-color stamp.
>
> **Wordmark:** "Nexstepper," set in Manrope Bold or a similar geometric
> grotesque, tight tracking, sentence case.
>
> **Palette:** near-black navy #0F172A as the primary, optionally with one warm
> coral accent (#E76E50). The surrounding app UI is monochrome slate, so the
> logo can carry a single restrained accent.
>
> **Correction (2026-10-22):** the delivered mark is monochrome near-black
> navy with no accent at all, and the app's interactive primary is now vivid
> indigo #6366F1 rather than slate. If you re-run this prompt, use navy
> #0F172A for the mark and treat indigo as the app's interactive colour
> rather than as a second brand colour.
>
> **Feel:** calm competence — Linear or Notion, not a loud consumer app.
> Confident and minimal.
>
> **Avoid:** résumé or document icons, paperclips, briefcases, gradients,
> swooshes, sparkle/AI-brain motifs, robots, circuit boards, and anything that
> looks generic-AI-startup.
>
> Deliver: primary horizontal lockup, stacked lockup, and icon-only version.

---

*Brief written 2026-10-08. Re-verify palette against `app/globals.css` if
tokens change.*

*Corrected 2026-10-22: the mark now exists (a staircase, added
2026-10-09) and the primary token is now vivid indigo. See §3 and §5 for
what changed and what still holds. The AI assistant's own mark is briefed
in `docs/brand/agent-brief.md`.*