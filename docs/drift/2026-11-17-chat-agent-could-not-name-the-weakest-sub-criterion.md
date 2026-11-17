# Drift — the chat agent could not name the weakest sub-criterion

Date: 2026-11-17
Branch: `main`

## What prompted this

The founder, on the scoring work:

> *"does our AI chat agent see all the ATS scoring dimensions?"*

and then:

> *"Add the criteria-level ATS scores to the chat agent's context and
> verify it identifies the weakest sub-criterion."*

The answer to the first question was **yes for the dimensions, no for
everything below them** — and the gap mattered, because the advice the
scorecard shows is keyed by *criterion*, not by dimension.

## The gap

The scorecard shows **seven dimension bars**. Each bar is made of
**twelve sub-criteria**:

| Dimension | Criteria |
|---|---|
| Keywords | ATS Keyword Match, ATS Similarity |
| Format | Section Completeness, Optimal Length |
| Impact | Accomplishment Focus, Action Verb Usage |
| Experience match | Tailoring, Unique Value, Soft Skills |
| Intent coverage | Intent Coverage |
| Role fit | Role Fit |
| Seniority fit | Seniority Fit |

The chat agent's context (`buildAtsContext`) carried the seven
dimension numbers, the missing keywords, the eligibility notes, the
per-criterion advice and the "Start here" line — and **no criterion
scores at all**.

So a candidate asking the chat *"what exactly is weak here?"* could get
back *"your Impact score is 77"* and nothing more. The scorecard
beside it was saying *"10 of 29 work bullets describe a task rather
than an outcome (…named bullets…)"*. Two surfaces, one resume, and
the chat was the vaguer one.

The agent could not have known better: the numbers were not in its
context, and the advice list it *did* receive is keyed by criterion
("Accomplishment Focus: …"), so it had no way to connect the bar to
the fix.

## The fix

### One canonical criterion map

`lib/scoring/criteria.ts` now owns the criterion → dimension map.
`lib/inline-issue/dimension-criteria.ts` re-exports it, so the
scorecard drill-down and the chat agent read the **same** map. Two
hand-written maps would have drifted — and a drifted map means the
chat says "your weakest thing is in the Impact dimension" while the
scorecard opens a different bar.

A test asserts the map and the inline-issue surface's union are the
same set, at compile time and at runtime.

### The block both surfaces render

`lib/chat/ats-criteria-text.ts` renders the block, and
`lib/chat/prompt-context.ts` + `lib/chat/ats-score-format.ts` use it
in **both** places the model sees the score:

- the **system prompt** (every turn), and
- the **`getAtsScore` tool** (after the agent's own edits — it needs
  the criteria to say which part improved, not just that "it went
  up").

The tool's renderer was moved out of the tool into its own module so
it is testable without the session, the database and `server-only`.

The block, verbatim from production (the founder's own 91):

```
Sub-criterion scores (0–100) — the fine-grained parts behind each dimension, weakest first:
  Soft Skills 17 (Experience match)
  Accomplishment Focus 77 (Impact)
  ATS Keyword Match 89 (Keywords)
  ATS Similarity 89 (Keywords)
  Unique Value 89 (Experience match)
  Action Verb Usage 100 (Impact)
  Section Completeness 100 (Format)
  Optimal Length 100 (Format)
  Tailoring 100 (Experience match)
  Intent Coverage 100 (Intent coverage)
  Role Fit 100 (Role fit)
  Seniority Fit 100 (Seniority fit)

Weakest sub-criterion: Soft Skills (17/100), part of the Experience match dimension. This is the lowest-scoring part of the score that was actually measured.
```

### The part that is easy to get wrong: "not measured"

Three criteria can return the engine's **neutral default (50)** instead
of a measurement:

- **Intent Coverage** — v2 intent extraction did not run, so the
  criterion mirrors the keyword score;
- **Role Fit** — there was no title to compare against;
- **Seniority Fit** — no years signal on either side.

50 looks like a mediocre score. It is a **non-measurement**. Reporting
one of them as "your weakest sub-criterion" would send the candidate
to fix something that is not broken.

So every criterion row carries a **measurement status**, and the
weakest is chosen only among the rows that were genuinely measured.
The unmeasurable ones are listed separately and marked:

```
Could NOT be measured (the engine default — NOT a weakness to fix):
  Role Fit 50 (Role fit) — no signal recorded for this score — the reading is the engine default
```

`ScoreBreakdown` now carries a `roleFit` block (similarity + fallback
flag), mirroring `seniorityFit`, so the status is **exact** for every
new snapshot. For snapshots written before that block existed, the
engine's own rule applies: a reading that is exactly the neutral
constant with no signal recorded **is** the neutral constant; anything
else is a measurement, because the engine only produces a non-neutral
value when it had a signal.

## The verification

### The probe on real data

`pnpm probe:chat-weakest-criterion` scores the REAL chat model against
REAL resumes and REAL persisted snapshots (SELECT only; no tools are
exposed, so nothing can be edited).

Production, three scored variants:

| Resume | Stored score | Engine's weakest | Agent's answer |
|---|---|---|---|
| CleerDental (founder) | **91** | Soft Skills (17) | ✅ named **Soft Skills** |
| variant | 50 | Tailoring (0) | ✅ named **Tailoring** |
| variant | 72 | Tailoring (0) | ✅ named **Tailoring** |

The 91's answer, in the agent's own words:

> **Your weakest point is Soft Skills (17/100) — in the "Experience
> match" dimension.** The scorecard's fix is: *"Your resume is missing
> leadership, collaborated, communication, and cross-functional
> mentions — add them with concrete examples."*
>
> **What you can actually do:** add real evidence for **collaboration**
> and **cross-functional** work… I'd also note the engine flagged your
> leadership evidence as not counted…
>
> **One note on priority:** Impact (Accomplishment Focus, 77/100,
> about 21% of your overall score) is still the highest-value edit
> after this.

Two things to note in that answer:

1. it **quoted the scorecard's advice** for the criterion it named, and
2. it **agreed with the "Start here" line** (Impact is the
   highest-value edit) instead of contradicting the prompt.

### The probe on the full production prompt

`tests/unit/ai/weakest-criterion-probe.test.ts` (run with
`RUN_AI_PROBE=1`) scores a real resume against a real job with the
shipped engine, builds the **exact** prompt the chat route builds, and
asks the question:

```
### overall 64 · weakest: Soft Skills (25) · unmeasurable: Role Fit
```

> The weakest measured part is **Soft Skills at 25/100**, under the
> Experience match dimension. The scorecard's fix is: *"Your resume is
> missing leadership, communication, stakeholder, and cross-functional
> mentions. Add them with concrete examples."*

and it did **not** blame Role Fit — the criterion with no signal.

## What else moved

- `lib/chat/system-prompt.ts` lost the pure builders to
  `lib/chat/prompt-context.ts`. It still re-exports them, so every
  import path is unchanged. The reason: `system-prompt.ts` pulls the
  resume **template components** in, and those are React components —
  a plain Node script cannot load them (under the `react-server`
  condition React's server build has no `createContext`). A probe
  script could not build the prompt at all until the pure half was
  separated.
- `lib/chat/tools/get-ats-score.ts` lost its renderer to
  `lib/chat/ats-score-format.ts`, for the same reason (the tool is
  server-only and session-bound; its output is pure).

## The traps, written down

1. **A dimension score is not a criterion score.** Seven numbers cannot
   answer "which part is weak", and the advice the scorecard shows is
   keyed by criterion — so the agent and the scorecard were talking
   about different things at the same granularity.
2. **A 50 that means "could not measure" is not a mediocre score.**
   Ask what produced the number before ranking by it. This is the same
   lesson as the neutral 50 that three dimensions used to return, and
   as the Role Fit zero that the dead semantic model produced.
3. **Two surfaces that show the model the same thing need ONE
   renderer.** The advice block was added to the prompt and not to the
   tool; the criteria block now goes through one helper.
4. **A map two surfaces depend on must live in the domain, not in the
   surface.** `lib/scoring/criteria.ts`, re-exported by the
   inline-issue module.
5. **"Does the agent know?" is answered by the agent answering.** Not
   by a prompt containing the number — by the answer naming it.

## Files

- `lib/scoring/criteria.ts` (new) — the canonical map, the measurement
  status, the weakest criterion.
- `lib/scoring/score.ts` — the `roleFit` block on the breakdown.
- `lib/chat/ats-criteria-text.ts` (new) — the block, rendered once.
- `lib/chat/prompt-context.ts` (new) — the pure prompt builders.
- `lib/chat/ats-score-format.ts` (new) — the tool's renderer.
- `lib/chat/system-prompt.ts` — uses the extracted builders; re-exports
  them.
- `lib/chat/tools/get-ats-score.ts` — uses the extracted renderer.
- `lib/inline-issue/dimension-criteria.ts` — re-exports the canonical
  map.
- `scripts/probe-chat-weakest-criterion.ts` (new) — the real-data
  probe.
- `tests/unit/scoring/criteria.test.ts` (new),
  `tests/unit/chat/ats-criteria.test.ts` (new),
  `tests/unit/ai/weakest-criterion-probe.test.ts` (new).
