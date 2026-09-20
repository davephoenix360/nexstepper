import { describe, expect, it } from 'vitest';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { z } from 'zod';

import { scoreResumeFromEnvelope } from '@/lib/scoring';
import {
  jobPostingSchema,
  resumeDataSchema,
  type ResumeData,
  type JobPosting
} from '@/lib/resume-schema';

/**
 * ATS scoring v2 — validation corpus harness.
 *
 * Acceptance gate from the plan (`docs/plans/ats-scoring-v2.md`
 * Phase 3) and the drift memo (`docs/drift/2026-09-20-ats-v2-shipped.md`
 * §4): Pearson correlation between the engine's `overallScore` and
 * the labeled `idealScore` across 50 triples must be > 0.7.
 *
 * Methodology decision documented in
 * `docs/decisions/0005-ats-validation-corpus.md`: manual curation —
 * public datasets have categorical labels (3-tier) not continuous
 * 0-100 scores, and synthetic-via-LLM is circular (validating LLM
 * output against LLM judgments).
 *
 * Why this test runs the FULL v2 surface (incl. Role Fit):
 *   - The sync engine accepts a pre-computed `roleFitSimilarity`
 *     (see `lib/scoring/score.ts > PrecomputedRoleFit`). The MiniLM
 *     cold start is ~2-5s — too slow for a 50-triple regression test.
 *   - Each corpus entry carries a hand-labeled
 *     `precomputedRoleFitSimilarity` in [0, 1] reflecting the
 *     cosine between the JD title and the best-matching resume title.
 *     The corpus author picks the value (per role-family taxonomy —
 *     see ADR §"Decision"). The role-fit test for MiniLM-as-JobBERT-V3
 *     is a separate question deferred to a follow-up.
 *   - Role Fit becomes a real signal in the calibration rather than
 *     a constant 50. Pearson r is then measured on the full v2
 *     composition (WEIGHTS_V2 = 7-dim).
 *
 * Why a Zod parse pass:
 *   - `jobPostingSchema` and `resumeDataSchema` are the single
 *     source of truth for the v2 envelope shape. Catching a shape
 *     regression at the corpus loader (one big stack trace) is
 *     better than letting it surface as a weird scoring math
 *     surprise 50 lines later.
 *   - We use `.safeParse` and `.success` so a malformed row fails
 *     loudly with the Zod issue list instead of throwing deep in
 *     the engine.
 */

const CORPUS_PATH = join(process.cwd(), 'tests/fixtures/ats-corpus.json');

/**
 * Schema for a single corpus entry. The `jd` + `resume` are validated
 * against the canonical Zod schemas; everything else is hand-checked
 * by the corpus author.
 */
const corpusEntrySchema = z.object({
  id: z.string().min(1),
  tier: z.enum(['strong', 'good', 'partial', 'limited', 'needs-work']),
  roleFamily: z.string().min(1),
  rubric: z.string().min(1),
  jd: jobPostingSchema,
  resume: resumeDataSchema,
  idealScore: z.number().int().min(0).max(100),
  /** Cosine similarity in [0, 1] between JD title and best resume title. */
  precomputedRoleFitSimilarity: z.number().min(0).max(1),
  labeler: z.string().min(1),
  labeledAt: z.string().min(1)
});

const corpusSchema = z.array(corpusEntrySchema).min(50).max(50);

type CorpusEntry = z.infer<typeof corpusEntrySchema>;

function loadCorpus(): CorpusEntry[] {
  const raw = readFileSync(CORPUS_PATH, 'utf8');
  const parsed: unknown = JSON.parse(raw);
  const result = corpusSchema.safeParse(parsed);
  if (!result.success) {
    // Surface the first few Zod issues so the failure is debuggable
    // without rerunning with `--inspect`.
    const issues = result.error.issues.slice(0, 5);
    throw new Error(
      `Corpus failed schema validation. First ${issues.length} issue(s):\n` +
        issues
          .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
          .join('\n') +
        (result.error.issues.length > issues.length
          ? `\n  ...and ${result.error.issues.length - issues.length} more.`
          : '')
    );
  }
  return result.data;
}

/**
 * Pearson correlation coefficient. Standard formula — covariance of
 * (x, y) divided by the product of their standard deviations.
 *
 * Returns 1.0 when both inputs are perfectly linearly correlated
 * (and identically distributed); 0 when uncorrelated; -1 when
 * inversely correlated. Returns NaN only when either input has zero
 * variance (we guard against that explicitly so the assertion error
 * is readable).
 */
function pearson(xs: number[], ys: number[]): number {
  if (xs.length !== ys.length) {
    throw new Error(`pearson: length mismatch (${xs.length} vs ${ys.length})`);
  }
  if (xs.length < 2) {
    throw new Error(`pearson: need at least 2 points, got ${xs.length}`);
  }
  const n = xs.length;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let covXY = 0;
  let varX = 0;
  let varY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - meanX;
    const dy = ys[i]! - meanY;
    covXY += dx * dy;
    varX += dx * dx;
    varY += dy * dy;
  }
  if (varX === 0 || varY === 0) {
    throw new Error('pearson: zero variance in one of the inputs');
  }
  return covXY / Math.sqrt(varX * varY);
}

interface ScoredTriple {
  id: string;
  tier: CorpusEntry['tier'];
  roleFamily: string;
  rubric: string;
  idealScore: number;
  engineScore: number;
  /** Per-dimension v2 scores — surfaced for debugging when r < 0.7. */
  dimensionScores: {
    atsMatching: number;
    structure: number;
    contentQuality: number;
    alignment: number;
    intentCoverage: number;
    roleFit: number;
    seniorityFit: number;
  };
}

