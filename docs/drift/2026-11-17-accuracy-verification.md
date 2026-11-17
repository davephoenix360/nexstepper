# Drift — The accuracy audit: what the engine measures, and how well

Date: 2026-11-17
Branch: `main`

## What prompted this

The founder: *"focus on fixing the scoring system now, to make sure
everything is working as appropriately, and then we'll move on to
improving the communication we give to the user."* And: *"after, we
verify that it's actually working well."*

Two things were asked for, and this memo is both:

1. **Is the scoring system accurate?** — measured, not asserted.
2. **Does it actually work?** — verified against production.

(The launch video was explicitly dropped from scope: *"that was just
like a test for me to see how that flag functionality works."* The
"Rewrite with AI" affordance is a communication issue and belongs to the
next phase — see §"Not in scope".)

---

## Part 1 — The instrument: a dimension-spread audit

Three dimensions in a row read as "measured" while measuring nothing
(Role Fit, Seniority Fit, ATS Similarity). The tell in all three was the
same: **a constant, or a near-constant, number**. A dimension that
cannot move cannot be wrong, and therefore cannot be right.

So the check is mechanical: score the 50-entry validation corpus and
print every dimension's **spread**. A dimension with a tiny range, or
with only a handful of distinct values across 50 real resume/JD pairs,
is not measuring the candidate.

`scripts/probe-dimension-variance.ts` (**`pnpm probe:dimension-variance`**).

The run that started this (before the fixes below):

| Dimension | min | max | spread | mean | sd | distinct |
|---|---|---|---|---|---|---|
| atsMatching | 9 | 79 | 71 | 61 | 16 | 50 |
| structure | 70 | 80 | 10 | 73 | 2 | 45 |
| contentQuality | 33 | 89 | 56 | 62 | 14 | 27 |
| alignment | 0 | 87 | 87 | 40 | 22 | 23 |
| intentCoverage | 48 | 100 | 52 | 82 | 16 | 24 |
| roleFit | 10 | 97 | 87 | 64 | 27 | 24 |
| seniorityFit | 25 | 100 | 75 | 95 | 16 | 4 |

and the leaves:

| Criterion | min | max | spread | mean | distinct |
|---|---|---|---|---|---|
| ATS Keyword Match | 5 | 66 | 60 | 44 | 45 |
| ATS Similarity | 10 | 100 | 90 | 92 | 36 |
| ATS Coverage | 17 | 100 | 83 | 83 | 7 |
| Section Completeness | 100 | 100 | **0** | 100 | **1** |
| Optimal Length | 40 | 61 | 21 | 47 | 44 |
| Accomplishment Focus | 33 | 100 | 67 | 74 | 12 |
| Action Verb Usage | 0 | 80 | 80 | 47 | 13 |
| Tailoring | 0 | 100 | 100 | 63 | 6 |
| Unique Value | 0 | 100 | 100 | 22 | **2** |
| Role Fit | 10 | 97 | 87 | 64 | 24 |
| Seniority Fit | 25 | 100 | 75 | 95 | 4 |
| **Soft Skills** | 0 | **33** | 33 | **11** | **5** |

## Part 2 — The defect: Soft Skills matched ONE spelling of each skill

**Soft Skills maxed at 33 out of 100 across 50 real resumes**, with only
5 distinct values. A criterion that cannot reach its own scale is not
measuring the candidate.

The cause: the matcher was a **literal substring** match against a
fixed phrase list, so every phrase had exactly one accepted spelling.

| Phrase | Matched | Did NOT match |
|---|---|---|
| `collaborated` | "collaborated" | **"collaboration", "collaborative"** |
| `mentorship` | "mentorship" | **"mentored", "mentoring"** |
| `analytical` | "analytical" | **"analysis", "analyse"** |
| `communication` | "communication" | "communicating" |
| `negotiation` | "negotiation" | "negotiated" |
| `presentation` | "presentation" | "presented", "presenting" |
| `cross-functional` | "cross-functional" | **"cross functional"** |
| `leadership` | "leadership" | "leader", "leading" |

