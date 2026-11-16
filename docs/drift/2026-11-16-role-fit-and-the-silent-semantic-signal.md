# Drift — Role Fit was 50 for everyone, and the "enhanced" score was silently BM25-only

Date: 2026-11-16
Branch: `main`

## What prompted this

The founder clicked **Recompute** on a production variant and the Role Fit
bar came back at exactly **50** — the neutral constant — on a resume whose
titles are plainly close to the posting.

Three days earlier (2026-11-10) Role Fit had been fixed to be a real
measurement. So this looked like the fix not having shipped.

It had shipped. **The dimension was measuring nothing.**

## How it was diagnosed

`scripts/diagnose-prod-score.ts` (new, `pnpm diagnose:prod-score`) issues
SELECTs only against the production Neon database. It reads the current
revision of each resume (the JD title, the JD role family, the resume's
work-position titles) and the last two score snapshots (the stored
breakdown).

The URL came from `.env.production.local`, which the repo already keeps
gitignored and already used as the production reference for the seeder's
"refuse to run against prod" guard. No credential was pasted into a chat
transcript and nothing was written.

### What production said

Every variant on the account:

```
JD title      : EMPTY
JD roleFamily : "Software Engineer" / "Full Stack Engineer"
resume titles : Software Engineering Intern | Software Developer Intern | ...
snapshot      : roleFit=50   ATS Similarity=40   ATS Keyword Match=66
```

Two facts fell out.

---

## Bug 1 — the JD never had a title, so Role Fit had nothing to measure

### The chain

1. `createVariantFromJdAction` builds the `JobPosting` envelope from the
   raw JD text plus the intent extractor's output. Its own comment says:

   > *"The future parser will overwrite title/company/keywords via the JD
   > panel's 'Save JD' action; this slice ships the storage path only."*

2. The "Save JD" action (`setVariantJobContextAction`) set
   `title: existingJobContext?.title ?? ''` — which is **also** empty,
   because nothing ever wrote one.

3. `roleFitSimilarity` returns the neutral 50 when `job.title` is empty.

So the promise in the comment was never kept, and **every JD attached
through the product had no title**. The parsed JD's `jobTitle` is a
required, non-empty field of `parsedJdSchema` — the title existed; it was
simply never written into the envelope.

`job.roleFamily` — "Full Stack Engineer", "Software Engineer" — was
extracted and stored all along, and `jobPostingSchema` has always
documented it as the Role Fit fallback:

> *"Used by the Phase 2 Role Fit dimension as a fallback when JobBERT-V3
> title similarity is unavailable."*

It was never wired up. **A documented fallback that was never
implemented, on the exact dimension that depends on it.**

### The fix

**A. Role Fit measures against the role family when the title is empty.**
`lib/scoring-async/role-fit.ts` now compares against
`job.title || job.roleFamily`. This fixes every JD already in the
database, with no migration and no re-parse.

**B. The JD title gets written, going forward.** The intent extractor
already reads the posting in the same round trip, so it now returns
`jobTitle` as one more field — free. Both attach paths write it into the
envelope.

### The measurement

Scoring the founder's actual production resume with the fixed engine,
locally:

| | before | after |
|---|---|---|
| Role Fit | 50 | **92** |
| overall | 59 | 65 |

92 is the right answer for it: the resume's titles are "Software
Engineering Intern", "DevOps / Software Engineering Intern" and the
posting's role family is "Software Engineer".

---

## Bug 2 — the semantic signal was dead in production, and nobody knew

### The fingerprint

Every production snapshot — all seven of them, across every variant and
every date — read:

```
ATS Similarity = 40
```

The hybrid scorer is `0.4 × BM25 + 0.6 × semantic`. `40` is exactly
`0.4 × 100` — BM25 saturated, **the semantic term contributing zero**.
Seven different resume/posting pairs landing on precisely the same
value is not a coincidence; it is a dead signal.

The local engine, on the **same production data**, produced
`ATS Similarity = 84`. The Jev evaluation worked in both places
(`ATS Keyword Match` = 66 in both) — so the gateway, the model calls
and the Jev path were all healthy. Only the local embedding model was
missing.

