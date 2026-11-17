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