Measured on the corpus, by how many resumes mention the skill in a form
the matcher misses:

```
11 of 50 resumes   wrote "analysis" / "analytically"
 7 of 50 resumes   wrote "mentored" / "mentoring"
 3 of 50 resumes   wrote "collaboration" / "collaborative"
 1 of 50 resumes   wrote "presented" / "presenting"
```

**A resume that demonstrates collaboration by writing "collaboration"
was not credited for it.** That is the same defect class as the ISO-only
date parser — the matcher accepts the formats it was written against,
not the formats people use.

### The fix

`SOFT_SKILL_VARIANTS` (`lib/scoring/dictionaries.ts`) lists the
inflections per phrase. The rule is narrow on purpose: **a variant is a
surface form of the same phrase, not a synonym for it.** Every variant
list contains the literal phrase, so a phrase can only ever GAIN
matches — a test pins that contract, so the change can never make a
score worse.

The variant matcher also caught a bug in its own first draft:
`analyt` does **not** match "analysis" (English spells it *analys* for
the noun and *analyz* for the verb), so the list carries
`analyt` + `analys` + `analyz`. The test that pinned this used the real
word "analysis" and failed — the same lesson as the date parser, from
the other direction.

Measured after:

| | before | after |
|---|---|---|
| Soft Skills average | 11 (12.0%) | **16 (16.2%)** |
| Soft Skills max | 33 | **58** |
| Soft Skills distinct values | 5 | **8** |
| Alignment max | 87 | **90** |
| **Pearson r vs the hand-labelled corpus** | 0.9136 | **0.9183** |