### Why it was silent

`semanticSimilarity` catches its own errors and returns 0. The hybrid
formula handles that "gracefully" — it degrades to BM25 — and nothing
anywhere said so. The scorecard said "Computed in 32 ms". No error, no
log, no flag. **Every user in production was getting a BM25-only score
labelled as the enhanced one, and nobody could tell.**

### What was ruled out (by measurement, not by guessing)

| Hypothesis | Result |
|---|---|
| The model is too big for the environment | **No.** The cache is 23 MB across 4 files. |
| The cold download is too slow | **No.** A cold start with an empty cache took 4.6 s locally and still produced 84. |
| The bundling / `serverExternalPackages` breaks the native module | **No.** A production `next build` served with `VERCEL=1` and a cold `/tmp` cache returned 0.77 with no error. |
| The native runtime is missing | **No.** `onnxruntime-node` is a regular dependency and is in the store. |
| The data has no title / no titles | **No.** The same data scored 84 locally. |

So: the bundling, the download, the native module and the data are all
fine. **The failure is specific to the Vercel deployment**, and the only
way to name it is to have the error rather than a swallowed one.

### The fix

**The failure now carries itself.**

- `semanticSimilarity` records the failure message instead of discarding
  it, and logs it.
- The hybrid engine scopes that marker to one computation and puts it in
  the breakdown as `degraded.semantic`.
- The breakdown is persisted with the snapshot — so the reason is
  readable from the database, and in the next deploy it will be in the
  score snapshot of whichever resume the founder recomputes.
- The scorecard renders a **"Keyword-only score"** notice.

The score itself is unchanged. Only the honesty about it changes. A
number whose provenance is unknown is worse than a number with a caveat
attached.

**Next step:** deploy, recompute, read `degraded.semantic` out of the
snapshot, fix the actual cause. This memo deliberately does not guess at
it — every hypothesis tested above was falsified, and a guess would be
another silent failure with a different symptom.

---

## Bug 3 — "Computed in 32 ms" was not the compute time

The enhanced engine returned the **baseline** engine's `computedInMs`
unchanged — and the baseline only measures the deterministic part. The
enhanced path then adds two AI round trips and a model inference on top.

So the scorecard said "Computed in 32 ms" for a computation that had
really spent seconds in the network. The hybrid engine now measures the
whole thing.

This is the same class of bug as Bug 2 in miniature: **a number on the
screen that does not describe what happened.**

---

## Files

**New**

- `scripts/diagnose-prod-score.ts` — read-only production diagnostic.
  `--users` lists accounts, `--score <resumeId>` pulls one variant's
  current revision out of production and scores it locally next to the
  stored snapshot, which is the decisive test when local and production
  disagree.
- `tests/unit/scoring-async/role-fit-fallback.test.ts` — 5 tests.
- `tests/unit/scoring-async/semantic-degradation.test.ts` — 4 tests.
- `tests/unit/jd-parser/jd-title-propagation.test.ts` — 6 tests.

**Changed**

- `lib/scoring-async/role-fit.ts` — the role-family fallback.
- `lib/scoring-async/semantic-similarity.ts` — the failure marker + log.
- `lib/scoring-async/score-hybrid.ts` — carries `degraded`, measures the
  real wall-clock, scopes the marker.
- `lib/scoring/score.ts` — the `degraded` field on the breakdown.
- `lib/jd-parser/extract-jd-intent.ts`, `lib/jd-parser/prompts.ts` — the
  extractor returns `jobTitle`.
- `app/(dashboard)/dashboard/resumes/actions.ts`,
  `app/(dashboard)/dashboard/resumes/[id]/_components/jd-actions.ts` —
  both attach paths write the title.
- `components/scorecard/scorecard.tsx` — the "Keyword-only score" notice.

## Verification

- `pnpm lint` — 0 errors.
- `pnpm typecheck` — clean.
- `pnpm test` — **2,243 passed**, 3 skipped, 178 files.
- Production data read with SELECTs only; the local engine's score of
  the founder's actual resume (Role Fit **92**, overall 65) is the
  before/after measurement.
