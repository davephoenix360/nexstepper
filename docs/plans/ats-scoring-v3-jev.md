# ATS scoring v3 — evaluating Jev (typesafe-ai/jev)

Status: **evaluation complete, nothing shipped.** This document is the
recommendation and its evidence. No production code changed.

Date: 2026-10-22
Branch: `feat/chat-agent-v3-phase-a`
Data: `tests/fixtures/jev-corpus-measurements.json`
Harness: `scripts/measure-jev-corpus.cjs`
Pinned by: `tests/unit/scoring/jev-corpus.test.ts`

## What prompted it

Two things.

**1. A degree requirement was scored as a missing skill.** A JD asked for a
bachelor's degree. The user is completing that degree and will hold it by
the time the role starts. The system put the degree in `mustHaveSkills`,
penalised the resume 8 points on Intent Coverage, and — the real damage —
the scorecard told the user *"Add these missing keywords from the JD:
bachelor, degree, computer, science…"*.

**2. The embedding may be finding the wrong things.** The suspicion was that
the plain embedding (MiniLM cosine over the whole document) rewards niche
tokens and punishes honest candidates.

Both are worth checking, so both were checked against real measurements
rather than argued about.

## What Jev is

TypeSafe AI's "System One" model family. `jev-1.14.0` is the current
release. It is a **decision model**, not a chat model: you give it shared
`state` and a map of typed questions, and it returns typed answers with
probabilities, without generating prose.

| primitive | question | answer |
|---|---|---|
| `noul` / `boolean` | is this true? | probability of yes, 0–1 |
| `choice` | which of these? | the choice, plus a probability per option, plus confidence |
| `score` | where on this rubric? | probability-weighted position, plus a probability per level |

It is **on the Vercel AI Gateway** as `typesafe-ai/jev` (plus the versioned
`jev-1.13.0` / `jev-1.14.0`), which matters because the gateway is already
this project's AI transport and the only key we already hold is
`AI_GATEWAY_API_KEY`.

| | |
|---|---|
| Price | **$0.042 per million input tokens. Output tokens are free.** |
| Context | 32k per request on the gateway |
| Providers | `typesafe-ai` (has zero data retention) and `digitalocean` (does not) |
| Latency | 171 ms measured for 6 questions; 7.3 s for a 150-call corpus sweep at concurrency 5 |

For comparison: `anthropic/claude-haiku-5.5` is $0.10/$0.50 per 1M, and
`mistral/mistral-nemo` — the current JD parser — is $0.03/$0.03 per 1M. Jev
is cheaper than Haiku on input and free on output, because it produces
structured decisions rather than prose.

**A full evaluation costs about $0.00013.** The whole 50-JD measurement
sweep (150 calls, 138,464 input tokens) cost **$0.0058**.

## How to call it

Two paths, and the choice matters.

### Path A — the gateway's TypeSafe-compatible API (recommended, no upgrade)

```
POST https://ai-gateway.vercel.sh/typesafe/v1/systemone
Authorization: Bearer $AI_GATEWAY_API_KEY
{ "model": "jev-1.14.0", "state": "...", "questions": { ... } }
```

**Verified working against this project's own credentials.** It speaks
TypeSafe's native shape (`noul`, `choice`, `score`), including the `choice`
confidence that the AI SDK path moves into `providerMetadata`.

This needs **no dependency change** — it is a `fetch`.

### Path B — the AI SDK decision API

```ts
import { experimental_decide as decide } from 'ai';
import { gateway } from '@ai-sdk/gateway';

const result = await decide({
  model: gateway.decisionModel('typesafe-ai/jev'),
  state: '...',
  questions: {
    degreeType: {
      type: 'choice',
      instructions: 'What kind of requirement is this line?',
      criteria: { skill: '...', qualification: '...' }
    }
  }
});
```

This is the documented, supported shape — but it needs **`ai` ≥ 7.0.128**
and this project is on **6.0.224**. AGENTS.md locks "Vercel AI SDK 6", so
adopting Path B is a stack decision that needs a discussion, not a
drive-by edit.

**Recommendation: start on Path A.** It is a thin typed client over one
`fetch`, it works today, and it keeps the AI SDK question separate from the
scoring question.

---

## What the measurements showed

Everything below is from `scripts/measure-jev-corpus.cjs` over the 50-JD
`tests/fixtures/ats-corpus.json` validation corpus, and is pinned offline by
`tests/unit/scoring/jev-corpus.test.ts`.

### 1. Jev separates genuine skills from non-skills — AUC 0.926

