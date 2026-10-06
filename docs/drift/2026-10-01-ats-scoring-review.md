# ATS Scoring Engine — Review, 2026-10-01

> **Status: defects 1–4 FIXED** on branch `fix/ats-scoring-defects` (same
> branch as this memo). Defects 5–7 are open and are decisions, not bugs —
> see "What was deliberately not changed" at the end. Calibration numbers and
> the "After" column below are measured on the real 50-entry corpus.

**Status:** findings only for §5–§7. **No code changed there.** Nothing in
this memo is a criticism of the v2 work as shipped — the Phase 1/2 build was
good work against a tight scope, and Pearson r 0.923 against a 50-entry
hand-labelled corpus is a real achievement. The problem is that the corpus
cannot see most of what's below, so the number gives more confidence than the
engine has earned.

Every claim marked **[verified]** was reproduced by executing the real
dimension functions, not by reading them.

---

## Calibration: before → after

Measured on `tests/fixtures/ats-corpus.json` (50 entries), fixed clock
`2026-09-20`, acceptance gate **Pearson r > 0.7**.

| | before | after | note |
|---|---|---|---|
| Pearson r | 0.9238 | **0.9103** | −0.0135, well inside the 0.7 gate |
| engine score span | 38 → 73 (**38 pts**) | 38 → 86 (**48 pts**) | 26% wider use of the 0–100 range |
| ideal span (hand labels) | 12 → 92 (80 pts) | unchanged | |
| mean delta (engine − ideal) | −0.46 | **+7.36** | see below |
| `alignment` mean | 12.7 (max 41.5) | — | the squeeze is gone |
| `contentQuality` mean | 43.6 (max 62.5) | — | no longer capped at 70 |

**The +7.36 bias is real and was left in place deliberately.** It is the
arithmetic consequence of returning points that were being wrongly withheld:
a satisfied `Python/Django` no longer costs 8, and quantified/action-verb
bullets are no longer divided away. It is *not* re-centred, because rescaling
the overall score would hide the fact that the scale has changed meaning —
and because the composition skew behind it (below) is a product decision, not
a number to nudge. **Worth a decision before shipping: is a 7-point generous
bias acceptable, or should the corpus labels be re-reviewed instead?**

---

## Summary

The engine is *directionally* sound and internally inconsistent. It scores
"how well is this resume written" and "how well does this candidate fit this
job" and averages them roughly 50/50 under a label that promises the second.

| # | Defect | Severity | Status |
|---|---|---|---|
| 1 | `intent-coverage` matches skills with bare `String.includes` | **High** | **Fixed** — token-set matching via new `lib/scoring/skill-match.ts` |
| 2 | `content-quality` sub-weights sum to 0.7, not 1.0 | **High** | **Fixed** — normalised by the running weight sum |
| 3 | `alignment.tailoring` is a Jaccard with mismatched operands | **Medium** | **Fixed** — recall of the title's vocabulary |
| 4 | No per-skill assertion in the calibration harness | **High** | **Fixed** — `skill-match.test.ts`, `alignment-tailoring.test.ts` |
| 5 | ~49% of weight measures craft, not JD fit | — | **Open** — product decision |
| 6 | Weights never fitted, only inherited | — | **Open** — do after 5 |
| 7 | Jev evaluation | — | **Open** — see §6 |

And one structural finding that reframes all of it:

> **Pearson r = 0.9238 did not protect against this class of bug.** The
> calibration corpus *does* contain compound skills (`Kubernetes / Helm`,
> `ArgoCD / GitOps`, `GCP / Azure`) — and the score still came out 0.9238,
> because a single 8-point error inside a dimension weighted 0.10 moves the
> overall score by 0.8 points. Correlation over 50 entries simply does not
> resolve that. This is why fix 4 (per-skill fixtures) matters as much as the
> three code fixes.

---

## 1. The compound-skill bug — worse than a miscount

`lib/scoring/dimensions/intent-coverage.ts` matches a must-have skill with a
case-insensitive substring test against the flattened resume text:

```ts
if (!resumeTextLower.includes(skill.toLowerCase())) {
  missed.push(skill);
}
```

**[verified]** With `mustHaveSkills: ['Python/Django']` against a resume
reading *"senior backend engineer with python, django and flask experience"*:

```
value: 92        // −8 penalty applied
missed: { mustHave: ['Python/Django'] }
```

