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

### The fix, part one — make the failure carry itself

- `semanticSimilarity` records the failure message instead of discarding
  it, and logs it.
- The hybrid engine scopes that marker to one computation and puts it in
  the breakdown as `degraded.semantic`.
- The breakdown is persisted with the snapshot — so the reason is
  readable from the database.
- The scorecard renders a **"Keyword-only score"** notice.

The score itself is unchanged. Only the honesty about it changes. A
number whose provenance is unknown is worse than a number with a caveat
attached.

### The cause — `sharp`, and a Next.js 16.2 file-tracing bug

Deployed, recomputed, and read the reason straight out of the snapshot:

```
Failed to load external module @huggingface/transformers:
Error: Could not load the "sharp" module using the linux-x64 runtime
  ERR_DLOPEN_FAILED: libvips-cpp.so.8.18.6: cannot open shared object file
```

We do not use sharp. It arrives as a transitive dependency of
`@huggingface/transformers` (for image processing we never do), and it
was breaking production in a way that looked like nothing at all.

**The mechanism** (vercel/next.js#96064, lovell/sharp#4567, and
vercel/vercel#11220): `@vercel/nft` — Next.js's file tracer — carries a
**special case for sharp, gated on `sharp/lib/index.js` existing.**
sharp 0.35 moved its entry point to `dist/index.cjs` and `lib/` now
holds only `index.d.ts`, so on 0.35 the gate cannot match and **the
libvips shared object is never traced into the serverless function**.

The `.node` addon itself traces fine — which is exactly why the failure
shows up at `dlopen` time rather than at `require` time, and why every
other symptom was a silent zero.

Our versions match the reported bug exactly: Next.js **16.2.10**, sharp
**0.35.4** (via `@huggingface/transformers` 4.3.0), pnpm, Vercel. The
fix landed upstream in next@16.3.0; we are on 16.2.

**The fix:** pin sharp to **0.34.5** via a pnpm override in
`pnpm-workspace.yaml`. sharp 0.34 keeps `lib/index.js`, so the tracer's
special case fires and libvips is included in the function bundle. We do
not call sharp's API ourselves, so the version carries no behavioural
risk — verified: the local demo fixture produces byte-identical numbers
before and after the override (78 → 79, Role fit 84).

### Bug 2b — a dead model made Role Fit read 0

With the semantic model dead, `semanticSimilarity` returns 0 for every
comparison, and Role Fit — which now measures, thanks to the role-family
fallback — dutifully reported **0**: a flat, damning bar and a silent
5-point penalty on every resume, for a dimension nobody had measured.

A zero that means "could not measure" is not a zero that means "measured
zero". `roleFitSimilarity` now asks the failure marker and returns the
neutral 50 when the model was unavailable, while a genuine zero (titles
that really are unrelated) still reads 0. The scorecard's "keyword-only
score" notice explains why the dimension is neutral.

That took the score from **54** (Role Fit 0) to what it should have been
all along.

### Bug 2c — the ONNX runtime was missing from the function too

The sharp override deployed, and the very next recompute moved the error
one layer down:

```
Error: Cannot find module 'onnxruntime-node'
Require stack:
- /var/task/node_modules/.pnpm/@huggingface+transformers@4.3.0/node_modules/@huggingface/transformers/dist/transformers.node.mjs
```

Same class of problem, different reason. Two gaps, both invisible to a
file tracer:

1. **`require('onnxruntime-node')` inside transformers is dynamic** — a
   computed specifier, so `nft` cannot follow it and the module never
   reaches the deployment.
2. **`onnxruntime-node/dist/binding.js` loads its native binding from a
   template-literal path** —
   `require(\`../bin/napi-v6/${process.platform}/${process.arch}/onnxruntime_binding.node\`)`
   — so even the `.node` addon and the `libonnxruntime.so` it links
   against cannot be discovered by any tracer.

**The fix**, both halves:

- `onnxruntime-node` is now a **direct dependency** (pinned to exactly
  `1.30.0`, the version transformers asks for, so there is one copy and
  not two) and is listed in `serverExternalPackages`. A side-effect
  import in `lib/scoring-async/semantic-similarity.ts` makes the tracer
  follow it from our own code — which is what puts it in the function
  bundle. The runtime never uses that binding; transformers loads its
  own.
- `next.config.ts` adds `outputFileTracingIncludes` pointing at the
  **physical pnpm store paths** for the Linux bindings (x64 + arm64) and
  for `onnxruntime-common`. The symlinked `node_modules/onnxruntime-node`
  path does not exist for a transitive dependency, so the glob has to
  name the store directory.

The package ships every platform's binary inside itself, so one glob
covers the deployment.

**Lesson worth keeping:** the file tracer follows *static* requires and
nothing else. A native module reached through a dynamic specifier, or
loaded through a computed path, has to be named by hand — and until it
is, the feature it powers is dead in production while every local run
and every unit test says it works.

### Bug 2d — the include key was a GLOB, and `[id]` is a character class

With the module resolving, the next production error was one layer
deeper:

```
Failed to load external module onnxruntime-node:
Error: libonnxruntime.so.1: cannot open shared object file
```

The binding was there; the library it dlopens was not. And the local
build showed why: **the variant page's trace had the `.node` addon (the
tracer resolved the template path itself) but not `libonnxruntime.so.1`**
— so the include had never fired for that route, only for `/api/chat`.

