# Drift — the Intent Coverage dimension was reading the wrong question

Date: 2026-10-22
Branch: `feat/chat-agent-v3-phase-a`
Plan: `docs/plans/ats-scoring-v3-jev.md`
Harness: `scripts/measure-jev-corpus.cjs`
Fixture: `tests/fixtures/jev-corpus-measurements.json`
Pinned by: `tests/unit/scoring/jev-corpus.test.ts`

## What prompted it

The last open item from the Jev evaluation: Jev's classification was not
feeding the Intent Coverage dimension, because the two worked on
different units — Jev on JD requirement lines, Intent Coverage on the
intent extractor's skill entries.

That concern turned out to be unfounded: the production evaluation
classifies **the intent extractor's own lists**, which are exactly the
entries Intent Coverage scores. The units already aligned.

## What the investigation found instead

Two bugs, both in the same place — the question "is this skill covered?"
was answered by a literal text test.

### False negative — the candidate has the skill

A JD asking for `Postgres`, a resume saying `PostgreSQL`:

- the token set has `postgresql`, not `postgres`;
- the collapsed set has `postgresql`, not `postgres`;
- the word-boundary fallback does not fire, because there is no boundary
  between `postgres` and `ql`.

So the candidate was penalised **8 points** for a skill they demonstrably
have, and the tip said *"Missing 1 must-have skill: Postgres"*.

This is not hypothetical. It is what happened to a real resume in the dev
database.

### False positive — the candidate disclaims the skill

The token matcher asks "do the JD's words appear in the resume?". A
candidate whose summary says:

> *"Mid QA analyst with 3 years of manual + light automation testing. No
> ML / **Python** / **PyTorch** exposure."*

contains the words `python` and `pytorch` — so they were **credited**
with both. The corpus has this shape deliberately: the needs-work
resumes disclaim the very skills the JD asks for.

Jev's evidence score for that resume: Python **0.30**, PyTorch **0.08** —
correct. The token matcher: both covered.

### The skill-match module already said so

`lib/scoring/skill-match.ts` documents both failure modes and then
writes:

> *"Deliberately not doing stemming, lemmatisation or synonym expansion.
> Synonym expansion is a genuinely good idea and the **right long-term
> answer** (it is what Jev-style semantic judging would replace) — but a
> hand-rolled synonym map is guesswork that silently invents matches."*

This is that replacement.

## What changed

### The evaluation asks three questions per entry

1. **Is this a genuine skill?** — the vocabulary the ATS keyword score is
   measured against.
2. **Is this an eligibility gate?** — a degree, certification, licence,
   work authorisation or years-of-experience threshold the candidate
   cannot satisfy by adding content. Gates come out of the scored lists.
3. **How strongly does the resume demonstrate it?** — the 0–3 evidence
   rubric.

The gate question is separate from the skill question on purpose. A duty
or a soft skill is not a *gate* — the candidate can show evidence of it,
so it stays scored, and "demonstrated" is decided by the evidence score.
Only gates are dropped.

### The Intent Coverage dimension now asks the semantic question

When the Jev evaluation is present:

- the entries scored are the ones Jev did not flag as gates;
- "is this covered?" is the evidence score, not the token test.

The threshold is `EVIDENCE_COVERED_THRESHOLD = 0.5`. The evidence score
is a probability-weighted position on the 0–3 rubric, so a resume that
merely **lists** a skill lands on about 0.99, not 1.0. A threshold of 1.0
reported skills the candidate plainly has as missing. The rubric's own
structure gives the right cut: position 0 is "no mention at all" and
position 1 is "listed as a skill or keyword only", so the midpoint is the
threshold.

### The measurement now calls the real module

`scripts/measure-jev-corpus.cjs` used to carry its own copy of the Jev
calls. That was a drift trap: the script's copy of the questions and the
production module's copy would silently diverge, and the committed
fixture would keep describing a system we no longer run. The measurement
is now `tests/unit/scoring/jev-corpus.measure.test.ts`, which calls the
real `evaluateJevRequirements`, and the script just runs it with
`MEASURE_JEV=1`. The test is skipped unless that variable is set, so CI
never spends money.

## The measured result

50-JD validation corpus, hand-labelled ideal scores:

| | Pearson r | mean absolute error |
|---|---|---|
| token-based engine | 0.9103 | 13.40 |
| **Jev (keyword + intent coverage)** | **0.9362** | **12.08** |

The control, which is the number that says Jev is doing real work rather
than guessing:

| | mean evidence score |
|---|---|
| skills the token matcher calls **present** | **2.262** ("mentioned in a bullet") |
| skills the token matcher calls **absent** | **0.328** ("no mention") |

They disagree on **8.3%** of entries — and those are the cases where the
token matcher is wrong.

## Honest limits

- **The engine is still systematically generous.** The corpus's ideal
  mean is 58.7 and the engine scores 66.0. This change narrows the gap
  (MAE 13.40 → 12.08) but does not fix it; the remaining generosity is in
  Content Quality and Alignment, not in coverage.
- **A threshold of 1.0 correlated slightly better** (r 0.9438 vs
  0.9362). It was rejected: it reports a skill the candidate merely
  *lists* as missing, which is exactly the advice we have been fixing.
  The correlation favours it only because the corpus's ideal scores sit
  below what the engine produces elsewhere, so a stricter coverage
  accidentally compensates. Choosing a threshold to flatter a correlation
  is how you ship a wrong number.
- **The intent coverage still uses the token test when Jev did not run**,
  which is every first paint and every dashboard list. The enhanced
  numbers appear after a recompute.
- **Jev's evidence is a judgement, and judgements vary.** The same
  resume can land a few tenths either side of a threshold.

## Tests

- `tests/unit/scoring/jev-intent-coverage.test.ts` (7) — the four
  behaviours: a skill shown under another name is credited, a skill the
  resume disclaims is reported missing, a gate is excluded, and a duty
  stays scored.
- `tests/unit/scoring/jev-corpus.test.ts` (7, rewritten) — the offline
  claims: the AUC, the control's discrimination, the correlation
  improvement, and that the token matcher's false positives are caught.
- `tests/unit/scoring/jev-corpus.measure.test.ts` (1, skipped by
  default) — the measurement itself, opt-in via `MEASURE_JEV=1`.

Suite: 1923 → 1931.