Each of the 428 requirement / nice-to-have lines was put to the binary
question *"is this a specific skill, tool, technology or technique the
candidate would use on the job?"*, and the resulting probability was
validated against the corpus's hand-authored skill lists.

| | |
|---|---|
| mean P(skill) on lines that ARE a hand-authored skill | **0.873** |
| mean P(skill) on lines that are NOT | **0.277** |
| **AUC** | **0.926** |

At a 0.5 threshold: precision 0.953, recall 0.902.

The apparent false positives are not false — "Rust or C++ for inference
optimization", "transformer fine-tuning + deployment" and "microservices"
are genuine skills that the hand-authored lists simply do not enumerate.
The apparent false negatives are all *correct* rejections: "5+ years of
engineering experience", "Cross-functional leadership", "hiring +
performance reviews + coaching", "On-call rotation experience".

**This is the answer to "which of the keywords are actually valid to be
used for ATS scoring".** Confirmed, with a number.

### 2. The control — Jev discriminates, and agrees with the token matcher

The same "does the resume demonstrate X?" question, asked about skills the
token matcher says are PRESENT and skills it says are MISSING:

| | |
|---|---|
| mean P(demonstrated) for skills the resume HAS | **0.766** |
| mean P(demonstrated) for skills it lacks | **0.110** |
| agreement with the token matcher | **81.6%** |

And the false-alarm survey: of the 66 must-have skills the current engine
reports as missing across the whole corpus, **0** are ones the resume
actually demonstrates.

**This is an important negative result: the skill matching is not broken.**
It agrees with Jev 81.6% of the time and produces essentially no false
alarms. Jev is *not* needed to fix skill detection.

### 3. A Jev-derived ATS Matching dimension scores better

Replacing the ATS Matching dimension with one built from Jev's answers
(genuine-skill coverage weighted by evidence depth) and recomposing with
the same v2 weights:

| | Pearson r vs idealScore | mean absolute error |
|---|---|---|
| current engine | 0.910 | 13.40 |
| **Jev-derived dimension** | **0.927** | **10.60** |
| 50/50 blend | 0.923 | 11.94 |

A **21% reduction in mean absolute error** against the hand-labelled ideal
scores. Per tier, the gain is where it matters most — the Jev dimension
pulls weak resumes down instead of letting them sit in the middle:

| tier | ideal | current | Jev |
|---|---|---|---|
| strong | 89.9 | 78.9 | **82.9** |
| good | 73.9 | 71.2 | 70.9 |
| partial | 59.5 | 68.5 | 67.2 |
| limited | 39.6 | 59.6 | **55.0** |
| needs-work | 19.6 | 47.3 | **41.0** |

### 4. The embedding is not the problem either — but it is weak

Measured on the same inputs:

| | MiniLM cosine (→0–1) | BM25 |
|---|---|---|
| genuinely matching resume | 0.761 | 0.903 |
| unrelated resume (a chef) | 0.569 | 0.128 |
| keyword-stuffed resume | **0.896** | 0.999 |

Two things fall out of that table:

- The embedding separates a good match from a chef by only **0.19** on a
  scale whose floor is ~0.5 — and it scores a **keyword-stuffed resume
  HIGHER than the genuinely matching one**. It rewards stuffing because it
  embeds the whole document, and a document stuffed with JD words is *more
  about* the JD.
- BM25 separates them properly (0.903 vs 0.128) but also rewards stuffing
  (0.999).

So the embedding is a weak discriminator that is partly redundant with
BM25, and the token matcher is an accurate-but-wrong-vocabulary signal.
**The scoring system is not broken. It is measuring the wrong things.**

---

## The diagnosis, precisely

Four distinct problems, in order of how much they hurt the user.

### P1 — the ATS keyword vocabulary is JD prose (12.6% of the score)

`computeKeywordScore` counts every non-stop-word token across the JD's
title, description, requirements, nice-to-haves **and benefits**, then
asks what fraction appear in the resume. It is 60% of the ATS Matching
dimension, which is 21% of the total score.

For a realistic JD (a health-tech role for a student), 49 tokens are
counted and **33 are missing (67%)**:

```
health, technology, company, dental, work, facing, platform, internal,
bachelor, degree, computer, science, equivalent, practical, experience,
strong, shipping, customer, web, applications, comfortable, working,
familiarity, exposure, machine, learning, hl7, fhir, standards, remote,
friendly, insurance, budget
```

