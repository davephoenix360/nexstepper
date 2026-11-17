# Drift — "Rewrite with AI" never opened: the editor's path spelling

Date: 2026-11-17
Branch: `main`

## What prompted this

The founder, on the scoring work: *"we don't have too good of a
communication of like, what a user can do to improve a particular
score. So like for example the rewrite with AI that we put beside the
score dimensions. Even clicking that doesn't actually rewrite with AI.
You can check the functionality we currently have."*

(The founder also confirmed the launch video is out of scope — it was a
test of the flag functionality.)

## The bug

**Every dimension bar's "Rewrite with AI" was dead.**

The editor binds every field with a **dotted** path — the Classic
template's `WorkPositionsNested` confirms it:

```
sections.work.${i}.positions.${j}.highlights.${k}
```

and renders `data-testid="editable-{path}"`.

The inline-issue surface handed it the **bracketed** JSON-Resume
spelling:

```
sections.work[0].positions[0].highlights[0]
```

which no template ever renders. So:

| step | what happened |
|---|---|
| `readLeafText(path)` | `[data-testid="editable-sections.work[0]…"]` → **no element** → `''` |
| `buildSuppressionNotice` | `hasTarget` true, `text` empty → **"The bullet here is empty — add some content to this section first, then we can rewrite it."** |
| `form.setValue(path, text)` | would not have matched the RHF field either — **the write went nowhere** |

The user was told their bullet was empty when it was full, and the
rewrite could not have landed even if the popover had opened. Three
breakages from one wrong spelling.

The `extractBulletIndex` regex had the same defect from the other
side — it matched only `.field[N]`, so every real path produced
`bulletIndex: null` and the popover could not highlight the line it
was about to replace.

## The second defect: the target was the wrong leaf

Underneath the spelling bug, the mapping itself was wrong. Almost every
criterion pointed at the first work bullet — including the criteria
that measure something else entirely:

| Criterion | What it measures | Was | Now |
|---|---|---|---|
| ATS Keyword Match | missing keywords | first work bullet | **the skills block** |
| Intent Coverage | missing must-have skills | first work bullet | **the skills block** |
| Role Fit | the JD title vs the candidate's titles | first work bullet | **the headline** |
| Tailoring | the JD title's vocabulary in the summary | first work bullet | **the summary** |
| Seniority Fit | years of experience | position title | **the summary** |
| Unique Value | distinctive content | first work bullet | **the first project** |
| ATS Coverage / Accomplishment Focus / Action Verb Usage / Soft Skills | bullet-level | first work bullet | unchanged (correct) |
| Section Completeness / Optimal Length | structural | position title | unchanged |

Rewriting a work bullet cannot move a dimension that reads the
headline. And since 2026-11-17 Role Fit reads `basics.label` at all —
so the dimension bar was rewriting a work bullet while the number next
to it was computed from the headline.

## The fix

- `defaultPathForCriterion` and `defaultPathForSkill` return **dotted**
  paths, and each criterion points at the leaf it reads.
- `extractBulletIndex` accepts both spellings (`.field.N` and
  `.field[N]`), so the popover highlights the right bullet.

## The anti-drift test

`tests/unit/inline-issue/criterion-paths.test.tsx` renders a REAL
template and asserts that every criterion's path exists as an
`editable-` testid in the DOM. That is the test that would have caught
this — it fails on the old spelling.

It also pins the target: Tailoring and Seniority Fit → the summary,
Role Fit → the headline, the skill criteria → the skills block.

## Why it matters beyond the popover

The path is used in three places, and all three were broken by the
same spelling:

1. `readLeafText` — the text the popover shows.
2. `mapPathToSection` — which section to scroll to, and which bullet
   to highlight.
3. `dispatchInlineIssueApply` — `form.setValue(path, text)`, the write
   that puts the rewrite back into the resume.

So the surface was not "the rewrite is slow" or "the rewrite is
imprecise". It never opened.

## Also fixed in this pass

The **soft-skills tip** used a literal `haystack.includes(phrase)`
check while the score used the variant-aware matcher. So a resume that
wrote "collaboration" was told it was missing "collaborated" — advice
the candidate should not act on, contradicting the number next to it.
The tip now reads the score's answer.

---

# Part 2 — The advice was generic, and only appeared when the score was bad

Fixing the popover makes the surface work. It does not make it
*useful*, which was the other half of the founder's report: *"we don't
have too good of a communication of like, what a user can do to improve
a particular score."*

