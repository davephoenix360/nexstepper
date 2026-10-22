# Drift — a degree requirement is not a missing skill

Date: 2026-10-22
Branch: `feat/chat-agent-v3-phase-a`
Plan: `docs/plans/ats-scoring-v3-jev.md` §R4
Code: `lib/scoring/qualifications.ts`

## What prompted it

The user reported that a JD's "Bachelor's degree" requirement was being
added to the resume's **must-have skills**, when they are completing that
degree and will hold it by the time the role starts. The follow-up
question was whether a degree requirement should be scored in the ATS
system at all, or handled some other way.

The Jev evaluation (`docs/plans/ats-scoring-v3-jev.md`) had already
established that this was **three separate problems and only one of them
needs a model**. This is the fix for the two that do not.

## What was actually wrong

There are **two JD parsers**, and they disagree.

| | schema | has a qualifications field? |
|---|---|---|
| `parseJd` → `parsedJdSchema` | `lib/jd-parser/schema.ts` | **yes** — *"qualifications: the requirements (degree, years of experience, certifications)"* |
| `extractJdIntent` → `jdIntentSchema` | `lib/jd-parser/extract-jd-intent.ts` | **no** |

The ATS scorer uses the second one. And the intent extractor's own prompt
says:

> *"mustHaveSkills: skills the JD explicitly marks as required, OR that
> appear in a 'Requirements' / **'Qualifications'** / 'What you need' /
> 'You have' / 'Required' section header."*

So a JD whose Qualifications section opens with "Bachelor's degree in
Computer Science or equivalent practical experience" puts that line in
`mustHaveSkills` — there is nowhere else for it to go. The parser already
knew better; the extractor could not.

From there the scorer did exactly what it was told:

- an **8-point Intent Coverage penalty** (the `MUST_HAVE_PENALTY`),
- a line in the scorecard's skill-gap list under "Must-have",
- and a tip reading **"Add these missing keywords from the JD: bachelor,
  degree, computer, science…"**.

The last one is the worst. It is advice a candidate cannot act on, and it
pushes them toward the keyword-stuffing that makes a resume read badly.

## What changed

### Degrees are no longer skills

`lib/scoring/qualifications.ts` (new) detects eligibility gates
deterministically and the intent scorer takes them out of the skill
lists **before** scoring them:

- a **degree** (a level is named, or the requirement says "degree" or
  "diploma"),
- a **certification or licence**, but only when the JD phrases it as a
  gate — "AWS Certified Solutions Architect" names a technology and
  stays a skill,
- **work authorisation, clearance, residency or citizenship**.

They carry no penalty and appear in no miss list.

### The eligibility is computed, not guessed

`EducationEntry` already carries `degreeLevel`, `startDate` and
`endDate`, so "will this candidate hold the required degree?" is
arithmetic over the resume's own fields — a fact, not a probability. The
note carries one of:

| status | meaning |
|---|---|
| `met` | the resume lists a matching, finished degree |
| `in-progress` | listed, with the completion date — *"your BSc completes in June 2027"* |
| `alternative-accepted` | not listed, but the JD allows another route |
| `not-listed` | not listed, and no alternative offered |
| `unknown` | no reference date available, so no date comparison |

A **higher degree satisfies a lower requirement** (a master's satisfies a
bachelor's ask) — which is how employers read it.

### The keyword vocabulary lost the eligibility words

`lib/scoring/jd-tokens.ts` (new) is now the ONE implementation of the
JD's token vocabulary, shared by the ATS Keyword Match score
(`dimensions/ats-matching.ts`) and the "add these missing keywords" tip
(`tips.tsx`). They used to have two copies with a comment admitting they
could drift — and they DID drift once already.

Eligibility words are excluded from the vocabulary, but **only when the
JD actually states an eligibility requirement**. A JD with no degree,
certification or authorisation keeps exactly the vocabulary it had, so
this cannot move a score for the majority of JDs.

The exclusion list is deliberately narrow: `certificate` and `license`
are NOT in it, because "SSL certificate" and "Apache License" are real
technical terms candidates list. `master` is only excluded when a
master's-level degree gate was detected, because "Master Data Management"
is a technology.

### Where it surfaces

- **The scorecard** — a new "Eligibility requirements" block
  (`components/scorecard/eligibility-list.tsx`), deliberately OUT of the
  skill-gap list, with calmer colours: most of these are fine.
- **The chat agent** — `buildAtsContext` lists them under their own
  heading and tells the model *"do not tell them to add a degree to their
  resume"*.
- **The `getAtsScore` tool** — its output has the same separate block.

## Why this was not a schema change

The obvious fix is to add a `qualifications` field to the intent schema
and have the extractor fill it. That is the right eventual shape — and it
is the Jev work — but it is not what this fix does, for three reasons:

1. **It would not fix the JDs already stored.** Every JD attached before
   the change would still have the degree sitting in `mustHaveSkills`,
   with no qualification field, and no backfill. Detecting at scoring
   time fixes them retroactively, for free.
2. **The detector does not need a model.** The requirement text is
   right there. A model call to sort "Bachelor's degree" out of a skill
   list is a model call to solve a problem that pattern matching solves.
3. **It keeps the schema question separate.** When the intent schema
   grows a `qualifications` field, this module stays as the fallback for
   rows that predate it — and the two compose.

## Honest limits

- **"5+ years of experience" is still scored as a skill.** It is an
  eligibility gate in the same way a degree is, and Seniority Fit
  already penalises it, so it is double-penalised. But excluding it
  deterministically risks dropping real requirements — "5+ years of
  experience with React" names a technology and must stay a skill — and
  a wrong exclusion would silently lose a genuine skill gap. That is the
  exact class of bug this whole exercise is fixing, so it was left
  alone rather than guessed at. The Jev work can classify it properly.
- **The detector is pattern-based.** "Bachelor's in Computer Science"
  and "Undergraduate degree" are handled; an unusual phrasing like
  "BSc" is handled; something like "a university education" is not.
  The consequence of a miss is mild — the requirement stays a skill, so
  the old behaviour applies — but it is a miss.
- **The `now` used for the date comparison is injected.** `lib/scoring/`
  forbids `new Date()` and `Date.now()`, so `scoreResume` takes it as an
  argument and `scoreResumeFromEnvelope` threads its existing `now`
  through. A caller that does not pass one gets `unknown` rather than a
  guess.
- **Persisted score snapshots predate the field.** `ScoreBreakdown.eligibility`
  is optional for that reason; consumers read `breakdown.eligibility ?? []`.

## Tests

- `tests/unit/scoring/qualifications.test.ts` (29) — the detector, the
  date parsing, the level matching, the evaluation.
- `tests/unit/scoring/eligibility-integration.test.tsx` (16) — the
  reported scenario end to end: the degree is not in the miss list,
  carries no penalty, appears as an eligibility note with the right
  date, is absent from the keyword tip, and reaches the assistant as
  something it must not present as a missing skill.
- `tests/unit/eligibility-list.test.tsx` (6) — the scorecard block.

Three bugs were found by the tests rather than by reading the code:
`"Master of Science"` was not detected as a master's level (the
detector wanted the literal word "degree"), `requiredDegreeLevel` was
`undefined` rather than `null`, and the certification rule needed to
distinguish "must be certified in AWS" from "AWS Certified Solutions
Architect".

## Suite state

1818 → **1883** tests. Typecheck and `pnpm build` clean.
