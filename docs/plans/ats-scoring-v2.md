# ATS Scoring v2 — Intent-Aware Scoring — Plan

## Objective

Replace the bag-of-words ATS scoring pipeline (BM25 + semantic embeddings
on raw JD text) with an **intent-aware pipeline** that extracts structured
JD intent (must-haves vs. nice-to-haves, role family, seniority, required
years) and weights coverage accordingly. The result: a missing must-have
skill drops your score 8–12 points, a missing nice-to-have drops it
1–3 points, instead of both weighing equally.

The Phase 3 baseline (pure scoring engine, hybrid BM25 + embeddings,
per-criterion hover tips with dynamic advice) shipped on `main` at
`4385027` (merged from `feat/ats-scoring`, 2026-09-19). This v2 work
lives on `feat/ats-scoring-v2`.

Why now: the Phase 3 engine treats "missing Kubernetes" and "missing
experience with Slack" as the same signal. It also can't answer
"does my resume address this role's seniority bar?" — both common
candidate pain points. The 2018→2026 research arc (LinkedIn ConFit v3,
JobBERT, ESCO/Lightcast) has converged on a production architecture we
can ship with **zero new locked-stack dependencies**.

## User-visible behavior

| v1 (current) | v2 (after) |
|---|---|
| "Match: 85%" — single number | "Match: 76%" — single number **plus tier badge** (Strong / Good / Partial / Limited / Needs work) |
| "Missing: Kubernetes" | "Missing 2 must-have infra skills (**Terraform, Helm**), 1 nice-to-have (**Kustomize**)" |
| No seniority check | "Seniority gap: your 3 years vs. JD's 5+ requirement" |
| No title fit | "Title fit: 0.42 — your 'Backend Engineer' titles don't match the JD's 'Platform Engineer' role family" |
| Same penalty for missing must-have vs. nice-to-have | Missing must-have drops score 8–12 pts; missing nice-to-have drops 1–3 pts |

The user always sees the scorecard surface in the same place (variant
editor right rail). New elements are additive — the tier badge appears
next to the existing 0–100 number, and the new dimensions are added to
the expanded "Show details + tips" grid.

## Scope (in)

**Phase 1 — LLM extraction + Intent Coverage dimension (1 week)**
- Schema extension: `mustHaveSkills[]`, `niceToHaveSkills[]`,
  `implicitSkills[]`, `seniority`, `yearsRequired`,
  `yearsRequiredMin?`, `yearsRequiredMax?`, `roleFamily`,
  `domainSignals[]`, `extractedAt`, `extractorModel`
- LLM extractor: `lib/jd-parser/extract-jd-intent.ts` using the
  existing AI Gateway + Zod-structured output
- New scoring dimension: `Intent Coverage` (15% weight initially,
  rebalanced in Phase 2)
- New dynamic tips: per-skill miss list with must-have/nice-to-have
  priority highlighted
- Feature flag: `ENABLE_V2_SCORING` (default off — v1 keeps shipping
  until v2 is validated)

**Phase 2 — JobBERT-V3 + Role Fit + Seniority Fit (1 week)**
- JobBERT-V3 integration via `@huggingface/transformers` (same pattern
  as MiniLM-L6-v2 in `lib/scoring-async/semantic-similarity.ts`)
- New dimension: `Role Fit` (10% weight)
- New dimension: `Seniority Fit` (10% weight)
- New dynamic tips: title alignment + seniority gap

**Phase 3 — UI + validation (3-5 days)**
- Recharts radar chart for the 7-dimension view
- Tier badge (Strong / Good / Partial / Limited / Needs work)
  next to the score number
- Per-skill miss list rendered under the scorecard
- 50-pair labeled validation corpus + Pearson correlation check
  (ship criterion: r > 0.7)
- AGENTS.md roadmap update + drift memo

## Non-goals (out of this plan)

- **No vendor API integration** (Affinda, Textkernel, Lightcast Payments).
  All scoring is self-hosted. The v2 architecture uses free, public
  resources: Lightcast Open Skills (CSV), O*NET 31.0 (CSV), JobBERT-V3
  (HuggingFace).
- **No new locked-stack dependencies.** JobBERT-V3 is a model loaded via
  the same `@huggingface/transformers` we already use for MiniLM.
- **No continuous training.** JobBERT-V3 weights are frozen. Lightcast
  CSV is static.
