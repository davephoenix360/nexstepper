# The scorecard's tips were answering a different question than its score

**Date:** 2026-11-02
**Surface:** the scorecard's sub-criteria tips (every variant with a JD)
**Trigger:** a real user — score 49, and "no way to see how to improve it"

## The case

A candidate's variant, scored against a pasted *Field Engineer I (Entry
Level Only)* posting at Weatherford in Edmonton:

| dimension | score | | criterion | score |
|---|---|---|---|---|
| ATS Matching | **20.3** | | ATS Keyword Match | **13.7** |
| Content Quality | **37.6** | | ATS Coverage | **0** |
| Alignment | 33.3 | | Tailoring | **0** |
| Role Fit | 50 | | Soft Skills | **16.7** |
| Seniority Fit | 50 | | Accomplishment Focus | **25.8** |
| Structure | 88.1 | | Action Verb Usage | 53.2 |
| Intent Coverage | **100** | | ATS Similarity | 40 |

He could see the numbers. What he could not see was a **route from 49 to
something higher** — which is what the product promises and what the
scorecard is for.

## What was actually wrong

Five findings, from the resume data, the JD, and three persisted score
snapshots. **Four of the five are the same bug**: the tip and the score
are two readings of one value, computed by different rules, so they can
contradict each other.

### 1. The Intent Coverage tip contradicted the Intent Coverage score — in every snapshot

The score said **100, nothing missed**. The tip under that same number
said:

> Missing 4 must-have skills: English language proficiency (written and
> spoken), Strong communication and interpersonal skills, Ability to
> analyze complex problems (+1 more).

The resume's summary says *"Fluent in English Language, with a high
CELPIP score"* and *"Proven record of critical thinking to make informed
decisions"*. Two of the three named gaps were **demonstrably covered**.

**Cause.** The score asks a SEMANTIC question — "does the resume
demonstrate this?", answered by Jev's evidence score. The tip asked a
LITERAL one — `!resumeTextLower.includes(skill.toLowerCase())`, a
whole-phrase substring test. So "English language proficiency (written
and spoken)" was "missing" because the resume said *"Fluent in English
Language"* instead.

**Consequence.** The user was told to add skills he already had. It is
the worst kind of advice: it reads as a real gap, it is not, and acting
on it means writing something he does not need to write.

**Fixed.** The tip now renders the score's own miss list
(`IntentCoverageBreakdown.missed`). One source of truth; the two cannot
disagree.

### 2. The keyword tip told him to add words already on his resume

> Add these missing keywords from the JD: **field, entry, edmonton, ab**
> (top 3 of 302).

`edmonton` and `ab` are on his resume: `basics.location.city =
"Edmonton"`, `region = "AB"`, and every work entry's location is
"Edmonton, AB".

**Cause.** The tip's presence test used the engine's **scored** text,
which deliberately excludes locations (a city is not a skill). The tip
claims a word is "missing from your resume", so its test has to look at
the resume — including the location.

**Fixed.** The tip's flattened text now includes the location. Verified
against the production snapshot: the tip went from `field, entry,
edmonton, ab` to `field, entry, canada` — the two words he already had
are gone.

### 3. "ATS Coverage: 0" is not a failure — it was never measurable

`jobContext.requirements` and `niceToHaves` are **empty** for a pasted
JD (the variant editor stores the posting as raw text in
`jobContext.description` and leaves the structured arrays empty). And
`computeCoverageScore` returns 0 for an empty requirements list.

So ATS Coverage is **structurally 0** for every pasted JD — not because
his resume missed anything, but because there was nothing to measure
against. And the scorecard showed it as a `0` next to real scores, and
`match_breakdown` pointed his **first bullet** at it with the highest
weight of any row (0.97) — telling him to fix his best bullet for a
criterion that can never move.

**Not fixed here.** The fix needs a "not measured" state in the
breakdown and the scorecard UI, and a decision about whether the ATS
dimension should re-parse a pasted JD. Queued.