A candidate with every single required skill scores **32.65** on this
sub-criterion. "Insurance", "budget", "remote", "friendly", "company" are
not ATS keywords; they are job-posting prose. "HL7" and "FHIR" are the
genuinely niche terms the user was worried about, and they belong in a
nice-to-have list, not in a must-have penalty.

**And the tip says "Add these missing keywords from the JD."** The product
is currently advising users to keyword-stuff their resumes — which is bad
writing, and is what real ATS systems penalise.

### P2 — the schema has nowhere to put a qualification

`JobPosting` has `mustHaveSkills`, `niceToHaveSkills`, `implicitSkills`,
`seniorityLevel`, `yearsRequiredMin/Max`, `roleFamily`, `domainSignals`.
There is **no field for eligibility criteria**. So when the intent
extractor reads a JD whose "Qualifications" section says "Bachelor's
degree in Computer Science or equivalent practical experience" — and the
extractor prompt explicitly lists "Qualifications" as a must-have section
header — the degree has nowhere to go but into `mustHaveSkills`.

It then gets:
- an 8-point Intent Coverage penalty if the resume lacks the word,
- a place in the "missing keywords" tip,
- and no way to express "or equivalent experience", which the JD explicitly
  allows.

The same trap holds for certifications, work authorisation, security
clearance and location requirements.

### P3 — the advice, not the number

The overall score only moves by ~1 point for the degree (Intent Coverage is
0.10 of the total). The damage is the advice: telling someone they are
missing a degree they are three months from finishing, and telling them to
add "insurance" and "budget" as keywords.

### P4 — the content-quality dimension is lexical, and we already know it

`scoreContentQuality` asks two questions: does the bullet contain a digit,
and does it start with a strong action verb. Our own docstring flags the
fairness problem:

> *"quantifying impact is genuinely unevenly available across fields, so
> this sub-criterion scores honest candidates in less numerate roles lower.
> It is weighted 0.21 — more than Intent Coverage (0.10), which is the
> dimension that actually measures JD match."*

A semantic "does this bullet state an outcome, or just a duty?" check
would replace the digit heuristic and remove the fairness problem.

---

## The recommendation

**Adopt Jev — but for the three things it does that nothing else in the
stack does. Do not adopt it to replace the skill matcher, which works.**

### R1 — classify JD requirement lines (fixes the degree problem)

One `noul` per requirement line: *"is this a specific skill, tool or
technique the candidate uses on the job?"*, with the criteria spelled out
so degrees, certifications, years-of-experience, management and soft skills
all count as "no".

Add `qualifications` to the intent schema. Degrees and certifications land
there and stop being scored as missing skills.

Jev already answers the hard part of the user's question correctly — in a
live probe against their own JD:

| question | answer |
|---|---|
| "What kind of requirement is this line?" | **qualification** |
| "Can a candidate satisfy this through work experience instead of the degree?" | **0.96 yes** |

**Confidence: high.** Measured AUC 0.926, and the live probe is exactly
the user's case.

### R2 — score evidence depth (a dimension that does not exist today)

A `score` question per genuine skill requirement, on a 0–3 rubric: *listed
as a skill → mentioned in a bullet → demonstrated with a concrete outcome*.

This is what a recruiter actually judges, and the current engine cannot see
it at all — it only asks whether a token is present. It also gives the
scorecard something genuinely useful to say: not "you are missing
Kubernetes" but "you list Kubernetes but never show using it".

**Confidence: high.** Measured above; the dimension improved the corpus
correlation.

### R3 — replace the keyword vocabulary with the curated one

Score ATS Matching against Jev's extracted skill set instead of the raw
token set. The tip becomes *"Add these missing keywords: Kubernetes,
Terraform"* instead of *"insurance, budget, remote, friendly"*.

**Confidence: high.** Pearson r 0.910 → 0.927, MAE 13.40 → 10.60.

### R4 — deterministic eligibility, no model call (the degree case specifically)

Two thirds of the degree problem need no model at all.

`EducationEntry` already carries `degreeLevel`, `startDate`, `endDate` and
`gpa`. So the system can compute, in pure TypeScript, whether the
candidate will hold the required degree **by the time the role starts** —
and if the end date is in the future, say so:

> *"This role asks for a bachelor's degree. Your BSc is listed as
> completing in June 2027, so you meet it by then."*

That is strictly better than any probability: it is a fact about the
resume, and it needs no network call.

**Confidence: high.** The fields exist; only the comparison is missing.

### Where Jev is NOT the right tool