function scoreTriple(entry: CorpusEntry): ScoredTriple {
  const breakdown = scoreResumeFromEnvelope(
    entry.resume as ResumeData,
    entry.jd as JobPosting,
    // Fixed clock for determinism — Seniority Fit computes tenure
    // from `now - work.startDate`. Without a fixed clock the test
    // would drift over time as `new Date()` advances. Picked
    // 2026-09-20 because that's the date the corpus is anchored
    // to (see ADR-0005 + drift memo §3). Server Components and
    // Server Actions pass `new Date()` at the call site — see
    // `app/(dashboard)/dashboard/resumes/[id]/page.tsx`.
    new Date('2026-09-20'),
    { roleFitSimilarity: entry.precomputedRoleFitSimilarity }
  );
  return {
    id: entry.id,
    tier: entry.tier,
    roleFamily: entry.roleFamily,
    rubric: entry.rubric,
    idealScore: entry.idealScore,
    engineScore: breakdown.overallScore,
    dimensionScores: breakdown.dimensionScores
  };
}

describe('ATS scoring v2 — validation corpus', () => {
  const corpus = loadCorpus();
  const scored: ScoredTriple[] = corpus.map(scoreTriple);
  const engineScores = scored.map((s) => s.engineScore);
  const idealScores = scored.map((s) => s.idealScore);

  it('loads exactly 50 triples from the corpus file', () => {
    // The schema enforces `.min(50).max(50)`; this assertion
    // exists so a failing run makes the size error visible in the
    // test name rather than as a generic Zod error.
    expect(corpus).toHaveLength(50);
  });

  it('spans all 5 match-quality tiers (no tier is empty)', () => {
    const tiers = new Set(scored.map((s) => s.tier));
    expect(tiers.size).toBe(5);
    for (const t of ['strong', 'good', 'partial', 'limited', 'needs-work']) {
      expect(tiers.has(t as CorpusEntry['tier'])).toBe(true);
    }
  });

  it('spans at least 5 distinct role families (no single-family collapse)', () => {
    const families = new Set(scored.map((s) => s.roleFamily));
    expect(families.size).toBeGreaterThanOrEqual(5);
  });

  it('idealScores span at least 50 points across the corpus (no narrow range)', () => {
    const min = Math.min(...idealScores);
    const max = Math.max(...idealScores);
    expect(max - min).toBeGreaterThanOrEqual(50);
  });

  it('engine scores span at least 30 points across the corpus', () => {
    // The sync engine has known compression at both ends (drift
    // memo §3e: seniority locked at 50, alignment floor ~5-40 for
    // summaries that don't echo the JD title). Current observed
    // span on this corpus: 38 points. 30 is the sanity floor —
    // below that, Pearson r is meaningless because the signal is
    // collapsed. See ADR-0005 §"Acceptance gate" for the rationale.
    const min = Math.min(...engineScores);
    const max = Math.max(...engineScores);
    expect(max - min).toBeGreaterThanOrEqual(30);
  });

  it('Pearson r between engine.overallScore and idealScore is > 0.7', () => {
    const r = pearson(engineScores, idealScores);
    if (r <= 0.7) {
      // On failure, print the worst-offending rows so the calibration
      // owner can immediately see which triples need re-labeling or
      // which dimension is the weak link. We cap at 10 rows to keep
      // the failure message readable.
      const lines = scored
        .map((s) => ({
          ...s,
          delta: s.engineScore - s.idealScore
        }))
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
        .slice(0, 10)
        .map(
          (s) =>
            `  ${s.id} [${s.tier}/${s.roleFamily}]: ideal=${s.idealScore} engine=${s.engineScore} Δ=${s.delta >= 0 ? '+' : ''}${s.delta}  ats=${s.dimensionScores.atsMatching.toFixed(0)} intent=${s.dimensionScores.intentCoverage.toFixed(0)} roleFit=${s.dimensionScores.roleFit.toFixed(0)} senior=${s.dimensionScores.seniorityFit.toFixed(0)}`
        );
      throw new Error(
        `Pearson r = ${r.toFixed(3)} is below the 0.7 acceptance gate. ` +
          `Worst 10 rows by |Δ|:\n${lines.join('\n')}\n` +
          `See docs/decisions/0005-ats-validation-corpus.md §"Rollback".`
      );
    }
    expect(r).toBeGreaterThan(0.7);
  });

  it('engine and ideal scores agree on tier ordering within each role family (smoke)', () => {
    // Spot-check: within each role family, a "strong" triple should
    // score higher than a "needs-work" triple, by both engine and
    // ideal. This is a weaker property than Pearson r but a more
    // intuitive failure mode: "the engine puts a designer resume
    // above a senior backend resume on a backend JD".
    const byFamily = new Map<string, ScoredTriple[]>();
    for (const s of scored) {
      const list = byFamily.get(s.roleFamily) ?? [];
      list.push(s);
      byFamily.set(s.roleFamily, list);
    }
    for (const [family, list] of byFamily) {
      const strong = list.find((s) => s.tier === 'strong');
      const needsWork = list.find((s) => s.tier === 'needs-work');
      if (!strong || !needsWork) continue;
      // Both metrics should rank strong above needs-work.
      expect(
        strong.engineScore,
        `${family}: engine should rank strong (${strong.engineScore}) above needs-work (${needsWork.engineScore})`
      ).toBeGreaterThan(needsWork.engineScore);
      expect(
        strong.idealScore,
        `${family}: ideal should rank strong (${strong.idealScore}) above needs-work (${needsWork.idealScore})`
      ).toBeGreaterThan(needsWork.idealScore);
    }
  });
});
