# Drift — The scoring engine reads 10 of 51 resume fields

Date: 2026-11-16
Branch: `main`

## What prompted this

The founder asked: *"Are we actually taking into account all the parts of a
resume in our scoring — for example even little things like the location,
summary, education courses, certifications, etc.? Look and tell me."*

This is the same question that produced the Seniority Fit, Role Fit and ATS
Similarity findings — and it was asked about **the whole envelope**, not one
dimension.

**The answer: no. Most of the resume is invisible to the score.**

## The method (why this is a measurement, not an opinion)

The engine has seven dimensions and a lot of prose about them. Prose is not
evidence. So this is measured:

`scripts/probe-field-coverage.ts` (**`pnpm probe:field-coverage`**) plants a
marker token (`Kafka`) in **one leaf field at a time**, plants the same marker
in the JD's `requirements` + `mustHaveSkills`, and re-scores with the shipped
engine. The JD side is identical for every variant, so any delta is caused
solely by the resume side.

- Field read → the marker reaches the scored text → the JD keyword matches →
  the score moves.
- Field ignored → the marker never arrives → the score does not move.

Plus three structural probes: empty a whole section (catches fields that
matter by *presence* only), move the dates (which dates count), and resolve
the eligibility notes.

It is offline, deterministic, writes nothing, and uses the **sync** engine —
the async hybrid path feeds the same fields (`lib/scoring-async/score-hybrid.ts`
`toTextSource` mirrors `lib/scoring/score.ts` `resumeDataToScoreable`).

`scripts/probe-role-fit-titles.ts` (**`pnpm probe:role-fit-titles`**) does
the same for Role Fit, which needs the embedding model.

## Result — 10 of 51 probed fields move the score

### Read, and weighted

| Field | Where it lands | Δ overall |
|---|---|---|
| `basics.summary` | Keywords, Format, Intent | **+3.00** |
| `basics.label` | Keywords, Format, Intent | **+3.00** |
| `skills[].name` | Keywords, Format, Intent | **+3.00** |
| `skills[].keywords[]` | Keywords, Format, Intent | **+3.00** |
| `work[].description` | Keywords, Format, Intent | **+3.00** |
| `work[].positions[].title` | Keywords, Format, Intent, Role Fit | **+3.00** |
| `projects[].name` | Keywords, Format, Intent | **+3.00** |
| `projects[].description` | Keywords, Format, Intent | **+3.00** |
| `projects[].highlights[]` | Keywords, Format, Intent | **+3.00** |
| `work[].positions[].highlights[]` | Keywords, Format, **Impact**, Intent | **+2.00** |

Ten fields, and they are the ten you would guess: the summary, the headline,
the skills, the work bullets, the projects. Everything a resume is *for*.

### Read, but by presence only (content ignored)

| Section | How it is read | Δ if removed |
|---|---|---|
| `education[]` | **array non-empty** only (`hasEducation`, `lib/scoring/dimensions/structure.ts:75`) | **−1.00** (Format −12.5) |
| `awards[]` | **boolean** (`hasAwards` → Alignment "Unique Value", `lib/scoring/score.ts:556`) | 0 (projects still satisfy it) |
| `publications[]` | **boolean** (same flag) | 0 |
| `projects[]` | **boolean** (same flag) + its text | 0 (awards still satisfy it) |

`hasExtras` is binary: one project and ten projects score identically. That
is documented (`lib/scoring/dimensions/alignment.ts:19`) and unchanged.

### Read, but ADVISORY — it does not touch the score

`education[].degree.degreeLevel` + `startDate`/`endDate` feed the
**eligibility notes** (`lib/scoring/qualifications.ts`). Those land in
`breakdown.eligibility` and are shown to the user — but
`composeOverallScore` (`lib/scoring/score.ts:454`) takes only the seven
dimension scores, so **a missing degree costs zero points**. That is
deliberate and correct: a degree gap is not a rewritable bullet. But it
means "the engine reads your degree" and "the engine scores your degree" are
different claims, and only the first is true.

### Ignored entirely — 41 fields