| use case | why not |
|---|---|
| Generating resume prose | Jev does not generate text. The chat agent stays on Claude. |
| Replacing the skill-presence matcher | It agrees with the current one 81.6% of the time and finds no false alarms. Redundant. |
| Replacing the JD intent extractor wholesale | `mistral/mistral-nemo` does structured extraction at a similar price; Jev's advantage (calibrated probabilities, parallel questions) is worth evaluating separately, but it is not obviously better for schema-filling. |
| Anything in `lib/scoring/` proper | The purity test forbids IO there. Jev belongs in `lib/scoring-async/`, exactly where the MiniLM embedding already lives. |

---

## Other surfaces Jev fits

Ranked by confidence.

### High confidence

**The chat agent's honesty guard.** The system prompt says *"never invent —
ask for the number"*. That is an instruction, not a check. A `noul` per
proposed edit — *"does the resume actually support this claim?"* — makes it
verifiable. This is the difference between the agent being told not to
hallucinate and the agent being checked.

**Content Quality, replacing the digit heuristic.** As in P4. A semantic
"does this bullet state an outcome?" check removes a fairness problem our
own docstring already flags, and is better than counting digits.

**Resume-bullet quality for the recruiter persona.** Per-bullet
`noul`/"score" checks: is this a duty or an outcome? Is this claim
specific or generic? These are the checks a human reviewer makes, and
today the scorecard can only count digits and verbs.

**JD suitability triage.** Before a user invests in tailoring, *"is this
JD actually for the role the candidate has?"* as a `choice` over role
families.

### Medium confidence

**Per-bullet rewriting feedback.** Score the original and the rewritten
bullet on the same rubric and tell the user which one moved.

**Explaining the score.** The scorecard could say "your TypeScript is
listed but not demonstrated" rather than "ATS Keyword Match: 32".

### Low confidence

**Replacing `extractJdIntent`.** Worth a side-by-side measurement against
`mistral/mistral-nemo` on the same 50 JDs, but not yet done.

---

## The trade-offs, stated plainly

1. **Scoring becomes a network call.** Today the ATS score is instant,
   free, deterministic and works offline. Adding Jev means ~200–500 ms,
   a failure mode, and a cost that is small but not zero.
   *Mitigation:* keep the pure engine for the first paint and as the
   fallback — this is exactly the `lib/scoring-async/` + hybrid pattern
   the MiniLM path already uses. On timeout, fall back to the pure score.

2. **Determinism.** Jev is a probabilistic model; the same input can give
   slightly different answers. The corpus test therefore pins a *tolerance*,
   not an exact value. Our own corpus test already has this property.

3. **Vendor dependency on an early-access model.** Jev 1.13/1.14 are
   recent releases and `jev-latest` moves. Pin the versioned ID (the
   measurement script does) and treat a model bump as a calibration event.

4. **Data handling.** The `typesafe-ai` provider endpoint has zero data
   retention; the `digitalocean` fallback does not. Pin the provider or set
   `providerOptions.gateway.zeroDataRetention`, because resumes are
   personal data.

5. **The AI SDK 7 question is separate.** Path A needs no upgrade. Path B
   does, and AGENTS.md locks AI SDK 6. Do not let the scoring question
   drag the stack question in with it.

6. **Jev is a closed model.** No weights, no training code — only SDKs,
   skills and evaluation code are published. We can depend on it, but we
   cannot inspect it.

---

## What I did NOT change

No production code. Specifically:

- `JobPosting` has no `qualifications` field yet. Adding one is a schema
  change with a migration.
- `lib/scoring/` is untouched and still passes the purity test.
- The ATS score the user sees today is unchanged.
- No new dependency, no AI SDK upgrade.

The measurement harness and the offline test that pins the claims are the
only code added, because an evaluation nobody can re-run is an opinion.

## If we proceed, the order

1. **R4 first** — the deterministic degree/eligibility check. No model, no
   network, no cost, and it fixes the exact thing the user reported. It is
   also the smallest change in the whole list.
2. **R1 next** — `qualifications` in the intent schema, with Jev
   classifying lines. This is the schema change; it needs a migration and
   a backfill for existing JDs.
3. **R2 + R3** — the evidence-depth dimension and the curated keyword
   vocabulary, together, because they share the same Jev call.

Each step is independently shippable and independently measurable against
the corpus.

## Reproducing

```bash
pnpm dev                                   # not needed — this is a script
node scripts/measure-jev-corpus.cjs        # needs AI_GATEWAY_API_KEY
pnpm vitest run tests/unit/scoring/jev-corpus.test.ts   # offline, pins the claims
```

The measurement costs **$0.0058** and takes 7.3 seconds.
