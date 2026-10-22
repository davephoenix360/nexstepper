# Drift — the ATS keyword score, rebuilt on Jev

Date: 2026-10-22
Branch: `feat/chat-agent-v3-phase-a`
Plan: `docs/plans/ats-scoring-v3-jev.md`
Harness: `scripts/measure-jev-corpus.cjs`
Fixture: `tests/fixtures/jev-corpus-measurements.json`
Pinned by: `tests/unit/scoring/jev-corpus.test.ts`

## What prompted it

The user asked to re-evaluate the ATS scoring system, having found that a
JD's "Bachelor's degree" requirement was being scored as a missing skill,
and asked where Jev (`typesafe-ai/jev`) could genuinely be used.

The degree half shipped separately and earlier — see
`docs/drift/2026-10-22-degree-eligibility-fix.md`. This is the rest of
it: the **keyword vocabulary**, which the evaluation showed to be a bigger
problem than the degree.

## What was actually broken

The ATS Keyword Match sub-criterion counted **every non-stop-word token**
in the JD — title, description, requirements, nice-to-haves *and benefits*
— and asked what fraction the resume contained. It is 60% of the ATS
Matching dimension, which is 21% of the overall score.

For a realistic JD that is 49 tokens of which **33 are missing (67%)** for
a candidate who has every required skill. The missing ones included
`insurance`, `budget`, `remote`, `friendly`, `company`, `technology`,
`experience`, `strong`, `working`.

And the tip it produced said **"Add these missing keywords from the JD"** —
so the product was advising users to keyword-stuff their resumes.

### Then the production shape made it worse

Chasing this turned up something the corpus could not have shown:

> **The variant editor stores the pasted JD as RAW TEXT in
> `jobContext.description`, and `jobContext.requirements` /
> `niceToHaves` / `benefits` stay EMPTY forever.**

`setVariantJobContextAction` never populates them — it copies them from
the previous job context, and there is never a previous one. So in
production the keyword score was counting the tokens of a raw job
posting: the company's boilerplate, the benefits list, the EEO line.

On two real dev-database resumes the ATS Keyword Match sub-score was
**10.1 / 100** and **10.0 / 100**. Not "slightly harsh" — measuring
something that has nothing to do with the candidate.

The first version of the Jev measurement fed Jev the corpus's
`requirements` array, which production never has. The measurement was
therefore **right about the corpus and wrong about production**. It was
re-run against the input production actually stores.

## What changed

### The Jev client — `lib/ai/jev.ts`

Jev is a **decision model**, not a chat model: shared `state` in, typed
answers with probabilities out, no prose.

It is reached through the **Vercel AI Gateway's TypeSafe-compatible API**
(`POST https://ai-gateway.vercel.sh/typesafe/v1/systemone`), not the AI
SDK's `experimental_decide` — that needs `ai` ≥ 7.0.128 and this project
is on 6.0.224. The gateway path is one `fetch`, uses the
`AI_GATEWAY_API_KEY` we already hold, and speaks Jev's native protocol, so
it returns the `noul` probability, the choice's inline `confidence` and
the score's `legend` — all of which the AI SDK path reshapes or drops. The
full assessment is `docs/plans/ai-sdk-7-upgrade-assessment.md`.

The request is pinned to the `typesafe-ai` provider (the gateway endpoint
with **zero data retention**), and `assertZeroDataRetention` refuses a
response that came from anywhere else. TypeSafe is now named in the
privacy policy's subprocessor list.

### The evaluation — `lib/scoring-async/jev-requirements.ts`

Two calls per evaluation:

1. **Classify** — one binary question per requirement entry.
2. **Evidence** — one rubric question per entry that classified as a skill.

The binary question is deliberately binary. The first attempt used a
five-way choice (skill / qualification / responsibility / preference /
boilerplate) and it collapsed: Jev put plain tool names like "AWS",
"Kafka" and "Terraform" in the `qualification` bucket, with confidence
around 0.44 across the board. A forced choice with no escape hatch always
lands somewhere; a probability does not have that failure mode.

The requirement set is the **intent extractor's skill lists**, not
`job.requirements` — because that is what production stores.

A failed call is not an error: the evaluation comes back `ok: false` and
the engine keeps the token-based score.