```
basics.name, basics.email, basics.phone, basics.url
basics.location.city, .region, .countryCode, .address, .postalCode
basics.profiles[].username
work[].company, work[].location, work[].url
skills[].level
projects[].keywords[], projects[].roles[]
education[].institution, .location, .degree.majors[], .degree.minors[],
              .courses[], .gpa, .url
volunteer[].organization, .position, .summary, .highlights[]
awards[].title, .awarder, .summary
certificates[].name, .issuer
publications[].name, .summary
languages[].language, .fluency
interests[].name, .keywords[]
references[].name, .reference
```

**The four the founder named, specifically:**

- **Location** — ignored by design. `lib/scoring/tips.tsx:398-409` documents
  why: *"the engine's scored text deliberately excludes locations (a city is
  not a skill)"*. A city in your summary is noise; a city in your location
  field is noise. Reasonable. **But the JD's city is not symmetric** — see
  finding 2 below.
- **Summary** — the most-read field on the resume (+3.00). Fine.
- **Education courses** — ignored. `education[].courses[]` is in the schema
  (`lib/resume-schema/sections/education.ts`), rendered in the templates,
  and read by the **chat assistant** (`lib/chat/system-prompt.ts:184`) — but
  it never reaches the score. A candidate who lists "Distributed Systems,
  Databases, Operating Systems" gets no credit for a JD that names them.
- **Certifications** — ignored, and worse than ignored. See finding 1.

### Which dates count

| Probe | Result |
|---|---|
| All work end dates → 20 years ago | **Seniority −50** → work dates ARE read |
| Work removed + education end date in 2032 | Seniority falls to the neutral 50 — **education does not substitute for work history** |

So "years of experience" is work-history years only. A 4-year medicine
degree followed by 1 year of work reads as 1 year. Defensible (it is
*experience*, not study) but worth knowing.

---

## The findings that are actually bugs

### 1. P0 — The certification note states a falsehood

`lib/scoring/qualifications.ts:367-374`:

```ts
if (requirement.kind === 'certification') {
  return {
    requirement,
    status: 'not-listed',
    message:
      'This role asks for a certification or licence. Your resume does not ' +
      'list one — check whether you hold it, and add it if you do.'
  };
}
```

`sections.certificates` is **never consulted**. The message is emitted
unconditionally. Measured, with a resume that *has*
`AWS Solutions Architect Associate` in `sections.certificates`:

```
certification — "Must be certified in AWS"
  status: not-listed
  This role asks for a certification or licence. Your resume does not list
  one — check whether you hold it, and add it if you do.
```

**"Your resume does not list one" — it does.** The candidate with the exact
certification is told to go and add it. The dead binding `const listed =
education.length > 0;` two lines above is the fossil of an attempt to check
something (eslint flags it: `'listed' is assigned a value but never used`).

### 2. P1 — The JD's own city is charged to the candidate

This is the *"A resume in Edmonton applying to an Edmonton job was told to
add 'edmonton' and 'ab' to its resume"* bug from `lib/scoring/tips.tsx:398-403`
— **the tip side was fixed, the score side was not.**

`flattenJobText` (`lib/scoring/similarity.ts:115`) reads the JD's
`title`, `description`, `requirements`, `niceToHaves`, `benefits`. The JD's
structured `location` field is not read — but any **prose** mention of the
city enters the JD's keyword vocabulary, and the resume's
`basics.location.city` is excluded from the scored text, so it can never pay
that token off.

Measured, same resume in all three rows, `basics.location.city =
"San Francisco"`:

| | exact overall | Keywords |
|---|---|---|
| JD without a city in the prose | 67.45 | 54 |
| JD mentioning "San Francisco, CA" | 67.05 | **52** |
| same JD, "San Francisco, CA" copied into the **summary** | 68.33 | **58** |

The candidate loses 2 Keywords points for the job's own city, their location
field does not restore it, and pasting the city into the summary earns 6.
Small (−0.4 points overall) but it is a wrong-direction charge, and the fix
is one line in the JD flattener.

### 3. P1 — `basics.label` is excluded from the dimension it should dominate

Role Fit compares the JD's title against the resume's titles. The titles it
collects (`lib/scoring-async/role-fit.ts:190-204`) are **work position
titles only**. `basics.label` — the candidate's headline, the single most
tailored line on the resume — is not among them, even though it *is* in the
ATS keyword blob.

Measured (`pnpm probe:role-fit-titles`, JD = "Senior Backend Engineer"):

