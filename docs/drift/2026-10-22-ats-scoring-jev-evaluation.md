# Drift — the ATS score was measuring the wrong things (and Jev's role in fixing it)

Date: 2026-10-22
Branch: `feat/chat-agent-v3-phase-a`
Plan: `docs/plans/ats-scoring-v3-jev.md`
Harness: `scripts/measure-jev-corpus.cjs`
Pinned by: `tests/unit/scoring/jev-corpus.test.ts`

## What prompted it

The user reported that a JD's "Bachelor's degree" requirement was being
scored as a missing skill, when they are completing that degree and will
hold it by the time the role starts. They also suspected the plain
embedding was finding niche things that hurt honest candidates, and asked
where Jev (`typesafe-ai/jev`) could genuinely be used.

The ask was an evaluation, not a rewrite. So this drift is a measurement
report and a recommendation; **no production code changed.**

## What the measurements showed

### The skill matcher is not broken

This was the big negative result and it changed the recommendation. Asked
the same question of Jev — *"does the resume demonstrate X?"* — about
skills the token matcher says are present and about skills it says are
missing:

- mean P(demonstrated) for skills the resume HAS: **0.766**
- mean P(demonstrated) for skills it lacks: **0.110**
- agreement with the token matcher: **81.6%**

And of the 66 must-have skills the engine reports as missing across the
whole 50-JD corpus, **0** are ones the resume actually demonstrates.

So the existing skill detection is accurate. Jev is **not** needed to
replace it.

### The vocabulary is the problem

`computeKeywordScore` counts every non-stop-word token in the JD —
including the description and the benefits — and asks what fraction the
resume contains. For a realistic JD that is 49 tokens, of which **33 are
missing (67%)** for a candidate who has every required skill. The missing
ones include `insurance`, `budget`, `remote`, `friendly`, `company`,
`technology`, `experience`, `strong`.

That sub-criterion is 60% of the ATS Matching dimension, which is 21% of
the total score. And the tip it produces says **"Add these missing keywords
from the JD"** — so the product was advising users to keyword-stuff.

### The embedding is weak but not the culprit

| | MiniLM cosine | BM25 |
|---|---|---|
| matching resume | 0.761 | 0.903 |
| unrelated (chef) | 0.569 | 0.128 |
| keyword-stuffed | **0.896** | 0.999 |

The embedding separates a match from a chef by 0.19 on a scale whose floor
is 0.5, and it scores a stuffed resume higher than a real one. It is a
weak, partly-redundant signal — but replacing it is not where the value
is.

### Jev is genuinely good at the thing it was proposed for

Asking "is this line a specific skill, tool or technique?" for all 428
requirement lines in the corpus, validated against the corpus's
hand-authored skill lists:

- mean P(skill) on real skills: **0.873**
- mean P(skill) on non-skills: **0.277**
- **AUC 0.926** (precision 0.953, recall 0.902 at a 0.5 threshold)

Substituting a Jev-derived ATS Matching dimension into the real engine and
recomposing with the same v2 weights:

| | Pearson r vs idealScore | mean absolute error |
|---|---|---|
| current engine | 0.910 | 13.40 |
| Jev-derived | **0.927** | **10.60** |

**21% lower mean absolute error** against the hand-labelled ideal scores.

## The honest correction to the premise

The suspicion was "the plain embedding finds niche things that hurt
someone's score". The measurements say the embedding is not what hurts —
**the token vocabulary is.** A candidate is not penalised for lacking
"HL7" so much as for lacking "insurance" and "budget" alongside it, in a
sub-criterion that carries 12.6% of the score and feeds the most
actionable-looking tip in the product.

## The degree problem is three problems, and only one needs a model

1. **The schema has nowhere to put a qualification.** `JobPosting` has
   `mustHaveSkills` / `niceToHaveSkills` / `implicitSkills` and nothing for
   eligibility criteria, and the intent-extractor prompt explicitly lists
   "Qualifications" as a must-have section header — so a degree requirement
   has nowhere to go but into the skill list.

2. **The engine cannot express "or equivalent experience".** Jev answers
   that question at 0.96 in a live probe against the user's own JD.

3. **The eligibility check needs no model at all.** `EducationEntry`
   already carries `degreeLevel`, `startDate` and `endDate`, so "will they
   hold this degree by the time the role starts?" is arithmetic in pure
   TypeScript — a fact about the resume, not a probability.

## What was built

- `scripts/measure-jev-corpus.cjs` — the measurement harness. Three calls
  per JD (vocabulary curation, evidence depth, the present/absent control),
  all questions in one request per call. 150 calls, 7.3 s, **$0.0058**.
- `tests/fixtures/jev-corpus-measurements.json` — the output, committed.
- `tests/unit/scoring/jev-corpus.test.ts` — 8 offline tests that pin the
  claims, so CI needs no network and spends no money.

The split follows the existing convention for expensive measurements (the
page-count harness is a script too, with its results committed as a
fixture).

## Honest dev notes

**The first Jev question was badly posed and the results were garbage.** A
5-way `choice` ("skill | qualification | responsibility | preference |
boilerplate") collapsed: Jev put plain tool names like "AWS", "Kafka" and
"Terraform" in the `qualification` bucket, and confidence sat at ~0.44
across the board. A forced choice with no escape hatch always lands
somewhere. The binary `noul` with explicit "answer no if it is a degree,
a certification, a number of years, a management or soft skill, or a duty"
formulation gives AUC 0.926 instead. **The lesson generalises: use a
probability for a binary question, and give the model a way to say "not
one of these".**

**The first gateway check said Jev was not available, and that was my
bug.** I grepped the model catalogue with `-SimpleMatch` against the
pattern `typesafe|jev|system`, which makes the pipe a literal character
rather than alternation — so it matched nothing. The user caught it. The
model is on the gateway as `typesafe-ai/jev`.

**Two integration paths exist and they are not equivalent.** The gateway's
TypeSafe-compatible API (`https://ai-gateway.vercel.sh/typesafe/v1/systemone`)
works against this project's existing `AI_GATEWAY_API_KEY` with no
dependency change, and preserves TypeSafe's native `noul` / `choice` /
`score` shapes. The AI SDK's documented `experimental_decide` needs
`ai` ≥ 7.0.128 and this project is on 6.0.224 — a locked-stack change
that needs a discussion, so it is deliberately not bundled into the
scoring question.

## What was NOT changed

- No production code. The ATS score the user sees today is unchanged.
- No schema change, no migration, no new dependency, no AI SDK upgrade.
- `lib/scoring/` is untouched and still passes the purity test; a Jev
  client would live in `lib/scoring-async/`, alongside the MiniLM
  embedding that is already there.

## Recommendation

Adopt Jev for three things, and do not adopt it to replace what already
works:

1. **Classify JD requirement lines** — degrees, certifications and years
   stop being scored as missing skills. (Fixes the reported bug.)
2. **Score evidence depth** — "listed" vs "demonstrated with an outcome",
   which the engine cannot currently see at all.
3. **Curate the keyword vocabulary** — measure against genuine skills
   instead of JD prose. (Pearson r 0.910 → 0.927.)

And do the deterministic eligibility check **first**: it needs no model, no
network and no cost, and it fixes the exact thing that was reported.
