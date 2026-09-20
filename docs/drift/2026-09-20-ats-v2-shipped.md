# Drift memo — Phase 3 v2 ATS scoring shipped (2026-09-20)

> **Summary.** Three commits across `feat/ats-scoring-v2-phase1` (merged
> `c43cc96`), `feat/ats-scoring-v2-phase2` (merged `87a9a1a`), and
> `feat/ats-scoring-v2-phase3` (this session, branch pending merge) ship
> the intent-aware ATS scoring engine (Phase 3 v2) end-to-end. Existing
> scores stay on v1 weights until the user explicitly Recomputes.

## 1. Vision recap

The user lands on a variant, attaches a JD, and gets a 7-dimension
ATS scorecard that surfaces **where** their resume is strong vs.
weak — not just a single number. Phase 3 v2 turns the scorecard
from a 4-bar view into a 5-tier-taxonomy + 7-axis radar + per-skill
miss list. The engine understands **intent** (must-have vs.
nice-to-have vs. implicit skills via LLM extraction), **role fit**
(MiniLM cosine between JD.title and resume titles), and **seniority
fit** (year-gap analysis with asymmetric penalty). Existing v1
users see no behavior change until they Recompute on a v2-extracted
JD.

## 2. Roadmap status

### Phase 3 v2 — SHIPPED ✅

| Slice | Status | Notes |
|---|---|---|
| 3.1 — JD intent extractor (LLM) | ✅ | `lib/jd-parser/extract-jd-intent.ts`, schema extended with 10 v2 fields on `jobPostingSchema`. |
| 3.2 — Intent Coverage dimension | ✅ | `lib/scoring/dimensions/intent-coverage.ts` priority-weighted (8/2.5/1.5 per missing skill, capped at 20/bucket). |
| 3.3 — Role Fit (JobBERT-V3 → MiniLM) | ✅ | Reused existing MiniLM-L6-v2 pipeline (`lib/scoring-async/role-fit.ts`). Zero new model downloads. |
| 3.4 — Seniority Fit | ✅ | Pure math dimension, asymmetric penalty (25 vs 7.5 pts/year), ±2-year tolerance band. |
| 3.5 — `ScoreBreakdown` 7-dim + `WEIGHTS_V2` | ✅ | Stages: 7 dimensions, weights sum = 1.00. v1 weights preserved as `WEIGHTS` for fallback. |
| 3.6 — Dynamic tips for Intent Coverage | ✅ | "Missing 2 must-have skills: **Terraform**, **Helm**…" with priority-bolded skill names. |
| 3.7 — Scorecard UI: 5-tier badge | ✅ | Greenhouse taxonomy (Strong / Good / Partial / Limited / Needs work). |
| 3.8 — Scorecard UI: 7 dimension bars | ✅ | 4 v1 + 3 v2. v2 dims fall back to neutral 50 when no signal. |
| 3.9 — Scorecard UI: 7-axis radar | ✅ | Recharts 3.x (new dep, ADR-0004). Tier-colored fill. |
| 3.10 — Scorecard UI: per-skill miss list | ✅ | 3 priority buckets (must-have / nice-to-have / implicit), 20-item cap per bucket. |

### Phase 3 v2 — DEFERRED 🟡

| Slice | Status | Why deferred |
|---|---|---|
| 3.11 — 50-pair labeled validation corpus (Pearson r > 0.7) | 🟡 | Needs labeling methodology decision (manual curation vs. public dataset vs. synthetic). User opted to defer to Phase 4. |

## 3. Drift callouts

### 3a. New locked-stack dep: Recharts 3.x

- **What:** Added `recharts` (`^3.10.1`) for the scorecard radar.
- **Why:** User chose Recharts over a custom SVG radar or skipping
  the radar entirely. ADR-0004 documents the decision + rollback path.
- **Bundle cost:** ~150 KB gzipped.
- **Impact:** `components/scorecard/radar.tsx` is the only consumer
  in Phase 3. Future "score over time" charts reuse the same recipe.

### 3b. Tier taxonomy promoted from 3 → 5 tiers

- **What:** Score badge now uses Greenhouse taxonomy (Strong / Good
  / Partial / Limited / Needs work) instead of the legacy 3-tier
  (Strong / Decent / Needs work).
- **Why:** Plan §"Phase 3 — UI: tier badge" called for 5 tiers from
  the start; v1 only had 3 because we hadn't shipped Phase 3 yet.
- **Backward compatibility:** None — the tier copy + color tokens
  change. `tierFor()` and `tierLabelFor()` are the canonical
  exports; legacy `SCORE_GREEN_THRESHOLD` is re-exported as
  `SCORE_STRONG_THRESHOLD` for the resume-list test until it can be
  cleaned up.
- **Migration:** `tests/unit/scorecard.test.tsx`,
  `tests/unit/scorecard-client.test.tsx`, and
  `tests/unit/resume-list.test.tsx` updated for the new taxonomy
  (5 tier-label assertions now, was 3).