Three of the thirteen criteria had **no dynamic tip at all** — only a
static, generic line:

| Criterion | The static tip said | Now it says |
|---|---|---|
| Role Fit | "Make sure your resume's titles and summary match the job title." | "This role asks for **Senior Backend Engineer**. Your headline reads **Senior Frontend Engineer**. The headline is the first thing they see — make it name the role you're applying for." |
| Unique Value | "Highlight what makes you different: awards, certifications, notable projects." | "Your resume lists no **projects, awards or publications** — the only things that show you do more than the job description asks. Add one project you built…" |
| Seniority Fit | "Match the role's seniority level — if the job asks for a senior title, make sure your experience shows it." | "This role asks for **5 years** of experience; your resume shows **2** — **3 years short**. Make your earliest role count…" |

And two tips only appeared when the score was *bad*, so a mediocre
score got the generic static copy instead of the specific advice:

| Criterion | Old threshold | New |
|---|---|---|
| Tailoring | only below 30 | below **80** |
| ATS Similarity | only below 70 | below **80** |

A summary at 45 ("similar to the job title") is plainly improvable,
and the specific tip names the words to mirror — advice to a category
is not.

### The Seniority Fit tip needed the score's numbers

The years are already measured — `SeniorityFitResult` carries
`resumeYears`, `jdYearsMin` and `gap`. They just were not in the
breakdown, so the tip could only speak in generalities.

They are now in the breakdown (`breakdown.seniorityFit`), and the tip
quotes **them**. Not a second computation of the same thing: two
computations of one thing is one too many, and when they disagree the
tip and the number beside it contradict each other — which is exactly
the bug class this whole session has been closing.

The field is optional, because score snapshots are persisted: a
snapshot written before this change has none, and the tip falls back
to its static copy.

---

# Part 3 — Telling the candidate WHICH one to fix first

Seven bars, in a fixed order, is an order of layout — not an order of
opportunity. A candidate looking at "Keywords 54, Impact 62, Role fit
92" cannot tell which bar is worth their afternoon.

The measure is **recoverable points**:

```
recoverable = weight × (100 − dimensionScore)
```

The weight is the part that matters. A dimension at 50 that carries
21% of the score is worth more than one at 50 that carries 10%, so
ranking by the raw score would point the candidate at the wrong bar.

The scorecard now renders a **"Start here"** line under the radar,
above the bars, so it is read *before* the seven numbers:

> **Start here: Keywords** is at 40/100 and carries 21% of your score
> — worth up to 12.6 points.

Clicking it opens the same surface as clicking that dimension's bar,
so "here is where to start" and "here is how to start" are one click
apart.

**"Up to"** because that is the honest ceiling: it assumes the
dimension could be made perfect, which it may not be.

### The weights had to move to be readable

The weights lived in `lib/scoring/score.ts`, and importing them from
the client component would have pulled the whole scoring engine into
the browser bundle. They now live in `lib/scoring/weights.ts` — one
source of truth, two consumers — and `score.ts` re-exports them so
the public surface is unchanged.

### Two rules the ranking follows

- **Never offer a dimension the engine is not using.** Under the v1
  weight set the three v2 dimensions carry zero, so a broken Role Fit
  is not offered as a win — the engine is not reading it.
- **Never offer a win when there is nothing to fix.** A resume at 100
  across the board gets no "Start here" line.

---

# Part 4 — The chat agent now gives the SAME advice the scorecard gives

The founder's report had a second half I had not yet acted on:

> *"So ideally this kind of thing like suggestions is what our AI chat
> agent is meant for the user."*

The advice they quoted —

> *Experience · 10 of 29 work bullets describe a task rather than an
> outcome (Building Launchpad…; Conducted a personal audit…; Designed a
> discounts API…). Say what changed, not just what you did.*

— was the **scorecard's** tip. The chat agent never saw it.

## The gap

The chat's ATS context block (`buildAtsContext`) gave the agent the
dimension NUMBERS:

```
contentQuality: 68
```

and nothing else. So when a candidate asked the chat *"how do I improve
my Impact score?"*, the agent had to **improvise** the advice from a
number — while the scorecard beside it was naming the exact bullets to
change.

Two surfaces, one question, two answers. And the chat's answer was the
invented one.

This is the same defect class as everything else this session: **a
surface that could see the numbers but not the findings.**

## The fix

The tips are rendered from the scorecard's own tips and handed to the
agent as plain text:

```
What to fix (the scorecard shows this — quote it, do not improvise):
  • Accomplishment Focus: 10 of 29 work bullets describe a task rather
    than an outcome (Building Launchpad…; Conducted a personal audit…).
    Say what changed, not just what you did.
  • Role Fit: This role asks for Senior Backend Engineer. Your headline
    reads Senior Frontend Engineer.

Start here: Impact is at 68/100 and carries 21% of the overall score —
worth up to 6.7 points. Recommend this one first.
```

Both the system prompt (`buildAtsContext`) and the `getAtsScore` tool
now carry it. The tool's version matters too: the agent calls it to
**measure its own edits**, and without the advice it could see that the
number went up but not what to do next.

### One source of truth

`lib/scoring/tips-text.tsx` renders the tips the scorecard renders —
it does not re-derive them. So the advice cannot drift between the two
surfaces.

It lives in its own module because `react-dom/server` must not reach a
client bundle, and `lib/scoring/tips.tsx` is imported by client
components.

### The "Start here" line

The chat gets the same **recoverable-points** ranking the scorecard
shows, so the agent and the scorecard point at the same bar. Ranking by
the raw score would have sent the agent to the wrong one.

## The lesson

**A surface that can see the numbers but not the findings is a surface
that will improvise.** Every surface that reports a score needs the
*findings* too — the specific bullets, keywords and sections — or it
will answer a question the score already answered, worse.

And: **"make it better" is not advice.** Every tip now names the
specific thing that is wrong and the specific edit that fixes it.




---

# Part 5 — The popover now opens on a bullet the advice names

Found in the founder''s own screenshot: the Impact advice named three
specific bullets —

> *10 of 29 work bullets describe a task rather than an outcome
> (Building Launchpad…; Conducted a personal audit…; Designed a
> discounts API…)*

— while the popover anchored to **bullet #1**, which is not one of them.
In that resume the first bullet is a *good* one. So the AI rewrite could
rewrite a line the advice never mentioned.

## Why it was hard

The advice names bullets by their index in a **flattened** list, and a
flattened index does not say which bullet it is:

```
work[0].positions[0].highlights[0]
work[0].positions[0].highlights[1]
work[0].positions[1].highlights[0]   ← all index 0, 1, 2…
```

So the fix is to keep the coordinates. `lib/scoring/highlight-paths.ts`
collects the bullets with the editor path that addresses each one, in
the same order as the engine''s flattened list — and the alignment is
pinned by a test that asserts the advice''s list and the path''s list are
identical, index for index.

The breakdown''s `jevBullets` are already aligned to that list
positionally, so an index maps straight back to its bullet. The Impact
row now anchors to the first bullet Jev judged below the
"accomplishment with a result" bar — **the same < 1.5 threshold the tip
uses**, so the popover opens on a bullet the tip lists.

It falls back to bullet #1 when there is no weak bullet, when the
resume was not passed, or when the index is out of range — never to a
path that does not exist.

## The lesson

**Advice and action must name the same thing.** A tip that says "these
three bullets" and a button that rewrites the first one are two
different conversations about the same resume.

The generalisation: **when a surface names specific items, the action it
triggers must target one of those items.** The index alone is not an
identity.
---

# Part 6 — The popover now says WHY, not just how

The last piece: the popover showed the bullet and three rewrites with no
explanation. So the REASON lived somewhere else — the inline tip at the
bottom of the editor — and the user had to read two places to answer
"why is this bullet flagged?".

The popover is where the rewrite happens, so it is where the reason
belongs. The controller already received the scorecard''s `dynamicTips`
(they were destructured as `_dynamicTips` — accepted and ignored); they
are now used, and the popover renders the criterion''s tip above the
bullet it is about.

So the whole click now reads as one conversation:

    AI rewrite · Accomplishment Focus
    10 of 29 work bullets describe a task rather than an outcome (…)
    "Maintained the internal dashboard used by the support team"
    [three rewrites]   Apply / Regenerate

It is the SAME tip the scorecard and the chat show, so the three
surfaces cannot disagree about what is wrong.

### On whether to keep the rewrite at all

The founder asked whether the modal should stay, or whether the click
should just show what to do. The answer this session landed on: **the
click''s payload is the ADVICE; the rewrite is the option.** The advice
is now in three places (scorecard, chat, popover) and the rewrite is one
button away from the reason it exists — which is the state that makes
the rewrite worth paying for.

The rewrite stays. It is a Pro feature at the highest-intent moment in
the product: the user has just been told exactly what is wrong and
where.