The candidate **has the skill**, and is both penalised 8 points *and* told
"you missed Python/Django" — which is worse than no signal, because the advice
is wrong and the user may try to satisfy it by pasting the literal string
`Python/Django` into their resume.

The same test produces the opposite error. **[verified]** With
`mustHaveSkills: ['Go', 'R', 'C']` against a resume mentioning only MongoDB
and Redis:

```
value: 100       // full marks
missed: { mustHave: [] }
```

`go`, `r` and `c` are all substrings of `mongodb`. So the dimension swings
**92 → 100 on invented matches**, in both directions, on the same code path.
At 8 points per must-have × 0.10 weight, one compound token is 0.8 points of
the final score; a JD listing four slash-joined stacks is 3.2 points.

### The sting: this exact bug was already found and fixed

`dimensions/ats-matching.ts` moved *away* from substring matching during
Phase 1, and documents why:

> *"the original implementation used substring containment for the keyword
> sub-criterion (so "python" matched "python3", "pythonic", and "Python 3.9").
> … Phase 1 of the post-ship review replaced substring with token-set
> membership. … TalentTuner reports 91% precision with token-set vs 67% with
> substring matching in their 2024 study."*

`intent-coverage.ts` was added afterwards and its header says it keeps
*"the same as v1's `computeMissingKeywords` — keeps the v1/v2 transition
honest."*

So the v2 dimension deliberately re-adopted a method the v1 dimension had
already retired, on the grounds of continuity. The engine now scores the same
job description **two different ways at once** — token-set in
`ats-matching`, substring in `intent-coverage` — and can disagree with itself
about the same skill.

Confirmed good news: `tokenize()` splits on `/\W+/`, so `Python/Django`
already becomes `['python','django']` **[verified]**. The correct fix is
already sitting in `lib/scoring/similarity.ts`, one import away.

---

## 2. `content-quality` is capped at 70

`lib/scoring/dimensions/content-quality.ts`:

```ts
const WEIGHTS = { accomplishment: 0.4, actionVerb: 0.3 } as const;
value: WEIGHTS.accomplishment * accomplishmentRatio +
       WEIGHTS.actionVerb * actionVerbUsage
```

0.4 + 0.3 = **0.7**. A resume with 100% numeric bullets *and* 100%
strong-action-verb bullets scores **70**, not 100. The doc comment still
describes `value` as "0-100".

The cause is visible in the header: readability was dropped as a third
sub-criterion, its 30% "gets split: 20% → accomplishment, 10% → action
verbs" — and the 0.7 total was never re-normalised. It looks like the intent
was 40/30/30, and dropping readability left a hole rather than redistributing.

`WEIGHTS_V2` gives this dimension **0.21** of the overall score, so 6.3 of the
100-point scale is structurally unreachable. For comparison, `structure` and
`alignment` both sum to 1.0 correctly — this is a one-off.

---

## 3. `alignment.tailoring` is mathematically squeezed

`lib/scoring/dimensions/alignment.ts`:

```ts
tailoring = jaccard(tokenize(resume.basics.summary), tokenize(job.title)) * 100
```

Jaccard is `|A ∩ B| / |A ∪ B|`. Here `A` is the **whole summary** and `B` is
the **job title** — typically 2–4 tokens. The numerator can therefore never
exceed the title's length, while the denominator is the entire summary.

A realistic 3-token title against a 30-token summary caps `tailoring` at
**~10%**, no matter how perfectly targeted the summary is. **[verified]** a
deliberately title-stuffed 11-token summary reached 27% — the cap tightens as
the summary grows, which is the wrong direction: a more detailed summary
*lowers* its own tailoring score.

`tailoring` carries 0.5 inside `alignment`, which carries 0.14 overall — so
half of a 14% slice is effectively always near zero. The dimension is
contributing ~0.7 points of 7 available.

