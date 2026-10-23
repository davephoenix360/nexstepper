/**
 * The Jev corpus measurement — OPT-IN. Run it with:
 *
 *     MEASURE_JEV=1 pnpm vitest run tests/unit/scoring/jev-corpus.measure.test.ts
 *
 * or through the wrapper:
 *
 *     node scripts/measure-jev-corpus.cjs
 *
 * ## Why it is a test and not a script
 *
 * It used to be a standalone script with its own copy of the Jev calls.
 * That is a drift trap: the script's copy of the questions and the
 * production module's copy would silently diverge, and the fixture
 * would keep describing a system we no longer run. It now calls the
 * real `evaluateJevRequirements` — the same function the app calls —
 * so the fixture can only ever describe what the app does.
 *
 * It is SKIPPED unless `MEASURE_JEV` is set, because it needs the
 * network and a gateway key, and CI must not spend money.
 *
 * ## What it measures
 *
 *   1. **Classification quality.** Jev is asked which of the JD's
 *      requirement LINES are genuine skills, and the probabilities are
 *      validated against the corpus's hand-authored skill lists. Not
 *      circular: the lines and the ground truth are different things.
 *      This is where the AUC comes from.
 *
 *   2. **The score inputs.** The production evaluation over the intent
 *      extractor's lists, which is what production stores and what the
 *      score is computed from.
 *
 * The output is committed as `tests/fixtures/jev-corpus-measurements.json`
 * and pinned offline by `jev-corpus.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { jevDecide, readNoul } from '@/lib/ai/jev';
import { evaluateJevRequirements } from '@/lib/scoring-async/jev-requirements';
import { evaluateJevContentQuality } from '@/lib/scoring-async/jev-content-quality';
import { scoreResumeFromEnvelope } from '@/lib/scoring';
import { resumeDataToScoreable } from '@/lib/scoring/score';
import { buildSkillIndex, isSkillCovered } from '@/lib/scoring/skill-match';
import { flattenResumeText } from '@/lib/scoring/similarity';
import { jobPostingSchema, resumeDataSchema } from '@/lib/resume-schema';

const ENABLED = process.env.MEASURE_JEV === '1';

type CorpusEntry = {
  id: string;
  tier: string;
  idealScore: number;
  precomputedRoleFitSimilarity: number;
  jd: unknown;
  resume: unknown;
};

const corpus = JSON.parse(
  readFileSync(join(process.cwd(), 'tests/fixtures/ats-corpus.json'), 'utf8')
) as CorpusEntry[];

/** Does a hand-authored skill entry appear in this JD line (or vice versa)? */
function lineMatchesSkill(line: string, skill: string): boolean {
  const norm = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9+.#]+/g, ' ').trim();
  const l = norm(line);
  const s = norm(skill);
  if (!l || !s) return false;
  if (l === s) return true;
  if (l.includes(s) || s.includes(l)) return true;
  const tok = (x: string) => x.split(' ').filter((t) => t.length > 2);
  const a = tok(l);
  const b = tok(s);
  if (!a.length || !b.length) return false;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.every((t) => long.includes(t));
}

