# Drift — Seniority Fit measured nothing, and charged the candidate for it

Date: 2026-11-16
Branch: `main`

## What prompted this

The founder asked a sharp question about their own scorecard: *"Is the
seniority fit actually correct?"* — because it read exactly **50**, the
neutral constant, on a resume with six internships.

**It was not correct. It was measuring nothing, and the failure was
charging them points for a typing habit.**

## What was wrong

The Seniority Fit dimension compares the candidate's years of experience
against the JD's stated requirement. It got the years by parsing the
resume's work-history dates — with its own parser, in
`lib/scoring/dimensions/seniority-fit.ts`:

```ts
// Only these:
/^(\d{4})$/                  // "2020"
/^(\d{4})-(\d{2})(?:-(\d{2}))?$/  // "2020-01", "2020-01-15"
```

**But the date field is free text.** `components/resume-templates/date-range.tsx`
passes through whatever the user typed (*"Mar 2020" → "Mar 2020"*), and the
schema says ISO is *allowed*, not required. A real resume stores **"May
2026"**, **"September 2022"**, **"Sep. 2022"**.

Every one of those failed to parse. The dimension summed **0 months**,
saw `resumeYears === 0`, and returned its neutral 50 — which reads like
*"we couldn't measure this"* but actually:

- **charged the candidate 5 of their 100 points** (0.10 × 50) against a
  JD that asked for **no experience at all**, and
- **made the date format decide the score** — the same career written
  "2026-05" scored 100, written "May 2026" scored 50.

The production evidence, on the founder's own resume: every snapshot on
the account read `seniorityFit=50` — including the ISO-date fixtures in
the demo seed, which read **100**. The difference was not the candidate;
it was the date format.

## The irony

**The codebase already knew the right formats.** `lib/scoring/qualifications.ts`
(the eligibility / degree check) had a `parseYearMonth` that handles
"June 2027", "Jun 2027", "06 2027", "2027/06" — and a test literally
named *"reads the formats resumes actually use"*.

The Seniority Fit dimension simply carried a **second, weaker copy** of the
date parser. Two modules, two parsers, two different answers to the same
question.

## The fix

**One parser, shared.** New `lib/scoring/date-parse.ts` holds the date
grammar; `qualifications.ts` re-exports it (it is still part of that
module's public surface), and the Seniority Fit dimension uses it too.

**A future end date is clamped to now.** A role listed as "May 2026 –
December 2026" has run from May to now — not for eight months. You cannot
have experience that has not happened yet, and the engine was paying the
candidate for it.

## The lesson worth keeping

**The tests were written in the format the parser accepted, not the
format the product's users produce.** Every fixture in
`tests/unit/scoring/dimensions/seniority-fit.test.ts` used ISO dates
("2018-01", "2020-01-15"), so the suite passed happily while the
dimension did nothing for every real user.

The new fixtures use the formats people actually type — "May 2024",
"Jan 2024", "Sep. 2023", "September 2023", "05 2024" — and one test
asserts the regression directly: **the same career written two ways must
score the same.**

## Measured

On the founder's production resume, with the fix:

| | Before | After |
|---|---|---|
| Seniority Fit | 50 (unmeasurable → charged as neutral) | **100** |
| Role Fit | 92 | 92 |
| Alignment | 83 | 83 |
| **Overall** | 74 | **~79** |

100 is the right answer, not 50: the JD says *"What you've built matters
more than years of experience, and a degree isn't required"*, so the
extractor recorded `yearsRequiredMin: 0` — the JD asks for **no**
experience, and the candidate meets it. The neutral 50 was penalising
exactly the candidate this JD was written for.

## Files

**New**

- `lib/scoring/date-parse.ts` — the one date parser.
- `docs/drift/2026-11-16-seniority-fit-measured-nothing.md` — this memo.

**Changed**

- `lib/scoring/dimensions/seniority-fit.ts` — uses the shared parser;
  clamps a future end date to now.
- `lib/scoring/qualifications.ts` — re-exports the shared parser.
- `tests/unit/scoring/dimensions/seniority-fit.test.ts` — 9 new tests using
  the formats users actually type.

## Verification

- `pnpm lint` — 0 errors.
- `pnpm typecheck` — clean.
- `pnpm test` — all green (24 tests in the seniority suite, 2,245 across
  the repo).

## Related

This is the **third** dimension in a row that measured nothing while
looking like a measurement — Role Fit (no JD title) and Seniority Fit
(unparseable dates) both read the neutral 50 for every user, and both
were invisible because a constant looks like a plausible score. The
pattern is in the drift memo
`2026-11-16-role-fit-and-the-silent-semantic-signal.md`, and the
principle now in AGENTS.md: **a number that cannot be wrong is a number
that cannot be right.**
