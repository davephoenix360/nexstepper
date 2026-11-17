#!/usr/bin/env node
/**
 * Does the committed accuracy record still describe the current engine?
 *
 * ## The problem
 *
 * `tests/fixtures/jev-corpus-measurements.json` is the repo's record of
 * how accurate the scoring engine is. It was measured on **2026-10-23**,
 * and the offline test that reads it asserts the fixture's internal
 * consistency — NOT that the fixture still describes the app.
 *
 * So when the engine changes, the record silently becomes a description
 * of an engine that no longer exists. Nothing flags it.
 *
 * ## What this measures
 *
 * The fixture records, per corpus entry, the SYNC engine's overall score.
 * The sync half needs no AI, so it can be recomputed offline, right
 * now, with the current code. This recomputes it and reports:
 *
 *   - how many entries the current engine scores differently,
 *   - the largest difference,
 *   - and the correlation against the hand-labelled ideal scores —
 *     the number ADR 0005's gate is written against.
 *
 * The JEV half of the fixture needs the AI, so it is NOT re-measured
 * here; that is what `MEASURE_JEV=1` is for.
 *
 * Read-only. Writes nothing.
 */
import './load-env';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { scoreResumeFromEnvelope } from '@/lib/scoring/score';
import { jobPostingSchema, resumeDataSchema } from '@/lib/resume-schema';

const CORPUS_PATH = join(process.cwd(), 'tests/fixtures/ats-corpus.json');
const FIXTURE_PATH = join(process.cwd(), 'tests/fixtures/jev-corpus-measurements.json');

type CorpusEntry = {
  id: string;
  tier: string;
  idealScore: number;
  jd: unknown;
  resume: unknown;
  precomputedRoleFitSimilarity?: number;
};

type Fixture = {
  summary: { correlation: { sync: number; jev: number }; measuredAt?: string };
  measurements: Array<{
    id: string;
    idealScore: number;
    syncOverall: number;
    jevOverall: number;
  }>;
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

function main(): void {
  const corpus = JSON.parse(readFileSync(CORPUS_PATH, 'utf8')) as CorpusEntry[];
  const fixture = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as Fixture;
  const entries = Array.isArray(corpus)
    ? corpus
    : Object.values(corpus as unknown as Record<string, CorpusEntry>);

  const byId = new Map(fixture.measurements.map((m) => [m.id, m]));

  const ideals: number[] = [];
  const recorded: number[] = [];
  const current: number[] = [];

  const changed: Array<{ id: string; was: number; now: number }> = [];

  for (const entry of entries) {
    const record = byId.get(entry.id);
    if (!record) continue;

    const resume = resumeDataSchema.parse(entry.resume);
    const jd = jobPostingSchema.parse(entry.jd);

    const scored = scoreResumeFromEnvelope(
      resume,
      jd,
      new Date('2026-09-20'),
      entry.precomputedRoleFitSimilarity != null
        ? { roleFitSimilarity: entry.precomputedRoleFitSimilarity }
        : undefined
    );

    ideals.push(record.idealScore);
    recorded.push(record.syncOverall);
    current.push(scored.overallScore);

    if (scored.overallScore !== record.syncOverall) {
      changed.push({
        id: entry.id,
        was: record.syncOverall,
        now: scored.overallScore
      });
    }
  }

  const recordedR = pearson(recorded, ideals);
  const currentR = pearson(current, ideals);

  console.log('');
  console.log('Does the committed accuracy record still describe the engine?');
  console.log('-------------------------------------------------------');
  console.log(`  fixture recorded at        : ${fixture.summary.measuredAt ?? 'unknown'}`);
  console.log(`  entries compared           : ${current.length}`);
  console.log(`  entries the engine moved   : ${changed.length}`);
  if (changed.length > 0) {
    const deltas = changed.map((c) => c.now - c.was);
    console.log(
      `  largest move               : ${Math.max(...deltas.map(Math.abs))} points`
    );
    console.log('');
    console.log('  the ten biggest moves:');
    for (const c of changed
      .map((c) => ({ ...c, delta: c.now - c.was }))
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 10)) {
      console.log(`    ${c.id.padEnd(24)} ${c.was} → ${c.now}  (${c.delta > 0 ? '+' : ''}${c.delta})`);
    }
  }
  console.log('');
  console.log(`  correlation in the fixture : ${recordedR.toFixed(4)}`);
  console.log(`  correlation NOW            : ${currentR.toFixed(4)}`);
  console.log(
    `  → the record ${Math.abs(recordedR - currentR) < 0.002 ? 'still describes' : 'NO LONGER describes'} the engine`
  );
  console.log('');
}

main();