**The cause is that the keys of `outputFileTracingIncludes` are ROUTE
GLOBS, matched with picomatch** — and in a glob, `[id]` is a
*character class*, not a literal segment. Next's own documentation
escapes it (`'/api/login/\\[\\[\\.\\.\\.slug\\]\\]'`), and a project
shipping this exact package does the same (`"/\\[user\\]"`).

The fix is the escaped key:

```ts
'/dashboard/resumes/\\[id\\]': ONNX_LINUX_FILES
```

Verified against the build's own traces afterwards: **3 routes carry the
`.so` (the variant page, its preview, and `/api/chat`), 32 carry
neither.**

And the platforms we will never run on are now excluded
(`outputFileTracingExcludes`): darwin, win32, linux/arm64 and
`onnxruntime-web`. The payload per function dropped from **108 MB to
44 MB** — `libonnxruntime.so.1` alone is 43.7 MB.

**Lesson worth keeping:** a glob in a config key is a glob. The same
bracket that reads as "the dynamic segment" to a human reads as "the
set {i, d}" to the matcher.

### Bug 2e — and then the deploy would not go out at all

The ONNX fix built and passed CI, and the deploy failed:

```
Build Failed
No more than 12 Serverless Functions can be added to a Deployment on
the Hobby plan.
```

It was not size (87 MB per function against Vercel's 250 MB limit) and
not the build (CI's Ubuntu build passed, and the Vercel build log ends
with "Build Completed in /vercel/output" — the failure is in
"Deploying outputs...", when Vercel turns build output into functions).
Diffing the two build logs showed the route tables were byte-identical.

**The mechanism:** Vercel groups routes into Serverless Functions when
their output is identical. The app was sitting **exactly** on the
Hobby ceiling of 12. The ONNX packaging changed the output of the
scoring routes, which split a group — and 13 is one too many.

**The real cause underneath it: every page in the app was a function.**
`app/layout.tsx` called `getUser()` as a "pre-warm the session so
layout-level reads are cheap" optimisation — and then **discarded the
result**. But `getUser()` reads the session via `headers()`, and
`headers()` is a *dynamic API*. A dynamic API in the ROOT layout makes
every route in the app dynamic.

So 26 pages were Serverless Functions — each with its own cold start,
including the marketing home page, the legal pages and the sign-in page
— on a plan that allows 12 functions. The optimisation was making the
app more expensive than it needed to be.

The pages that actually need the session read it themselves: the
dashboard layout has its own auth gate, the marketing hero reads it to
personalise the CTA, `/pricing` reads the subscription, and
`PostHogIdentify` uses the client-side session query. **Removing the
call lets 10 pages be prerendered at build time** — dynamic routes go
from **26 to 16**, and the marketing site stops paying for a cold start
on every visit.

Two auth pages read `useSearchParams()`, which in Next 16 forces a page
into client-side rendering unless the component is wrapped in a Suspense
boundary. `sign-in` and `sign-up` now wrap `<Login>` the same way
`reset-password` already did.

**And the tracing include was scoped.** It had been applied to `'/**'`
— every route. The native binaries are 44 MB, and adding them to every
route changed every route's bundle, which is what moved the grouping.
They now go only to the two routes that run the scorer (`/api/chat` and
`/dashboard/resumes/[id]`). Verified against the build's own traces:
**2 traces carry the ONNX binaries, 33 carry neither.**

**Lesson worth keeping:** a deployment failure is not always about the
thing you changed. This one was about a ceiling the app had been
sitting on for weeks, and the change merely tipped it over. The
diagnostic that found it was diffing two build logs — not reading the
error message, which pointed at a limit rather than a cause.

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
