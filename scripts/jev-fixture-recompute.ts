/**
 * Recompute the engine half of the Jev corpus record.
 *
 * ## Why this exists
 *
 * `tests/fixtures/jev-corpus-measurements.json` is the repo's record of
 * how accurate the scoring engine is. It was measured on 2026-10-23 and
 * the offline test reads it as a committed fact.
 *
 * The record has two halves:
 *
 *   - **MODEL outputs** — Jev's per-line classification (`pSkill`,
 *     `pGate`, `evidence`), the AUC, the control's evidence means. These
 *     describe the MODEL and the JD's requirement lines. They do not
 *     change when the engine changes, and they are not re-derived here.
 *
 *   - **ENGINE outputs** — `syncOverall`, `jevOverall`, the
 *     correlations, the mean absolute error, the control's agreement.
 *     These describe the ENGINE, and they go stale the moment the engine
 *     changes.
 *
 * The offline test asserts the fixture's internal consistency, so a stale
 * engine half reads as a valid record. Measured on 2026-11-17: 17 of 50
 * entries had moved, and the recorded correlation (0.9103) no longer
 * matched the engine's (0.9156).
 *
 * ## The good news
 *
 * The Jev half is recomputable OFFLINE. The fixture stores Jev's
 * evaluation (`lines`, `requirements`, `gates`, `scorable`, `bullets`),
 * and that evaluation is an INPUT to the score — not an output of it. So
 * re-scoring with the stored evaluation needs no AI call, no gateway
 * credit, and no network.
 *
 * So refreshing the record is cheap, and `tests/unit/scoring/
 * jev-fixture-current.test.ts` can guard it: if the engine changes and
 * the record is not refreshed, the guard fails.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { scoreResumeFromEnvelope } from '@/lib/scoring/score';
import { jobPostingSchema, resumeDataSchema } from '@/lib/resume-schema';
import { buildSkillIndex, isSkillCovered } from '@/lib/scoring/skill-match';
import { flattenResumeText } from '@/lib/scoring/similarity';
import { resumeDataToScoreable } from '@/lib/scoring/resume-adapter';
import type {
  JevRequirementEvaluation,
  JevRequirementLine
} from '@/lib/scoring/jev-requirements';
import type { JevContentQualityEvaluation } from '@/lib/scoring/jev-content-quality';

/** The clock the fixture was measured with. Seniority Fit reads it. */
export const FIXTURE_NOW = new Date('2026-09-20');

export type CorpusEntry = {
  id: string;
  tier: string;
  idealScore: number;
  jd: unknown;
  resume: unknown;
  precomputedRoleFitSimilarity?: number;
};

export type FixtureMeasurement = {
  id: string;
  tier: string;
  idealScore: number;
  requirementLineClassification: Array<{
    line: string;
    pSkill: number | null;
  }>;
  lines: JevRequirementLine[];
  scorable: Record<string, string[]>;
  requirements: Array<{ text: string; evidence: number }>;
  gates: string[];
  control: Array<{
    text: string;
    tokenSaysCovered: boolean;
    evidence: number | null;
  }>;
  bullets: JevContentQualityEvaluation['bullets'];
  syncOverall: number;
  jevOverall: number;
  syncContentQuality: number;
  jevContentQuality: number;
  syncIntentCoverage: number;
  jevIntentCoverage: number;
  syncMissedMust: string[];
  jevMissedMust: string[];
};

export type Fixture = {
  summary: {
    model: string;
    measuredAt: string;
    corpusSize: number;
    linesClassified: number;
    classificationInput: string;
    scoreInput: string;
    meanPSkillForRealSkills: number;
    meanPSkillForNonSkills: number;
    auc: number;
    control: {
      n: number;
      meanEvidenceForTokenPresent: number;
      meanEvidenceForTokenAbsent: number;
      agreement: number;
    };
    correlation: { sync: number; jev: number };
    meanAbsoluteError: { sync: number; jev: number };
    wallClockSeconds: number;
    /**
     * When the ENGINE half was last re-scored.
     *
     * Separate from `measuredAt`, which is the MODEL measurement date:
     * the AUC and the pSkill means describe the model and the JD's
     * requirement lines, and they do not change when the engine does.
     */
    engineRefreshedAt?: string;
  };
  measurements: FixtureMeasurement[];
};

export function readCorpus(): CorpusEntry[] {
  const raw = JSON.parse(
    readFileSync(join(process.cwd(), 'tests/fixtures/ats-corpus.json'), 'utf8')
  ) as CorpusEntry[];
  return Array.isArray(raw)
    ? raw
    : Object.values(raw as unknown as Record<string, CorpusEntry>);
}

export function readFixture(): Fixture {
  return JSON.parse(
    readFileSync(
      join(process.cwd(), 'tests/fixtures/jev-corpus-measurements.json'),
      'utf8'
    )
  ) as Fixture;
}

function mean(values: number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((a, b) => a + b, 0) / values.length;
}

