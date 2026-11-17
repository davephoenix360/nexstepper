#!/usr/bin/env node
/**
 * Does the PRODUCTION similarity signal score as accurately as the one
 * the validation corpus validates?
 *
 * ## The gap this measures
 *
 * `tests/unit/scoring/validation-corpus.test.ts` — the repo's accuracy
 * gate, ADR 0005 — scores the corpus with the **SYNC** engine
 * (`scoreResumeFromEnvelope`).
 *
 * Production runs the **HYBRID** engine
 * (`scoreResumeHybridFromEnvelope`), which is the sync engine plus:
 *
 *   1. the hybrid similarity (BM25 + the MiniLM embedding) replacing the
 *      token-only "ATS Similarity" sub-score, and
 *   2. Jev's requirement + content evaluations.
 *
 * So the corpus validates the engine, not the product. That gap is
 * exactly how the semantic signal could be silently ZERO in production
 * for months while the corpus stayed green (drift memo
 * 2026-11-16-role-fit-and-the-silent-semantic-signal.md).
 *
 * This measures (1) — the deterministic half, the one that changes the
 * arithmetic — by substituting the hybrid similarity into the sync
 * engine's composition, which is precisely what
 * `score-hybrid.ts` does.
 *
 * ## What a good result looks like
 *
 * The hybrid r should be AT LEAST the sync r. If it is lower, the
 * embedding signal is making the score LESS accurate — and it is 20%
 * of the ATS Matching dimension, so that would be worth knowing.
 *
 * Needs the MiniLM model (local cache or a one-time download). Writes
 * nothing.
 */

import './load-env';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { composeOverallScore, scoreResumeFromEnvelope } from '@/lib/scoring';
import { resumeDataToScoreable } from '@/lib/scoring/resume-adapter';
import { jobPostingSchema, resumeDataSchema } from '@/lib/resume-schema';
import { hybridSimilarity } from '@/lib/scoring-async/hybrid-similarity';
import type { ResumeData, JobPosting } from '@/lib/resume-schema';

const CORPUS_PATH = join(process.cwd(), 'tests/fixtures/ats-corpus.json');

type CorpusEntry = {
  jd: JobPosting;
  resume: ResumeData;
  idealScore: number;
  precomputedRoleFitSimilarity?: number;
};

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function pearson(xs: number[], ys: number[]): number {
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < xs.length; i++) {
    const a = xs[i] - mx;
    const b = ys[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  const denom = Math.sqrt(dx * dy);
  return denom === 0 ? 0 : num / denom;
}

async function main(): Promise<void> {
  const raw = JSON.parse(readFileSync(CORPUS_PATH, 'utf8')) as CorpusEntry[];
  const entries = Array.isArray(raw)
    ? raw
    : Object.values(raw as unknown as Record<string, CorpusEntry>);

  const syncScores: number[] = [];
  const hybridScores: number[] = [];
  const ideals: number[] = [];
  const deltas: number[] = [];

  for (const entry of entries) {
    const resume = resumeDataSchema.parse(entry.resume);
    const job = jobPostingSchema.parse(entry.jd);
    const now = new Date('2026-01-01T00:00:00Z');
    const precomputed =
      entry.precomputedRoleFitSimilarity != null
        ? { roleFitSimilarity: entry.precomputedRoleFitSimilarity }
        : undefined;

    const baseline = scoreResumeFromEnvelope(resume, job, now, precomputed);
    syncScores.push(baseline.overallScore);
    ideals.push(entry.idealScore);

    // The production substitution: replace the token-only "ATS
    // Similarity" sub-score with the hybrid one and recompose. This is
    // exactly `recomputeAtsMatchingDimension` + `composeOverallScore`
    // from `lib/scoring-async/score-hybrid.ts`.
    const hybrid = (await hybridSimilarity(resumeDataToScoreable(resume), {
      title: job.title ?? '',
      description: job.description ?? '',
      requirements: job.requirements ?? [],
      niceToHaves: job.niceToHaves ?? [],
      benefits: job.benefits ?? []
    })) * 100;

    const keywordScore = baseline.criteriaScores['ATS Keyword Match'];
    const coverageScore = baseline.criteriaScores['ATS Keyword Match'];
    const hasRequirements = (job.requirements?.length ?? 0) > 0;
    const weights = hasRequirements
      ? { keyword: 0.6, similarity: 0.2, coverage: 0.2 }
      : { keyword: 0.75, similarity: 0.25, coverage: 0 };

    const newAtsMatching =
      weights.keyword * keywordScore +
      weights.similarity * hybrid +
      weights.coverage * coverageScore;

    const overall = composeOverallScore(
      { ...baseline.dimensionScores, atsMatching: newAtsMatching },
      !baseline.intentCoverageBreakdown.fallback
    );
    hybridScores.push(overall);
    deltas.push(overall - baseline.overallScore);
  }

  const syncR = pearson(syncScores, ideals);
  const hybridR = pearson(hybridScores, ideals);

  console.log('');
  console.log('Production-signal accuracy — sync engine vs the hybrid substitution');
  console.log('----------------------------------------------------------------');
  console.log(`  entries                : ${entries.length}`);
  console.log(`  Pearson r (sync)       : ${syncR.toFixed(4)}`);
  console.log(`  Pearson r (hybrid)     : ${hybridR.toFixed(4)}`);
  console.log(`  difference             : ${(hybridR - syncR >= 0 ? '+' : '')}${(hybridR - syncR).toFixed(4)}`);
  console.log('');
  console.log(
    `  mean score shift       : ${mean(deltas) >= 0 ? '+' : ''}${mean(deltas).toFixed(2)} points`
  );
  console.log(
    `  biggest shift          : ${Math.max(...deltas.map(Math.abs)).toFixed(2)} points`
  );
  console.log('');
  console.log(
    hybridR >= syncR
      ? '  The production similarity signal is AT LEAST as accurate as the one the corpus validates.'
      : '  The production similarity signal is LESS accurate than the one the corpus validates.'
  );
  console.log('');
}

main().catch((err) => {
  console.error(String(err));
  process.exit(1);
});