(The corpus correlation is measured, not asserted: `pnpm
probe:dimension-variance` prints it, and ADR 0005's gate is r > 0.7.)

## Part 3 — The gap: the corpus validated the ENGINE, not the PRODUCT

`tests/unit/scoring/validation-corpus.test.ts` — the repo's accuracy
gate — scores the corpus with the **SYNC** engine.

Production runs the **HYBRID** engine, which is the sync engine plus
the hybrid similarity (BM25 + MiniLM embedding) and Jev's two AI
evaluations.

**So the corpus never validated the scorer the product actually runs.**
And that is exactly the gap that let the semantic signal be silently
ZERO in production for months while the corpus stayed green
(`docs/drift/2026-11-16-role-fit-and-the-silent-semantic-signal.md`).

`scripts/probe-hybrid-correlation.ts` (**`pnpm probe:hybrid-correlation`**
) closes the deterministic half of that gap: it substitutes the hybrid
similarity into the sync engine's composition — precisely what
`score-hybrid.ts` does — and measures the correlation again.

| | Pearson r vs the hand-labelled corpus |
|---|---|
| sync engine (what the corpus gate validates) | 0.9183 |
| **production similarity signal** | **0.9186** |
| production WITH Jev (pinned measurement, 2026-10-23) | **0.9472** |

The production signal is at least as accurate as the one the corpus
validates, and the mean score shift it causes is **−0.24 points**
(biggest: 1.03) — so it refines the score without destabilising it. The
Jev path is separately measured (classification AUC **0.923**) and
*pinned offline* in `tests/fixtures/jev-corpus-measurements.json`, so
the full production scorer is the **most** accurate variant — and the
one the corpus least directly exercised.

## Part 4 — Production verification

Read-only (`scripts/diagnose-prod-score.ts`, SELECT only). The
founder's own production resume and its live JD:

| | Overall | Keywords | Format | Impact | Exp. match | Intent | Role fit | Seniority |
|---|---|---|---|---|---|---|---|---|
| **Stored snapshot in production** | **79** | 81 | 56 | 68 | 83 | 95 | 92 | 100 |
| **This checkout** | **83** | 90 | 55 | 68 | 87 | 100 | 100 | 100 |

Every delta is one of this session's fixes: the keyword score moved
because the evidence-bearing fields are readable and the eligibility
vocabulary no longer charges for "bachelor's degree"; Role Fit moved
because the headline is compared; Intent Coverage moved because a
qualification is findable in the resume now; Experience match moved
because a soft skill written as "collaboration" counts.

**Format went DOWN by one point** (56 → 55) and that is worth
explaining rather than hiding: the "Optimal Length" criterion measures
the scored text, and the scored text is now bigger. That resume is
**1,533 words** (`pnpm probe:length-drift`) — genuinely more than three
pages — so the criterion is right and the resume is long. The old
flatten measured 1,533 − 15 = 1,518, so this change moved it by 0.15
points; the criterion was already punishing this resume, and now it
counts every word of it.

## Not in scope (and why)

- **The launch video.** Dropped by the founder — it was a flag test.
- **The "Rewrite with AI" affordance.** Checked: the wand beside a
  dimension bar is *inside* the row button, and clicking it opens the
  inline-issue popover (which carries the rewrite action for Pro). So
  it is not a dead button — it is a button whose label promises a
  direct action and delivers a popover. That is exactly the
  communication problem the founder deferred to the next phase, and
  fixing it properly means redesigning what the scorecard tells a
  candidate, not patching a click handler.
- **The 500–800 word sweet spot.** Measured (corpus resumes land at
  40–61 on it) but it is a product decision with no ground truth to
  calibrate against; changing it would be a guess. Left alone, written
  down.

## The instrument is now part of the repo

```bash
pnpm probe:dimension-variance    # every dimension's spread + the corpus correlation
pnpm probe:hybrid-correlation    # is the PRODUCTION signal as accurate as the validated one?
pnpm probe:soft-skill-variants   # the surface-form loss, measured
pnpm probe:length-drift <id>     # the length criterion's calibration drift
pnpm probe:field-coverage        # which fields move the score
pnpm probe:role-fit-titles       # Role Fit's title set
pnpm probe:eligibility-vocabulary # the degree-gate charge
pnpm measure:demo-score          # the demo fixture
```

All offline; the production ones are SELECT-only.

## The lesson (recurring trap #11 in AGENTS.md)

**A dimension's range is evidence.** A criterion that maxes at 33 across
50 real resumes is not a weak signal — it is a broken matcher. Measure
the spread, not just the mean.

**And the matcher question is always the same:** *what forms does a
real user write?* Three times this month the engine accepted exactly
one form of something (ISO dates, one job title, one soft-skill
spelling) and silently charged the candidate for the other forms.

---

# Part 6 — The accuracy record had stopped describing the engine

The accuracy record — `tests/fixtures/jev-corpus-measurements.json` — is
how the repo knows the engine is accurate. The offline test reads it as
a committed fact.

But it asserts the FIXTURE''s internal consistency, not that the fixture
still describes the app. So when the engine changed, the record silently
became a description of an engine that no longer existed.

Measured on 2026-11-17 (`pnpm probe:jev-fixture-drift`):

```
fixture recorded at          : 2026-10-23
entries the engine moved     : 17 of 50
largest move                : 1 point
correlation in the fixture  : 0.9103
correlation NOW             : 0.9156
```

The record was a month stale. Its CONCLUSIONS still held (the Jev path
still beats the token path), but its per-entry numbers described an
engine that no longer shipped — and nothing flagged it.

## The good news: the refresh is free

The fixture stores Jev''s evaluation (`lines`, `requirements`, `gates`,
`scorable`, `bullets`). That evaluation is an INPUT to the score, not an
output of it — so re-scoring with the stored evaluation needs **no AI
call, no gateway credit and no network**.

So the record splits cleanly:

| Half | Describes | Refreshed by |
|---|---|---|
| MODEL — AUC, pSkill means, evidence means | the model and the JD''s requirement lines | `MEASURE_JEV=1` (needs the AI) |
| ENGINE — overall scores, correlations, MAE, control agreement | the engine | `pnpm refresh:jev-fixture` (free) |

And the ENGINE half now has a GUARD: `tests/unit/scoring/
jev-fixture-current.test.ts` re-scores the corpus with the current
engine and fails if the record disagrees — with the command to fix it
in the message. Perturbing one entry by one point makes it fail, so it
is a real guard and not a tautology.

After the refresh:

```
correlation  sync 0.9103 → 0.9156
correlation  jev  0.9472 → 0.9480
MAE          sync 13.40 → 13.34
control agreement 0.9173 → 0.9212
```

The engine changes made it MORE accurate, and the record now says so.

## The lesson

**An accuracy record is not evidence unless something asserts that it
still describes the code.** The same shape as every other drift this
repo has found: two lists that must agree, and nothing asserting that
they do.

And the difference worth remembering: **a measurement can be cheap to
repeat.** The AI half needs the gateway; the engine half does not. So
the part of the record that tracks the code — the part that actually
goes stale — can be re-derived on every engine change, for free.
---

# Part 7 — The JD''s requirement bullets never reach the engine

Found while checking whether the Jev model half of the accuracy record
was stale (it is NOT — the app still pins `jev-1.14.0`, the same model
the fixture was measured with; that now has its own guard).

## The measurement

`scripts/probe-jd-envelope-fields.ts` (SELECT only) asks production
which JD envelope fields are actually stored:

```
  Test Resume 1 — Variant
    requirements     : 0 item(s)
    niceToHaves      : 0 item(s)
    mustHaveSkills   : 10 item(s)
    niceToHaveSkills : 4 item(s)
    description chars: 3434
```

Every variant: `requirements` 0, `niceToHaves` 0. The JD''s requirement
bullets live ONLY inside the raw `description` text (3.4k–6.5k chars).

## What reads the empty field

| Reader | Effect in production |
|---|---|
| ATS matching''s `coverageScore` | SKIPPED — the weights re-normalise to keyword 0.75 / similarity 0.25 ✓ graceful, documented |
| the "ATS Coverage" TIP | can never fire → the **Keywords bar** showed generic static advice |
| `jobEligibilityGates` | finds no gates there — but it now reads the skill lists too, which is why the degree gate works at all |

## Same defect class as the missing JD title

The attach paths build the envelope from the raw text and never write
the structured fields the engine and the UI read. The JD title was
fixed on 2026-11-16 by having the extractor return it; the requirements
list is the same bug in a second field.

## What is done

The Keywords bar now falls back to the **keyword** tip — which names
the actual missing tokens and DOES work in production — instead of the
coverage tip that can never fire. Extracted as `keywordsBarTip()` so
the selection is testable (the tip renders inside a Radix tooltip, which
does not appear in static markup).

## What is NOT done, and why

Whether to REVIVE the coverage sub-criterion (wire the requirement
bullets into the envelope) or RETIRE it (let the v2 Intent Coverage
dimension be the one that measures requirement coverage) is a design
decision, not a bug fix:

- Reviving it means the ATS dimension carries a coverage term AND the
  Intent Coverage dimension carries one — **the same measurement
  counted twice** in the overall score.
- Retiring it means removing a persisted `criteriaScores` key.

Either way the JD''s requirement bullets should stop living only in the
raw prose — that is the part that is unambiguously wrong.
---

# Part 8 — End-to-end: the advice reaches the agent on real data

The unit test proves the prompt BUILDS correctly. It does not prove the
production path puts the right inputs in — the resume, the job context
and the persisted score are three separate reads, and any one of them
can be wrong (a stale snapshot, a job context without a title, a score
from before the last edit).

So: read the real rows, build the real prompt, print the ATS section.
(SELECT only; a one-off vitest run against the prod database, because
`lib/chat/system-prompt.ts` is `server-only` and cannot be imported by a
plain script.)

The founder''s own CleerDental variant, verbatim from the prompt the
agent receives:

```
=== ATS SCORE (latest, vs current JD) ===
Overall match: 66 / 100

Dimension scores (0-100, sorted by strength):
  structure        100
  intentCoverage    87
  contentQuality    70
  atsMatching       66
  roleFit           50
  seniorityFit      50
  alignment         32

Top missed keywords / skills (priority order):
  x MUST-HAVE missing (1): Customer understanding
  ~ nice-to-have missing (2): Voice AI, Healthcare data

What to fix (the scorecard shows this - quote it, do not improvise):
  - ATS Keyword Match: These requirements from the JD are not evidenced
    in your resume: Voice AI, Healthcare data.
  - Intent Coverage: Missing 1 must-have skill: Customer understanding,
    plus Missing 2 nice-to-haves: Voice AI, Healthcare data.
  - ATS Similarity: BM25 similarity is 40/100 - your wording differs
    from the JD. Try paraphrasing your bullets to use the same
    vocabulary as the posting.
  - Accomplishment Focus: 4 of 9 work bullets describe a task rather
    than an outcome (Building Launchpad, a new internal tool in
    TypeScript (React + ASP.NET Core)...; Designed a discounts API
    end-to-end (payload schema, optimized SQL extraction, caching
    strategy)...; Applied LLM application best practices...). Say what
    changed, not just what you did - the effect, the result, the thing
    that got better.
  - Action Verb Usage: 1 of 9 bullets open weakly or passively (Worked
    in Agile team sprints with iterative builds, peer reviews, and
    engineering feedback; improved delivery consistency through tighter
    Git workflows...). Lead with what you did - Built, Led, Scaled, Cut,
    Launched.
  - Tailoring: Your summary is 0% similar to the job title. Try
    mirroring these title keywords in your summary: swe, cleerdental.
  - Role Fit: This role asks for SWE CleerDental. Your headline reads
    Software Engineer. The headline is the first thing they see - make
    it name the role you''re applying for.
  - Soft Skills: Your resume is missing leadership, collaborated,
    communication, and stakeholder mentions - add them with concrete
    examples.

Start here: Experience match is at 32/100 and carries 14% of the overall
score - worth up to 9.6 points. Recommend this one first.
```

Every number in there came from the persisted snapshot, every sentence
from the same tip builder the scorecard uses, and the ranking is the
same recoverable-points measure the scorecard's "Start here" line uses.

Before this session the agent saw only:

```
contentQuality: 70
```

and would have answered "how do I improve my Impact score?" with
something it made up. Now it has the answer, named down to the bullet.
---

# Part 9 — The ATS Coverage sub-criterion is retired

The founder decided: *"I guess we can retire the ATS coverage
sub-criterion."*

## What it was

"Coverage" measured *of the responsibilities the JD lists, how many does
the resume mention a token from?* — 20% of the ATS matching dimension.

## Why it was dead

It read `job.requirements`, and **no attach path writes one**. Measured on
production (Part 7): every variant stores `requirements: 0` and
`niceToHaves: 0`. The JD''s requirement bullets live only inside the raw
description prose.

So the dimension re-normalised to 0.75/0.25 and the sub-criterion was
dead weight — while the **"ATS Coverage" tip could never fire**, which
is why the Keywords bar was showing the generic *"if the JD asks for five
things and you only address three…"*.

## Why retire rather than revive

The v2 Intent Coverage dimension already measures requirement coverage —
with priority weighting (a missing must-have costs 3× a nice-to-have) and
a semantic (Jev) judgement of what counts as evidence. Reviving the v1
term would count the same measurement twice in the overall score.

## What changed

- `lib/scoring/dimensions/ats-matching.ts` — two sub-criteria, fixed
  weights (0.75 keyword / 0.25 similarity). `computeCoverageScore` and
  `computeCreditedKeywordTokens` are gone.
- `lib/scoring/score.ts` — `criteriaScores["ATS Coverage"]` is gone.
- `lib/scoring-async/score-hybrid.ts` — the hybrid recomposition uses the
  same fixed weights.
- `lib/scoring/tips.tsx` — the static and dynamic coverage tips are gone,
  along with `computeUncoveredRequirements`.
- `lib/inline-issue/types.ts` + `lib/db/queries.ts` — "ATS Coverage" is
  out of the criterion vocabulary, so the surface cannot target a
  criterion that does not exist.
- The Keywords bar now points at the **keyword** criterion and the
  **skills block** — the advice that names the actual missing tokens and
  that actually works.

## What it cost, measured

| | before | after |
|---|---|---|
| **Production scores** | — | **UNCHANGED** (the branch was already skipped) |
| corpus sync correlation | 0.9156 | 0.9076 |
| corpus Jev correlation | 0.9480 | **0.9487** |
| corpus sync MAE | 13.34 | 13.44 |
| corpus Jev MAE | 12.66 | **12.16** |

Read carefully, that table says something useful: **the corpus was the
ONLY place the dead branch was ever live**, and there it helped the sync
path slightly (−0.008 correlation) while the Jev path — the one
production runs — got slightly BETTER on both correlation and MAE.

So the retirement gives up a term that only ever existed in a
synthetic fixture, and improves the path production actually uses.

**Verified against production**: the founder''s stored snapshot and the
local engine agree dimension for dimension (91 overall; atsMatching 89,
structure 100, contentQuality 77, alignment 83, intentCoverage 100,
roleFit 100, seniorityFit 100) — before and after the retirement.

## The lesson

**A sub-criterion that is skipped in production is not a safety net; it
is a lie in the breakdown.** It appeared in the criteria list, in the
tips, and in the type unions — and it never once ran.

The generalisation: **when you find a branch that is always skipped,
check whether the thing it measures is measured somewhere else before
you wire it up.** Intent Coverage already had it.
---

# Part 10 — Correction: the JD''s requirements DO reach the score

I said the last open item was that *"the JD''s requirement bullets still
live only in prose"*. That was an overstatement, and it is worth
correcting in the record — because it changes what should be done.

## Measured

`scripts/probe-jd-requirements-reach.ts` (offline) scores the same
resume against three versions of one JD:

```
  baseline (mentions Kafka)    : overall 67, intent 92
  Kafka removed from the JD    : overall 68, intent 100
  Kubernetes added to the JD   : overall 66, intent 84

  adding a requirement the resume does NOT cover LOWERS the score by 1 point
  removing a requirement the resume DOES cover RAISES it by 1 point
```

So the requirements move the score, in both directions, exactly as they
should.

## How they get there — three routes

| Route | Carries | Live in production? |
|---|---|---|
| `job.description` — the raw posting text, requirements and all | the keyword score + BM25 similarity | **yes** |
| `job.mustHaveSkills` / `job.niceToHaveSkills` — the extractor''s structured list | Intent Coverage + the eligibility detector | **yes** |
| `job.requirements` — the JD''s own bullet list | the retired coverage sub-criterion | **no** — empty, no attach path writes one |

The JD''s requirement CONTENT is in the engine twice. What never existed
is the JD''s own bullet list AS A STRUCTURE — and the one thing that
read it is exactly what was retired on 2026-11-17.

## So there is nothing left to fix there

Wiring `job.requirements` would buy one thing: the ability to say *"you
addressed 3 of the 5 responsibilities the JD lists"* instead of *"add
these missing keywords"*. That is a nicer sentence, not a more accurate
score — and the sentence is what the retired criterion was for.

The honest options are both **do nothing for now**:

- Leave it retired, and let Intent Coverage carry requirement coverage
  (it does, with priority weighting and a semantic judgement).
- Or revive it with the JD''s bullets wired up — which reverses the
  decision made hours ago and re-introduces a second measure of
  requirement coverage in the overall score.

The default is the first: **one measure of requirement coverage, and the
engine''s accuracy record guards it.**

## The lesson

**Check your own claims before writing them down as defects.** This
session has been about measuring rather than assuming, and it would
have been a poor end to it to ship an unmeasured claim into the record.