export function pearson(xs: number[], ys: number[]): number {
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

/**
 * Re-score one corpus entry, with and without Jev, using the CURRENT
 * engine and the fixture's STORED Jev evaluation.
 */
export function rescoreEntry(entry: CorpusEntry, measurement: FixtureMeasurement) {
  const resume = resumeDataSchema.parse(entry.resume);
  const jd = jobPostingSchema.parse(entry.jd);

  const evaluation: JevRequirementEvaluation = {
    lines: measurement.lines,
    requirements: measurement.requirements,
    gates: measurement.gates,
    scorable: measurement.scorable as JevRequirementEvaluation['scorable'],
    ok: true
  };
  const contentEvaluation: JevContentQualityEvaluation = {
    bullets: measurement.bullets,
    ok: true
  };

  const precomputed =
    entry.precomputedRoleFitSimilarity != null
      ? { roleFitSimilarity: entry.precomputedRoleFitSimilarity }
      : undefined;

  const sync = scoreResumeFromEnvelope(resume, jd, FIXTURE_NOW, precomputed);
  const withJev = scoreResumeFromEnvelope(
    resume,
    jd,
    FIXTURE_NOW,
    precomputed,
    { evaluation },
    { evaluation: contentEvaluation }
  );

  // The control's token side: the token matcher says "covered" when the
  // JD's words appear in the resume. The resume text changed this
  // session (education, certificates, languages and the location are
  // readable now), so the agreement has to be recomputed too.
  const skillIndex = buildSkillIndex(
    flattenResumeText(resumeDataToScoreable(resume)).toLowerCase()
  );
  const control = measurement.lines.map((line) => ({
    text: line.text,
    tokenSaysCovered: isSkillCovered(line.text, skillIndex),
    evidence: line.evidence
  }));

  return {
    sync,
    withJev,
    control,
    syncOverall: sync.overallScore,
    jevOverall: withJev.overallScore,
    syncContentQuality: sync.dimensionScores.contentQuality,
    jevContentQuality: withJev.dimensionScores.contentQuality,
    syncIntentCoverage: sync.dimensionScores.intentCoverage,
    jevIntentCoverage: withJev.dimensionScores.intentCoverage,
    syncMissedMust: sync.intentCoverageBreakdown.missed.mustHave,
    jevMissedMust: withJev.intentCoverageBreakdown.missed.mustHave
  };
}

/**
 * The engine half of the record, recomputed from scratch.
 *
 * The model half (AUC, the pSkill means, the control's evidence means)
 * is NOT recomputed — it describes the model, not the engine, and
 * re-deriving it would need the AI.
 */
export function recomputeEngineHalf(fixture: Fixture, corpus: CorpusEntry[]) {
  const byId = new Map(corpus.map((c) => [c.id, c]));
  const measurements: FixtureMeasurement[] = [];

  for (const measurement of fixture.measurements) {
    const entry = byId.get(measurement.id);
    if (!entry) continue;
    const scored = rescoreEntry(entry, measurement);
    measurements.push({
      ...measurement,
      control: scored.control,
      syncOverall: scored.syncOverall,
      jevOverall: scored.jevOverall,
      syncContentQuality: scored.syncContentQuality,
      jevContentQuality: scored.jevContentQuality,
      syncIntentCoverage: scored.syncIntentCoverage,
      jevIntentCoverage: scored.jevIntentCoverage,
      syncMissedMust: scored.syncMissedMust,
      jevMissedMust: scored.jevMissedMust
    });
  }

  const ideals = measurements.map((m) => m.idealScore);
  const syncScores = measurements.map((m) => m.syncOverall);
  const jevScores = measurements.map((m) => m.jevOverall);

  const mae = (scores: number[]) =>
    mean(scores.map((s, i) => Math.abs(s - ideals[i]!)));

  // The control's agreement: how often the token matcher and Jev agree
  // about "is this requirement covered?".
  const allControl = measurements.flatMap((m) => m.control);
  const agreement =
    allControl.length === 0
      ? 0
      : allControl.filter((c) => c.tokenSaysCovered === (c.evidence ?? 0) >= 1).length /
        allControl.length;

  return {
    measurements,
    summary: {
      ...fixture.summary,
      control: {
        ...fixture.summary.control,
        agreement
      },
      correlation: {
        sync: pearson(syncScores, ideals),
        jev: pearson(jevScores, ideals)
      },
      meanAbsoluteError: {
        sync: mae(syncScores),
        jev: mae(jevScores)
      }
    }
  };
}

/** How many entries the current engine scores differently from the record. */
export function countDrift(
  fixture: Fixture,
  recomputed: { measurements: FixtureMeasurement[] }
): { moved: number; total: number; maxDelta: number } {
  const byId = new Map(recomputed.measurements.map((m) => [m.id, m]));
  let moved = 0;
  let maxDelta = 0;
  for (const measurement of fixture.measurements) {
    const now = byId.get(measurement.id);
    if (!now) continue;
    const delta = Math.abs(now.syncOverall - measurement.syncOverall);
    if (delta > 0) moved++;
    if (delta > maxDelta) maxDelta = delta;
  }
  return { moved, total: fixture.measurements.length, maxDelta };
}