### The score — `lib/scoring/jev-requirements.ts`

```
coverage = fraction of genuine requirements with any evidence (≥1)
depth    = mean evidence / 3
keyword  = 100 × (0.5 × coverage + 0.5 × depth)
```

The keyword sub-criterion is substituted inside the existing ATS
dimension (60% keyword / 20% similarity / 20% coverage), so the
scorecard's criteria still decompose the dimension and **no UI changed**.

The evidence score is the **probability-weighted** position on the
rubric, not the argmax — so a resume that half-demonstrates a
requirement lands between two levels.

### The tip follows the score

`"Add these missing keywords from the JD: build, dental, clinics"` became
`"These requirements from the JD are not evidenced in your resume: Node.js,
Azure, Serverless architecture"`.

The tip used to contradict the score next to it: the score came from Jev's
measurement while the tip came from the raw token difference. Both now come
from the same source.

## The measured result

50-JD validation corpus, hand-labelled ideal scores:

| | Pearson r | mean absolute error | mean score |
|---|---|---|---|
| baseline | 0.9103 | 13.40 | 66.0 |
| **Jev keyword sub-score** | **0.9350** | **12.26** | 67.3 |
| ideal | — | — | 58.7 |

And on the two real dev-database resumes, the ATS Keyword Match
sub-score went **10.1 → 44.6** and **10.0 → 58.2**.

The engine remains systematically generous (the corpus's ideal mean is 58.7
and the baseline scores 66.0). The Jev variant is a small move UP, not
down — what it fixes is the *distance* from the ideal score and the
*ranking* of candidates, not the absolute calibration.

## A pre-existing bug this work exposed

`lib/scoring-async/score-hybrid.ts` recomposed the overall score with
**hard-coded v1 weights** (0.3 / 0.2 / 0.3 / 0.2) and only four
dimensions — dropping Intent Coverage, Role Fit and Seniority Fit
entirely. So the "Recompute" button and the first-render scorecard were
on **different scales**: the same resume scored differently depending on
which one you looked at.

Fixed by extracting `composeOverallScore()` into `lib/scoring/score.ts`
and using it in both places. The hybrid wrapper no longer has its own
copy of the arithmetic.

## Honest limits

- **The intent-coverage dimension is unchanged.** Jev's classification
  does not feed it, because the intent coverage works on the extractor's
  skill entries while Jev's classification is keyed by JD line, and
  matching one to the other needs fuzzy text matching. Doing it wrong
  would silently drop a real must-have. The Jev classification is used
  for the keyword sub-criterion and the tip, where the units line up
  exactly.
- **The scores change for every user.** The keyword sub-criterion was
  measuring JD prose; fixing that moves the numbers. A candidate whose
  resume echoed the JD's wording scored well for the wrong reason. This
  is a correction, but it will look like a regression to anyone who
  remembers the old number.
- **Jev is a closed model.** SDKs and evaluation code are published; the
  weights are not. We can depend on it, not inspect it. The model id is
  versioned (`jev-1.14.0`) so a TypeSafe release cannot silently change
  the numbers, and a version bump is treated as a calibration event.
- **Two calls, ~450ms, $0.00013 per evaluation.** Cheap, but it is a
  network call in the scoring path, so the scoring path can now fail.
  It degrades to the token-based score rather than erroring.
- **The corpus has no degree requirements** (0 of 50), which is why the
  degree bug survived. The Jev measurement and the degree fix are
  complementary: Jev classifies the requirement entries, the
  deterministic detector resolves the dates.

## Tests

- `tests/unit/ai/jev-client.test.ts` (10) — the client, with a mocked
  `fetch`: the request shape, the provider pin, the versioned model id,
  and every failure mode.
- `tests/unit/scoring/jev-requirement-fit.test.ts` (9) — the pure
  arithmetic, and the rule that an unusable evaluation produces NO
  number rather than a fabricated one.
- `tests/unit/scoring/jev-corpus.test.ts` (9) — the offline claims: the
  AUC, the control's discrimination, the correlation improvement, the
  cost bound and the pinned model id.

The expensive half (150 live calls, $0.0058) is a script; its output is
committed as a fixture so CI needs no network and spends no money.
