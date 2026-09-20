# 0005 — Manual curation for the ATS scoring v2 validation corpus

## Context

Phase 3 v2 ATS scoring shipped at `2f49191` on `main` (drift memo
`docs/drift/2026-09-20-ats-v2-shipped.md`). The plan committed us to
a 50-pair labeled validation corpus with a Pearson r > 0.7 acceptance
gate before locking `WEIGHTS_V2` into production. That work was
explicitly deferred in the Phase 3 v2 drift memo §4 ("Phase 4 —
validation corpus"). This ADR picks the labeling methodology.

The corpus needs to be a labeled set of `(resume, job, idealScore)`
triples where:

- `idealScore` is a single 0-100 integer reflecting a recruiter-grade
  judgment of "how well does this resume match this job" — same unit
  as `ScoreBreakdown.overallScore`.
- The job carries the **v2 intent fields** (`mustHaveSkills`,
  `niceToHaveSkills`, `implicitSkills`, `seniorityLevel`,
  `yearsRequiredMin`, `roleFamily`). Without these, the v2 weights
  would never engage and we'd be validating v1 against the new
  weights — pointless.
- The resume carries a full structured envelope (`ResumeData.sections`)
  including work-history **dates**, so the Seniority Fit dimension
  has signal to score against. The engine's scoreable shape doesn't
  carry dates today, but the envelope-aware scorer path does (see
  drift memo §3e).
- The set must span match-quality tiers (strong / good / partial /
  limited / needs work) AND role families (backend, frontend,
  fullstack, data, ML, mobile, DevOps/SRE, PM, QA, EM) so the Pearson
  r is computed across the score range, not just within one bucket
  (which would trivially correlate).

## Decision

**Manual curation — 50 hand-built triples with a written rubric per
row.** The corpus lives at `tests/fixtures/ats-corpus.json` (committed
to the repo; ~250 KB total). Each entry carries:

```json
{
  "id": "001",
  "rubric": "<one-line explanation of why this score>",
  "tier": "strong | good | partial | limited | needs-work",
  "roleFamily": "Backend Engineer",
  "jd": { /* full JobPosting envelope with v2 fields populated */ },
  "resume": { /* full ResumeData envelope */ },
  "idealScore": 92,
  "labeler": "manual-anchor-2026-09-20",
  "labeledAt": "2026-09-20T00:00:00.000Z"
}
```

The labeler is the **founder-as-anchor** with a documented rubric:

| Score | Bucket | Rubric |
|---|---|---|
| 85-100 | **Strong** | Every must-have covered, most nice-to-haves, exact role family, accomplishments quantified and aligned with JD responsibilities, 1+ years past the yearsRequiredMin ask. |
| 70-84 | **Good** | All must-haves covered, ~half of nice-to-haves, adjacent role family or partial title match, accomplishments present but partial, years at-or-above the ask. |
| 55-69 | **Partial** | 1 must-have missing OR meaningful years gap (1-2 years short) OR adjacent role family. Accomplishments present, content quality adequate. |
| 35-54 | **Limited** | 2+ must-haves missing OR 2+ years short on experience OR role-family mismatch. Some signal overlap but large gaps. |
| 0-34 | **Needs work** | Different domain entirely OR missing most must-haves OR fresh grad / career switcher applying for senior roles. |

The test harness (`tests/unit/scoring/validation-corpus.test.ts`)
computes `scoreResumeFromEnvelope` for every triple, runs Pearson r
between the engine's `overallScore` and the labeled `idealScore`,
and fails if r < 0.7.

## Consequences

**Good:**

- **Defensible.** Each row carries a written rubric a recruiter can
  audit. No opaque LLM judgments, no scraped-and-mislabeled public
  data.
- **Engine-shape aligned.** The corpus uses the same `ResumeData` +
  `JobPosting` envelopes the production scorer reads, so the v2
  weights actually engage. A sentence-pair corpus (the shape public
  datasets ship in) would lose the Intent Coverage / Role Fit /
  Seniority Fit signal entirely.
- **Span checkable.** We can grep the corpus for tier / role-family
  coverage before computing Pearson r. A lopsided corpus (e.g. 50
  strong matches) would trivially correlate at r = 1.0 but say
  nothing about calibration on the bottom half.
- **Owns the calibration asset.** If `WEIGHTS_V2` ever needs to be
  re-tuned, the same corpus anchors the regression test. Public
  datasets can disappear (HuggingFace dataset deletions are common);
  our corpus is in git.

**Bad:**

- **50 triples is small.** Pearson r with n = 50 has ~95% CI of ±0.20
  around the point estimate, so r = 0.7 vs r = 0.9 is not
  statistically distinguishable. We accept this — the goal is a
  smoke-test for gross miscalibration, not a precise coefficient.
  Plan §"Risks" #2 ("JobBERT-V3 isn't the right model") calls the
  same threshold "Pearson < 0.7" so we stay aligned with the plan.
- **Single labeler.** The rubric is mine. Inter-rater agreement is
  zero by construction. Mitigated by:
  - The rubric is documented above and per-row in the corpus.
  - A future iteration can have a second labeler re-score a 10-row
    subset for an inter-rater check; deferred.
- **License risk is zero** (we own the data) but **external validity
  is bounded** — these are plausible-but-canonical resumes, not
  real-world submitted resumes. Real submissions have more noise
  (typos, sections out of order, non-standard formats) than the
  JSON Resume envelope shape captures. The corpus validates the
  *engine* calibration, not the *parser* pipeline.

**Forecloses:**

- Picking up the `cnamuangtoun/resume-job-description-fit` dataset
  (or the `0xnbk/resume-ats-score-v1-en` derivative) without first
  writing a new ADR explaining why the methodology shift is
  justified.
- Shipping a corpus that doesn't include v2 intent fields.

## Alternatives considered

### Public dataset — `cnamuangtoun/resume-job-description-fit` (or `0xnbk/resume-ats-score-v1-en`)

8,000 (JD, resume) pairs labeled `Good Fit / Potential Fit / No Fit`.
Considered seriously. **Rejected for three reasons:**

1. **Wrong label shape.** Labels are categorical (3-tier). Pearson r
   needs continuous values. Mapping categorical → numeric requires
   an arbitrary mapping function (e.g. No Fit = 25, Potential Fit =
   55, Good Fit = 85), which injects a label-to-score assumption we
   have no way to validate. The mapping would dominate the r value.
2. **Wrong data shape.** The dataset ships sentence-pair text (`resume
   [SEP] job_description`), not structured envelopes. To run the
   v2 scorer we'd have to first parse each resume into `ResumeData`
   sections and each JD into `JobPosting` fields — which means
   re-running `parseResume` and `parseJd` on potentially-noisy text
   and trusting *those* models. Adds a confound.
3. **License ambiguity.** `cnamuangtoun` doesn't publish an explicit
   license on the dataset card. `0xnbk/resume-ats-score-v1-en` is
   derived and claims "high quality" but the original labeler is
   unclear (claims 90.5% quality with no methodology). Committing
   ~250 KB of unclear-license data into our repo is a legal question
   we don't want.

The cnamuangtoun dataset IS a reasonable **future** validation asset
if a clear license + clean structured output ever appears. Not now.

### Synthetic — generate 50 (JD, resume) pairs via the LLM extractor + a few template skeletons

Considered seriously. **Rejected because of circular validation:**

- The point of the corpus is to measure whether the engine's score
  matches a human-like ideal. If the LLM that produces the corpus
  entries is *also* the LLM that drives our Intent Coverage
  dimension (via `extractJdIntent`), we're measuring engine-LLM
  alignment against the same LLM, not against ground truth. Pearson
  r would be artifactually high.
- Templates would also collapse role-family variance — the
  generator would converge on a narrow set of resume skeletons
  (TS/Node/React engineer, etc.), so the corpus wouldn't span the
  score range. Span is the whole point of n = 50.
- The `netsol/resume-score-details` dataset is a public example of
  this trap: 1,031 GPT-4o-generated JD/resume pairs with GPT-4o
  judged scores. Useful as training data for a sentence transformer,
  useless for engine calibration.

### Manual curation of *real* resumes scraped from LinkedIn / personal sites

Considered briefly. **Rejected for two reasons:**

- **Consent.** Scraping real resumes (even public ones) into a
  calibration corpus without the resume owner's consent is a
  privacy / GDPR question. The 50 entries we ship would carry
  PII (names, emails, employer names) and would have to be
  carefully anonymized. Synthetic-but-plausible resumes sidestep
  this entirely.
- **Defensibility.** A scraped corpus is harder to defend ("why
  is this resume in your regression test?") than a hand-built one
  with a clear rubric. The drift memo and PR review can quote
  specific rubric rows.

## Acceptance gate (re-stated)

- Pearson r between `engine.overallScore` and `corpus.idealScore`
  across all 50 triples > 0.7.
- The Pearson r is computed across the **whole** score range (not
  bucketed). A 0.85 r within "Strong matches" + a -0.2 r within
  "Limited matches" averages to ~0.7 but is the wrong calibration
  story. The test harness asserts the full-range r.

## Rollback

If the gate fails by a small margin (r in 0.6-0.7), the action is
"tune the rubric, not the weights" — re-label the bottom-decile
triples with sharper criteria, re-run. If it fails by a large margin
(r < 0.5), we open a follow-up ADR for either recalibrating
`WEIGHTS_V2` or migrating Role Fit to JobBERT-V3 — both are already
on the roadmap (`docs/drift/2026-09-20-ats-v2-shipped.md` §4
"Role Fit migration").

## Reference

- Plan: `docs/plans/ats-scoring-v2.md` §"Phase 3 — UI + validation"
- Drift memo: `docs/drift/2026-09-20-ats-v2-shipped.md` §4 action
  items
- Corpus: `tests/fixtures/ats-corpus.json` (50 triples)
- Harness: `tests/unit/scoring/validation-corpus.test.ts`