describe.skipIf(!ENABLED)('Jev corpus measurement', () => {
  it('measures', async () => {
    const started = Date.now();
    const measurements: Array<Record<string, unknown>> = [];

    for (const entry of corpus) {
      const jd = jobPostingSchema.parse(entry.jd);
      const resume = resumeDataSchema.parse(entry.resume);

      // 1. The production evaluation — exactly what the app calls.
      const [evaluation, contentEvaluation] = await Promise.all([
        evaluateJevRequirements(resume, jd),
        evaluateJevContentQuality(resume)
      ]);

      // 2. The classification measurement, over the JD's requirement
      //    LINES, validated against the hand-authored skill lists.
      const requirementLines = [
        ...(jd.requirements ?? []),
        ...(jd.niceToHaves ?? [])
      ]
        .map((l) => String(l).trim())
        .filter(Boolean);

      const state = [
        `Job title: ${jd.title}`,
        `Company: ${jd.company ?? ''}`,
        `Description: ${jd.description ?? ''}`,
        '',
        'Requirement lines:',
        ...requirementLines.map((l, i) => `${i + 1}. ${l}`)
      ].join('\n');

      const classified = await jevDecide({
        state,
        questions: Object.fromEntries(
          requirementLines.map((line, i) => [
            `line${i}`,
            {
              type: 'noul' as const,
              instructions:
                `Is "${line}" naming a specific skill, tool, technology, or technique ` +
                `that the candidate would use on the job? Answer no if it describes ` +
                `a degree, a certification, a number of years of experience, a ` +
                `management or soft skill, or a duty rather than a tool.`
            }
          ])
        )
      });

      const lineClassification = requirementLines.map((line, i) => ({
        line,
        pSkill: readNoul(classified, `line${i}`)
      }));

      // 3. The CONTROL. The token matcher decides "is this covered?" by
      //    testing whether the JD's wording appears in the resume. Jev
      //    decides it semantically. Comparing them shows whether Jev's
      //    answer is a real signal or a coin flip.
      //
      //    A candidate whose summary says "No Python exposure" is
      //    credited with Python by the token matcher, because the words
      //    are there. Jev says 0.30. That is the case the control
      //    exists to surface.
      const control: Array<{
        text: string;
        tokenSaysCovered: boolean;
        evidence: number | null;
      }> = [];
      for (const line of evaluation.lines) {
        const tokenSaysCovered = isSkillCovered(
          line.text,
          buildSkillIndex(flattenResumeText(resumeDataToScoreable(resume)).toLowerCase())
        );
        control.push({
          text: line.text,
          tokenSaysCovered,
          evidence: line.evidence
        });
      }

      // 4. The score, with and without the Jev evaluations.
      const sync = scoreResumeFromEnvelope(
        resume,
        jd,
        new Date('2026-09-20'),
        { roleFitSimilarity: entry.precomputedRoleFitSimilarity }
      );
      const withJev = scoreResumeFromEnvelope(
        resume,
        jd,
        new Date('2026-09-20'),
        { roleFitSimilarity: entry.precomputedRoleFitSimilarity },
        { evaluation },
        { evaluation: contentEvaluation }
      );

      measurements.push({
        id: entry.id,
        tier: entry.tier,
        idealScore: entry.idealScore,
        requirementLineClassification: lineClassification,
        lines: evaluation.lines,
        scorable: evaluation.scorable,
        requirements: evaluation.requirements,
        gates: evaluation.gates,
        control,
        bullets: contentEvaluation.bullets,
        syncOverall: sync.overallScore,
        jevOverall: withJev.overallScore,
        syncContentQuality: sync.dimensionScores.contentQuality,
        jevContentQuality: withJev.dimensionScores.contentQuality,
        syncIntentCoverage: sync.dimensionScores.intentCoverage,
        jevIntentCoverage: withJev.dimensionScores.intentCoverage,
        syncMissedMust: sync.intentCoverageBreakdown.missed.mustHave,
        jevMissedMust: withJev.intentCoverageBreakdown.missed.mustHave
      });

      console.log(
        `${entry.id}  sync ${sync.overallScore} → jev ${withJev.overallScore}  ` +
          `content ${sync.dimensionScores.contentQuality.toFixed(1)} → ` +
          `${withJev.dimensionScores.contentQuality.toFixed(1)}  ` +
          `intent ${sync.dimensionScores.intentCoverage.toFixed(1)} → ` +
          `${withJev.dimensionScores.intentCoverage.toFixed(1)}`
      );
    }

    // ── Aggregate ────────────────────────────────────────────────────────
    const positives: Array<{ pSkill: number | null }> = [];
    const negatives: Array<{ pSkill: number | null }> = [];
    for (const m of measurements) {
      const entry = corpus.find((e) => e.id === m.id)!;
      const jd = jobPostingSchema.parse(entry.jd);
      const truth = [
        ...(jd.mustHaveSkills ?? []),
        ...(jd.niceToHaveSkills ?? []),
        ...(jd.implicitSkills ?? [])
      ];
      for (const c of m.requirementLineClassification as Array<{
        line: string;
        pSkill: number | null;
      }>) {
        const isPositive = truth.some((s: string) =>
          lineMatchesSkill(c.line, s)
        );
        (isPositive ? positives : negatives).push(c);
      }
    }

    let auc = 0;
    for (const p of positives) {
      for (const n of negatives) {
        auc += (p.pSkill ?? 0) > (n.pSkill ?? 0) ? 1 : (p.pSkill ?? 0) === (n.pSkill ?? 0) ? 0.5 : 0;
      }
    }
    auc /= Math.max(1, positives.length * negatives.length);

    const mean = (a: number[]) =>
      a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
    const pearson = (xs: number[], ys: number[]) => {
      const n = xs.length;
      const mx = mean(xs);
      const my = mean(ys);
      let cov = 0;
      let vx = 0;
      let vy = 0;
      for (let i = 0; i < n; i++) {
        cov += (xs[i]! - mx) * (ys[i]! - my);
        vx += (xs[i]! - mx) ** 2;
        vy += (ys[i]! - my) ** 2;
      }
      return cov / Math.sqrt(vx * vy);
    };
    const mae = (a: number[], b: number[]) =>
      mean(a.map((v, i) => Math.abs(v - b[i]!)));

    const ideals = measurements.map((m) => m.idealScore as number);
    const syncScores = measurements.map((m) => m.syncOverall as number);
    const jevScores = measurements.map((m) => m.jevOverall as number);

    // The control: does Jev's evidence score separate what the token
    // matcher calls present from what it calls absent?
    const controlRows = measurements.flatMap(
      (m) => m.control as Array<{ text: string; tokenSaysCovered: boolean; evidence: number | null }>
    );
    const controlPresent = controlRows.filter((c) => c.tokenSaysCovered);
    const controlAbsent = controlRows.filter((c) => !c.tokenSaysCovered);
    let controlAgreement = 0;
    for (const c of controlRows) {
      if (c.evidence === null) continue;
      if ((c.evidence >= 0.5) === c.tokenSaysCovered) controlAgreement++;
    }

    const summary = {
      model: 'jev-1.14.0',
      measuredAt: new Date().toISOString(),
      corpusSize: measurements.length,
      linesClassified: positives.length + negatives.length,
      classificationInput:
        "the JD's requirement lines (non-circular against the hand-authored lists)",
      scoreInput:
        "the intent extractor's skill lists (what production stores)",
      meanPSkillForRealSkills: mean(positives.map((p) => p.pSkill ?? 0)),
      meanPSkillForNonSkills: mean(negatives.map((n) => n.pSkill ?? 0)),
      auc,
      control: {
        n: controlRows.length,
        meanEvidenceForTokenPresent: mean(
          controlPresent.map((c) => c.evidence ?? 0)
        ),
        meanEvidenceForTokenAbsent: mean(
          controlAbsent.map((c) => c.evidence ?? 0)
        ),
        agreement: controlRows.length
          ? controlAgreement / controlRows.length
          : 0
      },
      correlation: {
        sync: pearson(syncScores, ideals),
        jev: pearson(jevScores, ideals)
      },
      meanAbsoluteError: {
        sync: mae(syncScores, ideals),
        jev: mae(jevScores, ideals)
      },
      wallClockSeconds: (Date.now() - started) / 1000
    };

    console.log('\n=== JEV CORPUS MEASUREMENT ===');
    console.log(`lines classified        : ${summary.linesClassified}`);
    console.log(`mean P(skill) real/non  : ${summary.meanPSkillForRealSkills.toFixed(3)} / ${summary.meanPSkillForNonSkills.toFixed(3)}`);
    console.log(`AUC                     : ${summary.auc.toFixed(3)}`);
    console.log(
      `control  evidence present/absent: ${summary.control.meanEvidenceForTokenPresent.toFixed(3)} / ${summary.control.meanEvidenceForTokenAbsent.toFixed(3)}`
    );
    console.log(
      `control  agreement with the token test: ${(summary.control.agreement * 100).toFixed(1)}%`
    );
    console.log(`Pearson r  sync → jev   : ${summary.correlation.sync.toFixed(4)} → ${summary.correlation.jev.toFixed(4)}`);
    console.log(`MAE         sync → jev   : ${summary.meanAbsoluteError.sync.toFixed(2)} → ${summary.meanAbsoluteError.jev.toFixed(2)}`);
    console.log(`wall clock              : ${summary.wallClockSeconds.toFixed(1)}s`);

    mkdirSync(join(process.cwd(), 'tests/fixtures'), { recursive: true });
    writeFileSync(
      join(process.cwd(), 'tests/fixtures/jev-corpus-measurements.json'),
      JSON.stringify(
        {
          _comment:
            'Jev (typesafe-ai/jev) measurements over the 50-JD ATS validation corpus. ' +
            'Produced by scripts/measure-jev-corpus.cjs, which runs the REAL ' +
            'evaluateJevRequirements so the fixture can only describe what the app does. ' +
            'The offline claims live in tests/unit/scoring/jev-corpus.test.ts.',
          summary,
          measurements
        },
        null,
        2
      )
    );
    console.log('\nwrote tests/fixtures/jev-corpus-measurements.json');

    expect(summary.auc).toBeGreaterThan(0.9);
  }, 300_000);
});