### 3c. Existing scores stay on v1 weights until explicit Recompute

- **What:** `scoreResume()` (the Server Action entry point) still
  picks `WEIGHTS` (v1) by default; `WEIGHTS_V2` only kicks in when
  the JD has populated `mustHaveSkills` / `niceToHaveSkills` /
  `implicitSkills`.
- **Why:** Avoids silently changing the headline number for users
  with legacy JDs. The Recompute button explicitly re-runs the
  scoring; new variant creation from a JD goes through
  `createVariantFromJdAction` which triggers v2 extraction and the
  next score will use `WEIGHTS_V2`.
- **Drift from a strict reading of the plan:** The plan implies v2
  weights are always applied when v2 fields are present, which is
  what we do — but it doesn't explicitly require a migration path
  for legacy scores. We chose to NOT migrate silently; the user
  must opt in via Recompute.

### 3d. JobBERT-V3 → MiniLM-L6-v2 (drift from plan §"Role Fit")

- **What:** Plan §"Role Fit" called for JobBERT-V3.
- **What we shipped:** MiniLM-L6-v2 (`Xenova/all-MiniLM-L6-v2`),
  reused from the existing semantic-similarity pipeline.
- **Why:** Zero new model downloads, zero cold-start cost, shared
  pipeline with `semanticSimilarity`. JobBERT-V3 would add ~250 MB
  to the cold-start.
- **Acceptance gate:** Pearson r > 0.7 against the labeled corpus.
  Corpus deferred (3.11 above). Promote to JobBERT-V3 only if the
  MiniLM model fails the gate.

### 3e. `scoreSeniorityFitFromEnvelope` requires `now: Date`

- **What:** Wrapper exposes a required `now: Date` parameter
  (no default `new Date()`).
- **Why:** The purity test (`tests/unit/scoring/purity.test.ts`)
  forbids `new Date()` in any file under `lib/scoring/`, including
  `score.ts`. The dimension must remain pure (no `Date`, no
  `Math.random`, no `fetch`).
- **Impact:** Production callers (Server Actions, scripts) inject
  `new Date()` from outside the engine boundary. Tests inject an
  explicit `Date` for determinism. The pattern mirrors the existing
  `performance.now()` allowance in `score.ts` for `computedInMs`.

### 3f. `ENABLE_V2_SCORING` env-var flag was NOT added

- **What:** Plan mentioned a feature flag for v2 scoring.
- **What we shipped:** The dimension uses an implicit "is v2 data
  present?" gate (`hasIntentSignals = !breakdown.intentCoverageBreakdown.fallback`).
- **Why:** Simpler invariant — v2 weights only apply when v2 intent
  data exists in the JD. An env-var would add a separate on/off
  state that has to stay in sync with the data. Functional
  equivalent without the plumbing.
- **Risk:** If a user wants to opt out of v2 entirely (e.g., they
  had a bad extraction), they'd have to delete the JD and re-add
  it without triggering the v2 extractor. Acceptable for now.

## 4. Action items

- [ ] **Phase 4 — validation corpus.** Decide labeling methodology
      (manual / public / synthetic). Aim for 50 triples. Wire the
      Pearson r harness into `tests/unit/scoring/`. Acceptance gate:
      r > 0.7 against `WEIGHTS_V2`-derived scores.
- [ ] **Role Fit migration.** If MiniLM fails the Pearson r gate,
      migrate to JobBERT-V3 (separate ADR).
- [ ] **Score badge cleanup.** Resume-list test still asserts on
      `data-tier="amber"` (legacy v1 tier name) in the variant score
      badge. Update to the v2 5-tier name in a follow-up.
- [ ] **Dynamic tips for Role Fit + Seniority Fit.** The
      `CRITERIA_TIPS` entries are scaffolded in
      `lib/scoring/tips.tsx` but the live dynamic-tip branches
      (`buildDynamicTips`) are not yet implemented for these two
      dimensions. Phase 4 polish.
- [ ] **Wiring `scoreSeniorityFitFromEnvelope` into a Server Action.**
      Currently exported but no Server Action calls it. The scoreable
      shape path falls back to neutral. Wire once the scoreable
      shape carries work positions with dates.

## 5. Reference

- **Plan:** `docs/plans/ats-scoring-v2.md`
- **ADR:** `docs/decisions/0004-recharts-for-ats-radar.md`
- **Branch:** `feat/ats-scoring-v2-phase3` (pending merge to `main`)
- **Tests:** `pnpm test` → **754/754 green**
- **Typecheck:** clean
- **Bundle impact:** +Recharts (~150 KB gzipped)
- **Commits:**
  - `c43cc96` — Phase 1 (intent extractor + Intent Coverage dim + dynamic miss-list tips)
  - `87a9a1a` — Phase 2 (Role Fit + Seniority Fit) + Phase 2 tsc/purity fixes
  - `<this commit>` — Phase 3 (5-tier badge + 7-axis radar + miss list UI)