### 4. The Jev keyword path was inert for this JD

The breakdown carries `jevRequirements` only when Jev found at least one
**genuine skill, tool or technique** in the posting. For this JD it
found none, because every requirement is either a gate or a soft skill:

| JD requirement | what it is |
|---|---|
| Bachelor's degree in engineering | an eligibility **gate** |
| English language proficiency | a soft skill |
| Strong communication and interpersonal skills | a soft skill |
| Ability to analyze complex problems | a soft skill |
| Passion for hands-on work | a soft skill |

That is Jev being right. But it meant the product fell back to the
legacy token path, and the legacy path counts the posting's **boilerplate**
— 302 "missing keywords" for a candidate who has every skill the job
actually asks for.

**Partly fixed.** The two words he demonstrably had are gone (finding 2).
The rest — "entry", "canada" — is job-posting metadata still counted as
a resume keyword. Excluding a posting's own location/company/level
wording from the tip's vocabulary is queued; doing it in the **score**
too is a scoring change and needs the margin math re-run.

### 5. Two tips named no usable words at all

- *"BM25 similarity is 40/100 — your wording differs from the JD. Try
  paraphrasing your bullets to use the same vocabulary as the posting."*
  — names zero words.
- *"Your summary is 0% similar to the job title. Try mirroring these
  title keywords in your summary: **field**."* — names one.

And *"13 of 13 work bullets describe a task rather than an outcome"* is
advice this candidate **cannot take**: a RE/MAX event-staff and lawn-care
role has no metric to report. Telling him "say what changed" when there
is no measurable change is a dead end, and "13 of 13" makes it feel like
a failure rather than a gap.

**Not fixed here.** This is the design problem underneath the user's
actual request: the scorecard is eight criteria with parallel tips, not
a ranked list of **moves**. Queued.

## What was fixed, and verified against his own snapshot

| | before | after |
|---|---|---|
| Intent Coverage | "Missing 4 must-have skills: English language proficiency…" | *(no tip — the score says nothing is missing)* |
| ATS Keyword Match | "…field, entry, **edmonton**, **ab** (top 3 of 302)" | "…field, entry, canada (top 3 of 300)" |

Both verified by re-rendering the tips from the **persisted production
snapshot** — the same three score records and the same resume — and
diffing the output.

## The lesson

**A scorecard that shows a score without a route is a report, not a
tool.** The numbers were right; the advice was not, and advice is what
the user came for.

And the mechanism behind four of the five findings is the one this
codebase already knows: **two surfaces, one value, computed
differently.** The list badge and the scorecard disagreed about the ATS
number (`docs/drift/2026-10-23-list-score-badge-divergence.md`). The
same failure, one layer down: the tip and the score disagree about
which skills are missing. The fix is the same one — *one helper called
by both surfaces, so they agree by construction* — and the same guard:
**a test that asserts the two agree**, not a test that asserts each
computes its own answer.

The three existing Intent Coverage tip tests pinned the old behaviour —
they asserted that the tip recomputes the miss list from the JD. They
were not wrong about the code; they were wrong about what the code
should do, and they would have kept the contradiction alive. That is
the cost of testing a behaviour rather than a contract.

## Queued

1. **"ATS Coverage: 0" must not be displayed as a failure.** It needs a
   measurable/unmeasurable state in the breakdown and the scorecard UI.
2. **Job-posting metadata is not a resume keyword.** Exclude the
   posting's own location, company and level wording from the keyword
   tip's vocabulary. Whether to exclude them from the *score* as well is
   a scoring change and needs the margin math re-run.
3. **The real ask: a ranked list of moves, not eight criteria.** Each
   with what to change, where, and what it would be worth. The
   `match_breakdown` already carries per-path weights; the surface
   around it is what is missing. This is the piece that needs the
   candidate's actual resume and JD to design against — which is why
   they were sent.
