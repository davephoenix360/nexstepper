#!/usr/bin/env node
/**
 * Does every dimension actually MEASURE something?
 *
 * ## Why this exists
 *
 * Three dimensions in a row read as "measured" while measuring nothing:
 * Role Fit (no JD title), Seniority Fit (an ISO-only date parser), ATS
 * Similarity (the embedding model never loaded). The tell in all three
 * was the same — **a constant, or a near-constant, number**. A
 * dimension that cannot move cannot be wrong, and therefore cannot be
 * right.
 *
 * So this scores the 50-entry validation corpus and prints each
 * dimension's SPREAD. A dimension with a tiny range, or with only a
 * handful of distinct values across 50 real resume/JD pairs, is not
 * measuring the candidate — it is measuring nothing, or measuring
 * something that never varies.
 *
 * It also prints the Pearson correlation between the engine's overall
 * score and the corpus's hand-labelled `idealScore` — the repo's own
 * accuracy gate (ADR 0005). If a scoring change moves the spread but
 * moves the correlation DOWN, the change made the engine busier without
 * making it better.
 *
 * Offline. Reads a fixture; writes nothing.
 *
 * ## Usage
 *
 *   pnpm probe:dimension-variance
 */

import './load-env';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { scoreResumeFromEnvelope } from '@/lib/scoring';
import { jobPostingSchema, resumeDataSchema } from '@/lib/resume-schema';
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

function stdDev(values: number[]): number {
  const m = mean(values);
  return Math.sqrt(mean(values.map((v) => (v - m) ** 2)));
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

const DIMENSIONS = [
  'atsMatching',
  'structure',
  'contentQuality',
  'alignment',
  'intentCoverage',
  'roleFit',
  'seniorityFit'
] as const;

const CRITERIA = [
  'ATS Keyword Match',
  'ATS Similarity',
  'ATS Keyword Match',
  'Intent Coverage',
  'Section Completeness',
  'Optimal Length',
  'Accomplishment Focus',
  'Action Verb Usage',
  'Tailoring',
  'Unique Value',
  'Role Fit',
  'Seniority Fit',
  'Soft Skills'
] as const;

function main(): void {
  const raw = JSON.parse(readFileSync(CORPUS_PATH, 'utf8')) as CorpusEntry[];
  const entries = Array.isArray(raw)
    ? raw
    : Object.values(raw as unknown as Record<string, CorpusEntry>);
  console.log('');
  console.log(`Dimension variance — ${entries.length} corpus entries`);
  console.log('----------------------------------------------------');

  const dimensionValues: Record<string, number[]> = {};
  const criteriaValues: Record<string, number[]> = {};
  const overalls: number[] = [];
  const ideals: number[] = [];

  for (const entry of entries) {
    const resume = resumeDataSchema.parse(entry.resume);
    const job = jobPostingSchema.parse(entry.jd);
    const breakdown = scoreResumeFromEnvelope(
      resume,
      job,
      new Date('2026-01-01T00:00:00Z'),
      entry.precomputedRoleFitSimilarity != null
        ? { roleFitSimilarity: entry.precomputedRoleFitSimilarity }
        : undefined
    );

    for (const key of DIMENSIONS) {
      (dimensionValues[key] ??= []).push(breakdown.dimensionScores[key]);
    }
    for (const key of CRITERIA) {
      const value = breakdown.criteriaScores[key];
      if (typeof value === 'number') {
        (criteriaValues[key] ??= []).push(value);
      }
    }
    overalls.push(breakdown.overallScore);
    ideals.push(entry.idealScore);
  }

  const report = (label: string, values: number[] | undefined): void => {
    if (!values || values.length === 0) return;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const distinct = new Set(values.map((v) => Math.round(v * 100) / 100)).size;
    const spread = max - min;
    const flat = spread < 15 || distinct <= 5;
    console.log(
      `  ${label.padEnd(24)} min ${String(Math.round(min)).padStart(3)}` +
        `  max ${String(Math.round(max)).padStart(3)}` +
        `  spread ${String(Math.round(spread)).padStart(3)}` +
        `  mean ${String(Math.round(mean(values))).padStart(3)}` +
        `  sd ${String(Math.round(stdDev(values))).padStart(3)}` +
        `  distinct ${String(distinct).padStart(3)}` +
        `  ${flat ? '  <-- FLAT' : ''}`
    );
  };

  console.log('');
  console.log('  DIMENSIONS (the weighted seven)');
  for (const key of DIMENSIONS) report(key, dimensionValues[key]);

  console.log('');
  console.log('  CRITERIA (the leaves the scorecard shows)');
  for (const key of CRITERIA) report(key, criteriaValues[key]);

  const r = pearson(overalls, ideals);
  console.log('');
  console.log(`  Pearson r (overall vs hand-labelled idealScore) = ${r.toFixed(4)}`);
  console.log(`  the acceptance gate in ADR 0005 is r > 0.7`);
  console.log('');

  // The flat ones, named explicitly — this is the list to work through.
  const flat: string[] = [];
  for (const key of DIMENSIONS) {
    const values = dimensionValues[key];
    if (!values) continue;
    const spread = Math.max(...values) - Math.min(...values);
    const distinct = new Set(values.map((v) => Math.round(v * 100) / 100)).size;
    if (spread < 15 || distinct <= 5) flat.push(key);
  }
  console.log(
    flat.length === 0
      ? '  No flat dimensions. Every one moves.'
      : `  FLAT DIMENSIONS: ${flat.join(', ')}`
  );
  console.log('');
}

main();
