# Drift — Content Quality measured bullets with a string test, not a reading

Date: 2026-10-22
Branch: `feat/chat-agent-v3-phase-a`
Plan: `docs/plans/ats-scoring-v3-jev.md`
Harness: `scripts/measure-jev-corpus.cjs`
Fixture: `tests/fixtures/jev-corpus-measurements.json`
Pinned by: `tests/unit/scoring/jev-corpus.test.ts`

## What prompted it

The Jev evaluation found the ATS score systematically generous, and the
remaining generosity was not in coverage — it was in **Content Quality**,
which carries 0.21 of the total. More than Intent Coverage (0.10), which
is the dimension that actually measures JD match.

And the dimension's own docstring already flagged the problem:

> *"Known fairness concern, not yet addressed: quantifying impact is
> genuinely unevenly available across fields, so this sub-criterion
> scores honest candidates in less numerate roles lower. It is weighted
> 0.21 — more than Intent Coverage (0.10), which is the dimension that
> actually measures JD match."*

## What it measured

Two string properties, over the work bullets:

1. `accomplishmentRatio` — does the bullet contain a **digit**?
2. `actionVerbUsage` — does the bullet start with a verb from our
   `ACTION_VERBS` list?

Both are proxies for something real, and both leak.

**The digit test is unfair across fields.** "Reduced API latency by 40%"
has a number. "Established a patient-support triage protocol that cut wait
times" does not — but it is the stronger bullet. A candidate in a role
where numbers are not the currency is marked down for writing well.

**The action-verb list is a lexicon.** "Architected" is not in
`ACTION_VERBS`, so a bullet starting with it counts as NEITHER strong nor
weak — it simply does not earn the point, however well it is written.

## What it does now

Two **rubric** questions per bullet:

- *How much impact does this bullet claim?* — 0: a duty with no result;
  1: an activity with a vague result; 2: a clear accomplishment; 3: a
  specific accomplishment with a measurable outcome.
- *How strongly does this bullet open?* — 0: passive, a noun phrase, or
  a weak generic action; 1: a plain active verb with no scope; 2: a
  strong active verb with a concrete scope; 3: a strong active verb and a
  specific result.

The dimension does not depend on the JD, so the state is the resume alone
and the evaluation runs in parallel with the requirement evaluation — one
round trip, not two.

### Why a rubric and not a yes/no question

A binary question was tried first: *"does this bullet describe an
accomplishment with a result?"* It is true of almost every bullet a
candidate bothered to write. The dimension scored **91/100 for everybody**,
stopped discriminating, and pushed the overall score 15 points above the
hand-labelled ideal.

The rubric version puts the needs-work resume's bullets exactly where they
belong:

| bullet | impact |
|---|---|
| "Owned the manual QA pass for 6 product releases" | **0.57** |
| "Wrote 30+ Selenium scripts (Java) for regression testing" | 1.24 |
| "Authored the QA test plan + traceability matrix" | **0.22** |

against a strong resume's:

| bullet | impact |
|---|---|
| "Led the migration from a Ruby monolith to 14 Node.js microservices…" | 3.00 |
| "Built the PostgreSQL-backed ledger system from scratch, scaling to 12M users" | 2.99 |

## The measured result

50-JD validation corpus, hand-labelled ideal scores:

| | Pearson r | mean absolute error |
|---|---|---|
| token-based engine | 0.9103 | 13.40 |
| **Jev (keyword + coverage + content quality)** | **0.9472** | **12.62** |

The per-tier gradient is the more telling number, because it is what
"discriminates" means:

| tier | ideal | current | Jev | content quality (lexical → Jev) |
|---|---|---|---|---|
| strong | 89.9 | 78.9 | **87.3** | 67.5 → 85.9 |
| good | 73.9 | 71.2 | 77.3 | 65.4 → 80.5 |
| partial | 59.5 | 68.5 | 72.1 | 62.5 → 71.0 |
| limited | 39.6 | 59.6 | 61.2 | 58.7 → 68.5 |
| needs-work | 19.6 | 47.3 | 44.9 | 55.7 → 57.8 |

The lexical dimension scored a strong resume 67.5 and a needs-work resume
55.7 — **a 12-point spread across every tier**. The semantic one scores
85.9 and 57.8 — a 28-point spread that tracks the tiers. That is the
difference between a dimension that measures something and one that
mostly measures bullet formatting.

## The tips had to change too

The dynamic tip for 'Accomplishment Focus' said *"Only 3 of 8 work bullets
include a number. Try quantifying your impact."* With a semantic
measurement that advice would be a non-sequitur — and it is the advice
that punishes non-numerate candidates.

It now says what the measurement actually found:

> *"3 of 8 work bullets describe a task rather than an outcome (…; …). Say
> what changed, not just what you did — the effect, the result, the thing
> that got better."*

and the opening tip names the weak bullets. The lexical tips remain as the
fallback for when Jev did not run.

## Honest limits

- **The engine is still too generous, and now more so.** The corpus's
  ideal mean is 58.7; the current engine scores 66.0 and the Jev engine
  69.9. The semantic content quality is a *better* measure but it reads
  higher than the lexical one, so it widens the gap by about 2.4 points.
  The gap is concentrated in the weaker tiers — a needs-work resume scores
  44.9 against an ideal of 19.6 — and that is a **calibration** problem
  across dimensions, not a content-quality problem. It is the next piece
  of work, and it is a different one: rescaling the overall score would
  break comparability with the numbers users have already seen.
- **The keyword+coverage change alone gave MAE 12.08**; adding the content
  quality gives 12.62. The correlation is clearly better (0.9362 →
  0.9472) and the fairness problem is fixed, so the trade was taken
  deliberately.
- **Jev's judgement is a judgement.** The same bullet can land a little
  either side of a rubric level.
- **The lexical path still runs on every first paint and every dashboard
  list**, because it is pure and free. The enhanced numbers appear after
  a recompute.

## Tests

- `tests/unit/scoring/jev-content-quality.test.ts` (8) — the rubric
  scoring, the null cases (no evaluation, a mismatched bullet list), and
  the dimension's fallback to the lexical score.
- `tests/unit/scoring/jev-corpus.test.ts` (rewritten) — the offline
  claims, including that the semantic dimension separates the tiers by
  more than 15 points.

Suite: 1931 → 1946.