- **No LinkedIn / GitHub profile import.** Out of v1 scope per
  AGENTS.md locked non-goals.
- **No multi-language i18n on the scorecard UI.** English-only.
- **No LinkedIn-style "talent insights" or "skills trends".** Not
  candidate-facing value.
- **No bulk re-scoring of existing variants.** Existing scores stay
  on v1 weights until the user explicitly clicks Recompute. This is a
  migration-safety constraint, not an oversight.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Stage 1: JD Intent Extraction (LLM, cached)               │
│                                                             │
│  Input:  raw JD text (jobPosting.description + title +      │
│          requirements + niceToHaves + benefits + keywords)  │
│  Output: structured intent (jobPostingSchema extended)      │
│          cached on the jobPosting row itself                │
│                                                             │
│  Implementation: Vercel AI Gateway + Zod schema            │
│  Pattern: lib/jd-parser/format-jd-as-markdown.ts            │
│  Cache:   extend jobPostingSchema with new optional fields │
│  Trigger: createVariantFromJdAction + setVariantJobContext  │
│           + lazy first-read for backfill                    │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│  Stage 2: Resume Normalization (existing + small extend)   │
│                                                             │
│  Input:  structured ResumeData                              │
│  Output: {skills[], titles[], years[], scopes[]}           │
│                                                             │
│  Implementation: already exists via lib/resume-parser +     │
│                  lib/scoring/similarity.ts                  │
│  Extension: add Lightcast Open Skills alias dictionary      │
│              (only if Phase 2 lifts scoring accuracy)      │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│  Stage 3: Weighted Aggregation                              │
│                                                             │
│  v1 dimensions (kept): ATS Matching, Structure, Content    │
│  Quality, Tailoring                                          │
│  v2 dimensions (added): Intent Coverage, Role Fit,         │
│  Seniority Fit                                               │
│                                                             │
│  Per-dimension scoring → breakdown → aggregate              │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│  Stage 4: Dynamic tips + scorecard UI                       │
│                                                             │
│  buildDynamicTips() extended to surface per-skill miss     │
│  lists with priority highlighting. New dimensions added    │
│  to the sub-criteria grid. Tier badge next to overall     │
│  score. Recharts radar chart for the 7-dim view (Phase 3). │
└─────────────────────────────────────────────────────────────┘
```

## Files

### New
- `docs/plans/ats-scoring-v2.md` (this file)
- `lib/jd-parser/extract-jd-intent.ts` (Phase 1)
- `lib/jd-parser/extract-jd-intent.test.ts` (Phase 1)
- `lib/scoring-async/intent-coverage.ts` (Phase 1)
- `lib/scoring-async/intent-coverage.test.ts` (Phase 1)
- `lib/scoring-async/role-fit.ts` (Phase 2)
- `lib/scoring-async/role-fit.test.ts` (Phase 2)
- `lib/scoring-async/seniority-fit.ts` (Phase 2)
- `lib/scoring-async/seniority-fit.test.ts` (Phase 2)
- `lib/scoring/tiers.ts` (Phase 3 — tier-badge classification)
- `lib/scoring/tiers.test.ts` (Phase 3)
- `components/scorecard/radar-chart.tsx` (Phase 3)
- `components/scorecard/radar-chart.test.tsx` (Phase 3)
- `components/scorecard/tier-badge.tsx` (Phase 3)
- `components/scorecard/tier-badge.test.tsx` (Phase 3)
- `tests/fixtures/labeled-scoring-pairs.ts` (Phase 3 — 50-pair corpus)
- `tests/integration/scoring-v2-validation.test.ts` (Phase 3)

### Changed
- `lib/resume-schema/job-posting.ts` (extend with v2 fields)
- `lib/scoring/score.ts` (ScoreBreakdown gains Intent Coverage dim)
- `lib/scoring-async/score-hybrid.ts` (calls new intent-coverage module)
- `lib/scoring/tips.tsx` (buildDynamicTips surfaces miss list)
- `app/(dashboard)/dashboard/resumes/[id]/score-actions.ts`
  (feature flag + cache invalidation)
- `app/(dashboard)/dashboard/resumes/[id]/_components/scorecard-client.tsx`
  (handles richer breakdown shape)
- `app/(dashboard)/dashboard/resumes/[id]/page.tsx` (pass tier + radar)
- `components/scorecard/scorecard.tsx` (render tier badge + radar + miss list)
- `lib/db/queries.ts` (read enriched JD fields)
- `lib/jd-parser/format-jd-as-markdown.ts` (optional: call extract-jd-intent
  alongside the Markdown formatter — single AI Gateway round-trip)
- `app/(dashboard)/dashboard/resumes/[id]/_components/jd-panel.tsx`
  (display extracted role family + seniority)
- `AGENTS.md` (roadmap update + new "Now (in flight)" entry)

### Deleted
None. Every change is additive; v1 scoring stays in place behind the
feature flag.

## DB / schema

The schema extension is **optional fields** on the existing
`jobPostingSchema` (same pattern as Plan B's `markdown` +
`markdownGeneratedAt`). All new fields are nullable / default-empty
so legacy rows load fine.

```ts
// Extend lib/resume-schema/job-posting.ts
jobPostingSchema = z.object({
  // ... existing fields ...
  mustHaveSkills: z.array(z.string()).default([]),
  niceToHaveSkills: z.array(z.string()).default([]),
  implicitSkills: z.array(z.string()).default([]),
  seniority: z.enum(['junior', 'mid', 'senior', 'staff', 'principal']).nullable().default(null),
  yearsRequiredMin: z.number().nullable().default(null),
  yearsRequiredMax: z.number().nullable().default(null),
  roleFamily: z.string().nullable().default(null),       // e.g. "Backend Engineer"
  domainSignals: z.array(z.string()).default([]),        // e.g. ["fintech", "healthcare"]
  extractedAt: z.string().nullable().default(null),      // ISO timestamp
  extractorModel: z.string().nullable().default(null)    // e.g. "anthropic/claude-sonnet-4.5"
});
```

No new tables. No new indexes. The DB row simply gains these fields
through the Drizzle `jsonb` envelope (already used for the rest of the
jobPosting payload).

### Migration

- Drizzle: `pnpm db:generate` then `pnpm db:push` (dev) or `pnpm db:migrate` (prod)
- Backfill: lazy on first read — if `extractedAt` is null when a variant
  is opened, kick off an async extraction (inngest function or fire-and-forget
  Server Action). No bulk migration needed.

### Env vars

None added. The LLM extractor uses the existing `AI_GATEWAY_API_KEY`.

## Dependencies

- **NPM packages**: none added. JobBERT-V3 is a HuggingFace model loaded
  via the existing `@huggingface/transformers` we already use for MiniLM-L6.
- **External services**: none added. AI Gateway (existing).
- **Env keys to add to `.env.example`**: none.
- **New `AI_GATEWAY_API_KEY` model constant**: maybe — `lib/ai/providers.ts`
  may need an explicit "extractor" model alias. We'll decide during
  Phase 1 implementation.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| LLM extraction cost balloons if users re-attach JDs frequently | Medium | Low (~$0.001/JD) | Cache `extractedAt`; if <24h old, skip. Bulk re-attach is gated by user intent. |
| LLM hallucinates skill priority classification | Medium | High (wrong tier of "must" vs. "nice") | Cross-check with section-header detection ("Requirements:" / "Nice to have:" lines) + regex for "must" / "required" / "preferred" near the skill. Fall back to must-have if uncertain. |
| JobBERT-V3 isn't the right model for our domain (Senior/Staff/Principal role families) | Low | Medium | Validate on a labeled set of 50 (JD title, resume title) pairs in Phase 2. Fall back to `all-MiniLM-L6-v2` if Pearson < 0.7. |
| Existing 236+ tests regress with new dimensions | Medium | High | Ship each phase behind `ENABLE_V2_SCORING` feature flag (default off). v1 scoring remains the live path. Existing tests run against v1. |
| Migration data loss (extractedAt null) | Low | High | Extraction is additive — never destructive. Legacy JDs keep working; first-open triggers lazy extraction. No backfill required. |

## Acceptance criteria

### Phase 1
- [ ] Schema extension in `jobPostingSchema` is backward-compatible
      (existing rows with no `extractedAt` load without error)
- [ ] `extractJdIntent(rawJd): Promise<ExtractResult>` returns
      discriminated union with codes `no_api_key | input_too_short |
      input_too_large | ai_failure | empty_output | success`
- [ ] On success, extracted fields are persisted to the jobPosting row
- [ ] `ENABLE_V2_SCORING` feature flag toggles v2 vs v1 in `score-actions.ts`
- [ ] When flag is OFF, all existing scoring behavior is unchanged
      (682 tests still green)
- [ ] When flag is ON, Intent Coverage appears as a new dimension with
      15% weight, and the 4 existing dimensions scale to 85% combined
- [ ] Intent Coverage returns the per-skill miss list (not just a number)
- [ ] `buildDynamicTips` surfaces the miss list as a dynamic tip with
      priority-bolded skills
- [ ] New unit tests: schema migration, intent-coverage, extractor
      mock, dynamic-tip rendering with miss list

### Phase 2
- [ ] JobBERT-V3 loads via `@huggingface/transformers` without
      breaking the existing MiniLM cache
- [ ] Role Fit score matches the (JD.title, max-resume-title) cosine
      similarity × 100, in [0, 100]
- [ ] Seniority Fit returns 100 for over-qualified, applies asymmetric
      penalty for under-qualified (-1.0x), partial credit for
      "close to JD years"
- [ ] All Phase 1 criteria still green
- [ ] Existing tests still pass (v1 weights still the default)

### Phase 3
- [ ] Recharts radar renders 7 dimensions without layout overflow
- [ ] Tier badge uses the Greenhouse taxonomy and updates as score
      changes (e.g. Strong ≥ 80, Good 65-79, Partial 45-64, Limited
      25-44, Needs work < 25)
- [ ] Per-skill miss list appears under the scorecard with priority
      color coding
- [ ] Pearson correlation between v2 score and ideal scores on the
      50-pair corpus is r > 0.7
- [ ] AGENTS.md updated to mark Phase 3 ATS scoring v2 as shipped
- [ ] Drift memo at `docs/drift/2026-09-19-ats-v2-shipped.md` written

## Test plan

- **Unit (per phase)**: extractor, intent-coverage, role-fit, seniority-fit,
  tier classification, dynamic-tip rendering with new fields
- **Integration**: `tests/integration/scoring-v2-validation.test.ts`
  runs the full pipeline (extract → normalize → aggregate) against
  the 50-pair corpus
- **Manual smoke (each phase)**: load dev server, attach a JD, verify
  the new UI renders, verify the Recompute button produces a richer
  breakdown when the flag is on
- **Regression**: existing 682 tests must remain green at every phase
  boundary

## Rollback plan

Each phase ships behind `ENABLE_V2_SCORING` (default off). Rollback
procedure:

1. Set `ENABLE_V2_SCORING=false` — instant revert to v1 scoring
2. Revert the phase's commits on `feat/ats-scoring-v2`
3. Schema fields stay (additive, nullable); no destructive migration

No user-visible behavior change until the flag is enabled.

## Open questions

1. **Tier threshold cutoffs** (Phase 3): Greenhouse's official cutoffs
   aren't published. Reasonable defaults proposed: Strong ≥ 80,
   Good 65-79, Partial 45-64, Limited 25-44, Needs work < 25.
   Validate with real users before locking in.
2. **Lightcast Open Skills ingestion** (Phase 2, optional): the
   taxonomy is ~32K skills in CSV. Building an alias dictionary
   is non-trivial. Defer unless we measure the lift in Phase 2
   without it.
3. **Inngest vs. fire-and-forget for lazy backfill** (Phase 1):
   `lib/inngest/` already exists in the codebase. Use it for
   backfill to avoid server-action timeouts on big JDs.
4. **What model constant for the extractor** (Phase 1): current
   `PARSE_FALLBACKS` chain in `lib/ai/fallback.ts` is parse-tuned
   (structured output, not free-form). Same chain should work for
   extraction. Confirm during implementation.

---

## Drift linkage

- Phase 3 ATS scoring (the v1 baseline this builds on) shipped at
  `4385027` (2026-09-19). Drift memo at
  `docs/drift/2026-09-19-ats-engine-review.md`.
- This v2 plan is the natural Phase 4 follow-up that v1 deferred.
  The drift memo explicitly calls out "Plan C: ATS scoring
  refinement" as the next item.
- A new drift memo at `docs/drift/2026-09-19-ats-v2-shipped.md`
  will be written when Phase 3 ships.

---

## Architecture Decision Records

If Phase 2 ships the Lightcast integration (not currently planned),
write `docs/decisions/0001-lightcast-open-skills.md` with the
build-vs-buy rationale. Otherwise no ADRs needed — the locked
stack is preserved, no vendor contracts signed, no new trust
boundaries.