| Resume | Role Fit | Best match |
|---|---|---|
| headline "Senior Product Engineer", work titles "Senior Product Engineer" | 90 | "Senior Product Engineer" |
| **headline "Senior Backend Engineer"**, work titles "Data Analyst" | **65** | "Data Analyst" |
| headline "Data Analyst", **work titles "Senior Backend Engineer"** | **100** | "Senior Backend Engineer" |

The candidate whose headline matches the JD exactly scores **65**; the
candidate whose *old job title* matches scores **100**. Role Fit is
measuring your history, not your pitch.

### 4. P2 — The envelope-aware Intent Coverage flattener is dead code

`lib/scoring/dimensions/intent-coverage.ts:280` has
`flattenResumeTextForIntentCoverage`, which **does** include education
institution + majors + minors, awards, and publications ("A JD that names a
qualification should be able to find it in the resume"). It is reachable only
through `scoreIntentCoverage` (the envelope wrapper) — and **the only callers
of that wrapper are the tests.** Production calls
`scoreIntentCoverageParams` with `flattenResumeText(resume)`
(`lib/scoring/score.ts:541,574`), which excludes all three.

So the comment says "a JD that names a qualification should be able to find it
in the resume", and the qualification in a resume cannot be found. Meanwhile
the **tip** renderer *does* include education + awards + publications
(`lib/scoring/tips.tsx:424-437`) — so the tip and the score disagree, which
is the exact failure mode this codebase has been bitten by twice.

### 5. P2 — Eligibility gates are only found in the extractor's skill lists

`lib/scoring/dimensions/intent-coverage.ts:225-228` builds the gate list
from `mustHaveSkills` + `niceToHaveSkills` — **not** from `job.requirements`.
A JD whose degree requirement sits only in `requirements` (and which the
extractor did not mirror into the skill list) produces **no eligibility note
at all**. Measured: the gates produced nothing until they were moved into
`mustHaveSkills`.

---

## What this is NOT

- **Not a regression.** The 10 read fields have always been read; the 41
  ignored fields have always been ignored. This memo records the shape.
- **Not "the engine is broken".** 7 dimensions, 10 fields, one weighted
  score — the core loop is sound and the three defects fixed this month
  (Role Fit, Seniority Fit, ATS Similarity) are all *within* the fields
  that are read.
- **Not a demand that every field be scored.** A GPA is not a skill. A
  reference is not a qualification. `interests` and `languages` are
  correctly absent from an ATS score for most roles. **The interesting
  cases are the ones that are *wrong*, not the ones that are merely
  absent** — findings 1 to 3 above.

## Action items (tiers — the founder picks the tier)

| Tier | Item | Effort |
|---|---|---|
| **P0** | Certification note must consult `sections.certificates` and stop asserting a falsehood | small |
| **P1** | Exclude the JD's location tokens from the JD vocabulary (or make location readable) — closes the Edmonton bug on the score side | small |
| **P1** | Add `basics.label` to Role Fit's title set | small |
| **P2** | Wire the envelope-aware Intent Coverage flattener into production (or delete it and fix the comment) | medium |
| **P2** | Detect eligibility gates in `job.requirements` as well as the skill lists | medium |
| **P3** | Decide, deliberately, whether certificates / languages / education courses should count — and write down the answer | design |
| **P3** | Consider whether "Unique Value" should count projects rather than test for their presence | small |

## How to reproduce

```bash
pnpm probe:field-coverage      # the 51-field table + sections + dates + eligibility + city
pnpm probe:role-fit-titles     # Role Fit's title set (needs the MiniLM model)
```

Both are offline and write nothing.

## The lesson (added to AGENTS.md as a recurring trap)

**A field's presence in the schema is not evidence that the engine reads
it.** Probe it: plant a marker in one field, re-score, and see whether the
number moves. The reason this codebase keeps finding these is that the
*schema* (`lib/resume-schema`) and the *scorer* (`lib/scoring`) are separate
packages with separate field lists, and the scorer's list is the narrow
`ResumeTextSource` shape — a deliberate design choice (the engine must not
depend on the envelope) that quietly costs fields their reach. The two lists
must now be read together, not one at a time.

The companion lesson: **when a tip and a score disagree, fix BOTH sides.**
The location bug was fixed in `tips.tsx` and left in `similarity.ts`.