The fix isn't a bigger weight; it's a different measure. Recall-oriented
(`|A∩B| / |B|` — "of the things the JD asked for, how many does the summary
name?") matches the stated intent, "a well-tailored resume's summary echoes
the words the JD uses", and is not bounded by summary length.

---

## 4. Is the score measuring the right thing?

`WEIGHTS_V2` (sums to 1.00):

| dimension | weight | measures job fit? |
|---|---|---|
| `atsMatching` | 0.21 | yes |
| `structure` | 0.14 | **no** — resume-length + section presence |
| `contentQuality` | 0.21 | **no** — numbers in bullets, action verbs |
| `alignment` | 0.14 | partly (tailoring only) |
| `intentCoverage` | 0.10 | yes |
| `roleFit` | 0.10 | yes |
| `seniorityFit` | 0.10 | yes |

**~0.49 of the weight measures resume craft that is independent of the
specific job posting.** A competently written resume for a completely
different discipline scores ~49 before a single JD fact is considered.

That may be a legitimate product decision — "is this a good resume *and* a
match" — but the surface is labelled an **ATS score**, and users read a
number as "how well do I match". If both are wanted, they should be two
numbers, not one average. This is the single biggest design question here,
and it's a product call, not a bug.

### Specific fairness concerns in the non-fit half

- **Numbers in bullets (0.4 of contentQuality).** Rewards quantification
  ability, which is genuinely unevenly distributed across fields and roles.
  A recruiter, a lawyer, and an academic often can't write "reduced cost by
  23%". They are scored down for candour, not capability.
- **Action verbs (0.3).** Exact-match against a hardcoded 99-verb list
  (`ACTION_VERBS`). A bullet starting "Owned…" or "Spearheaded…" that a human
  reads as strong scores zero.
- **Length (0.5 of structure).** 500–800 words is treated as universal. It is
  wrong for a 15-year career, an academic CV, and a career-changer.
- **`hasExtras` (0.3 of alignment).** Binary 0/100. One project and ten
  projects score identically.
- **`SOFT_SKILLS`** was expanded to 12 phrases (the `alignment.ts` docstring
  still says 4 — stale comment, harmless).

None of these are *wrong*. They are unvalidated assumptions currently
weighted as if they were measurements, which is what makes the engine feel
unfair to users who don't fit the template.

---

## 5. What the calibration harness can and cannot see

`tests/fixtures/ats-corpus.json`, 50 hand-labelled entries, Pearson r 0.923
against the shipped engine.

Good: it caught the Seniority Fit over-qualification regression (Pearson
0.907 → 0.9238).

Blind to:

- **Any 0.10-weighted error.** 0.8 points of overall movement is below the
  resolution of a 50-point correlation. Defects 1 and 3 both live entirely
  inside that band.
- **Fairness.** A corpus measures correlation to a label. It cannot express
  "this is a wrong claim about a skill", which is what defect 1 does.
- **Compounding.** Every corpus entry is a whole resume+JD pair; a corpus has
  no notion of "this one skill was judged wrong" as an independent unit.

The corpus *does* contain `Kubernetes / Helm`, `ArgoCD / GitOps` and
`GCP / Azure` as must-haves — and r still came out 0.923. That's the clearest
possible evidence that the acceptance gate is not sensitive to this class of
defect.

**If you only do one thing to the harness:** add per-skill assertions, not
just per-resume correlation. A fixture asserting `mustHave ['Python/Django']`
is satisfied by a resume listing Python and Django would have caught this on
day one.

---

## 6. Jev (TypeSafe) — real fit, in one narrow place

Checked with the account-level CLI. It **is** on your Gateway:

```
typesafe-ai/jev · provider digitalocean · status 0 · uptime 100% (1h)
pricing  prompt $0.042 / 1M,  completion $0 (free)
context  32,000  (64,000 per request incl. questions)
params   max_tokens, temperature, stop
```

It is a *System One Model*: it returns typed probabilistic decisions (`Bool`,
`Choice`, `Score`) in parallel instead of generating text. It cannot emit
strings, which TypeSafe says is the point — it can't hallucinate.

**Where it genuinely fits the problem above.** Defect 1 is fundamentally
"does this resume demonstrate skill X?" — a question with a confidence, asked
many times per score. That is Jev's exact primitive. Firing
`"Does this resume show production experience with Python?" → 0.87` per skill
replaces a substring test with a calibrated probability, and unlike a
hand-rolled synonym map it handles `Node.js` / `NodeJS` / `node.js`,
`Kubernetes / Helm`, and `Go` inside `MongoDB` correctly because it is
reading the text rather than pattern-matching it.

Cost is a non-issue: a 6k-token resume+JD is ~$0.00025 per score, and output
is free, so the parallel "speculative fan-out" pattern is affordable.

**Where it does not fit.**

- **Not the parser.** Extracting `mustHaveSkills` / `niceToHaveSkills` /
  `implicitSkills` from a JD is a structured-extraction task. Jev has no
  `response_format` and no list-extraction primitive. Keep Mistral Nemo.
- **Not the chat.** It cannot generate text. Ling 3.1 Flash is the answer
  there.
- **32K context** is tight — a long JD plus a long resume could get close.
- **Unverified:** whether *this* account can call it. It's not marked
  free-tier, and this repo has been burned twice by a model that looked
  available and 403'd. Test before planning around it.
- **Trust the vendor carefully.** The 67.8% vs 67.9% decision-task parity
  and the "193.6× faster" numbers are TypeSafe's own evals; their own
  commentary concedes that. It's early access, ~1 month old.

**Honest ranking:** fixing defect 1 with token-set matching is a ~20-line
change that fixes the known bug exactly and is verifiable today. Jev is the
more *general* fix — it would also handle synonyms, abbreviations and implied
skills that token matching won't. They are not mutually exclusive: token
matching is the floor, Jev is the upgrade worth *measuring* against the
corpus once it exists. Do the floor first.

---

## What was fixed

**Defect 1 → `lib/scoring/skill-match.ts` (new), wired into
`intent-coverage.ts`.** Three checks, cheapest first: a punctuation-collapsed
whole-skill match (so `Node.js` / `node-js` / `NodeJS` all hit), then
token-set membership requiring *every* constituent (so `Python/Django` needs
both, and `go` can never match inside `mongodb`), then a word-boundary
fallback for skills `tokenize` drops entirely (single letters like `"R"`).
`scoreIntentCoverageParams` now also accepts a prebuilt `SkillIndex` so the
engine indexes the resume once instead of per priority list.

**Defect 2 → `content-quality.ts`.** Divide by `WEIGHT_SUM` rather than
hardcoding a 0.7 divisor, so the 4:3 ratio between the surviving criteria is
preserved and the dimension stays correct if a weight changes again.

**Defect 3 → `alignment.ts`.** `jaccard(summary, title)` →
`titleCoverage()` = `|summary ∩ title| / |title|`. The defining property,
now asserted: **a longer summary can no longer lower its own tailoring
score.**

**Defect 4 → two new test files.** `skill-match.test.ts` asserts individual
skill claims (the unit of measurement the corpus lacked);
`alignment-tailoring.test.ts` pins the length-independence property. The
`score.test.ts` "poorly-matched" floor test was rewritten to *document* the
new ~33 floor rather than hide it, and `content-quality.test.ts` — which had
pinned the buggy 33.33 value, and was therefore part of why the 0–70 cap
survived — now asserts the normalised 47.62 plus a 100-reachable guard.

## What was deliberately not changed

- **Defect 5 (composition).** ~49% of the weight measures craft, not JD fit.
  Fixing it means either two numbers or different weights — both change what
  the product *is*, not how it computes. Left for you to decide.
- **Defect 6 (re-deriving weights).** Deliberately sequenced *after* 5, and
  after the bugs were fixed, so the fit isn't calibrated around them.
- **The +7.36 bias.** Left visible rather than re-centred. See the top of
  this memo.
- **Jev.** Research, not a fix. See §6.

---

## Suggested order (for the remaining work)

1. **Fix defect 1** — reuse `tokenize()` from `similarity.ts` in
   `intent-coverage.ts`. Cheapest, highest-severity, and the method is
   already in the repo with a research citation behind it.
2. **Fix defect 2** — normalise `content-quality` weights to sum to 1.0. One
   line; decide whether to redistribute to 40/30/30 or rescale to ~0.57/0.43.
3. **Fix defect 3** — recall-oriented tailoring, or a larger denominator.
4. **Add per-skill fixtures** to the corpus so this class of defect has a
   gate. Without this, 1–3 can regress silently.
5. **Decide the product question** — one blended "ATS score", or two separate
   numbers (craft vs match). This changes what every other weight *means*,
   so it should precede any weight retuning.
6. **Then, and only then, re-derive the weights** — they have never been
   fitted to a corpus, only inherited. Do 1–4 first or you will be
   calibrating around the bugs.
7. **Evaluate Jev** as a per-skill judge, measured against the improved
   corpus. Not before.

---

## Notes

- `alignment.ts`'s docstring says `SOFT_SKILLS` is the "legacy 4-word list";
  it is actually 12. Stale comment only.
- `content-quality.ts` and `intent-coverage.ts` both keep their own private
  copy of the resume-flattening logic, and the latter's header explicitly
  warns the two must be kept in sync "if we ever swap tokenization
  strategies". That duplication is where defect 1 lived.
