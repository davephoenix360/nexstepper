/**
 * Measure what Jev (typesafe-ai/jev, via the Vercel AI Gateway) actually
 * does for the ATS scoring system — and what it does NOT need to do.
 *
 * This is the evidence behind `docs/plans/ats-scoring-v3-jev.md`. Every
 * number in that plan comes from a run of this script.
 *
 * ## What it measures
 *
 *   1. **Vocabulary curation.** For every requirement line in the 50-JD
 *      validation corpus, ask Jev the binary question "is this a specific
 *      skill / tool / technology?". Validate the resulting probabilities
 *      against the corpus's hand-authored `mustHaveSkills` /
 *      `niceToHaveSkills` / `implicitSkills` lists, and report AUC.
 *      This is the "which keywords are actually valid to score on"
 *      question.
 *
 *   2. **Evidence depth.** For the lines that ARE skills, score the
 *      resume's evidence on a 0-3 rubric (listed / mentioned /
 *      demonstrated-with-an-outcome) and compose a candidate ATS Matching
 *      dimension. The current dimension counts JD tokens; this one counts
 *      genuine skill coverage weighted by evidence.
 *
 *   3. **The control.** Ask the SAME "does the resume demonstrate X?"
 *      question about skills the token matcher says are PRESENT and about
 *      skills it says are MISSING. If Jev says "no" to everything the
 *      question is useless; this proves it discriminates, and measures how
 *      often the token matcher and Jev disagree.
 *
 * ## Why the corpus matters
 *
 * `tests/fixtures/ats-corpus.json` carries 50 (JD, resume, idealScore)
 * triples with hand-authored skill lists. The committed ATS validation
 * gate is Pearson r > 0.7 between the engine's score and `idealScore`
 * (docs/decisions/0005-ats-validation-corpus.md). The Pearson comparison
 * itself lives in `tests/unit/scoring/jev-corpus.test.ts`, which reads the
 * fixture this script writes — so the expensive network part is a script
 * and the claim is pinned by an offline test.
 *
 * ## Cost and latency
 *
 * One call per JD carries every question (Jev evaluates questions in
 * parallel, so latency barely moves with question count). At
 * $0.042/M input and free output, a full 50-JD sweep costs well under a
 * cent.
 *
 * Usage:
 *   node scripts/measure-jev-corpus.cjs
 */
require('dotenv').config({ path: '.env.local' });
const fs = require('node:fs');

const KEY = process.env.AI_GATEWAY_API_KEY;
if (!KEY) {
  console.error('AI_GATEWAY_API_KEY is not set (.env.local).');
  process.exit(1);
}

const GATEWAY_BASE = 'https://ai-gateway.vercel.sh/typesafe/v1/systemone';
const MODEL = 'jev-1.14.0';
const CORPUS_PATH = 'tests/fixtures/ats-corpus.json';
const OUT_PATH = 'tests/fixtures/jev-corpus-measurements.json';
const CONCURRENCY = 5;

/** The corpus JDs, scored by the current engine in the offline test. */
const corpus = JSON.parse(fs.readFileSync(CORPUS_PATH, 'utf8'));

async function jev(state, questions) {
  const res = await fetch(GATEWAY_BASE, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ model: MODEL, state, questions })
  });
  if (!res.ok) {
    throw new Error(
      `jev ${res.status}: ${(await res.text()).slice(0, 300)}`
    );
  }
  return res.json();
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker())
  );
  return out;
}

function flattenResume(resume) {
  const s = resume.sections ?? {};
  return [
    s.basics?.label ?? '',
    s.basics?.summary ?? '',
    ...(s.skills ?? []).flatMap((k) => [k.name, ...(k.keywords ?? [])]),
    ...(s.work ?? []).flatMap((w) => [
      w.description ?? '',
      ...(w.positions ?? []).flatMap((p) => [
        p.title ?? '',
        ...(p.highlights ?? [])
      ])
    ]),
    ...(s.projects ?? []).flatMap((p) => [
      p.name ?? '',
      p.description ?? '',
      ...(p.highlights ?? [])
    ])
  ]
    .filter(Boolean)
    .join('\n');
}

/** Mirrors `lib/scoring/skill-match.ts` closely enough for a survey. */
function matcherSaysCovered(skill, resumeText) {
  const s = String(skill).toLowerCase();
  if (resumeText.includes(s)) return true;
  const tokens = s.split(/[^a-z0-9]+/).filter((t) => t.length > 1);
  if (!tokens.length) return false;
  const resumeTokens = new Set(
    resumeText.split(/[^a-z0-9]+/).filter((t) => t.length > 1)
  );
  return tokens.some((t) => resumeTokens.has(t));
}

function normalise(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9+.#]+/g, ' ')
    .trim();
}

/** Does a hand-authored skill entry appear in this JD line (or vice versa)? */
function lineMatchesSkill(line, skill) {
  const l = normalise(line);
  const s = normalise(skill);
  if (!l || !s) return false;
  if (l === s) return true;
  if (l.includes(s) || s.includes(l)) return true;
  const tok = (x) => x.split(' ').filter((t) => t.length > 2);
  const a = tok(l);
  const b = tok(s);
  if (!a.length || !b.length) return false;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.every((t) => long.includes(t));
}

(async () => {
  const t0 = Date.now();
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  const measured = await mapLimit(corpus, CONCURRENCY, async (entry) => {
    const jd = entry.jd;
    const lines = [...(jd.requirements ?? []), ...(jd.niceToHaves ?? [])]
      .map((l) => String(l).trim())
      .filter(Boolean);

    const jdState = [
      `Job title: ${jd.title}`,
      `Company: ${jd.company ?? ''}`,
      `Description: ${jd.description ?? ''}`,
      '',
      'Requirement lines:',
      ...lines.map((l, i) => `${i + 1}. ${l}`)
    ].join('\n');
    const resumeText = flattenResume(entry.resume);

    // ── 1. vocabulary curation ────────────────────────────────────────
    const r1 = await jev(
      jdState,
      Object.fromEntries(
        lines.map((line, i) => [
          `line${i}`,
          {
            type: 'noul',
            instructions:
              `Is "${line}" naming a specific skill, tool, technology, or technique ` +
              `that the candidate would use on the job? Answer no if it describes ` +
              `a degree, a certification, a number of years of experience, a ` +
              `management or soft skill, or a duty rather than a tool.`
          }
        ])
      )
    );

    const classified = lines.map((line, i) => ({
      line,
      pSkill: r1.answers[`line${i}`]?.noul ?? null
    }));
    const skillLines = classified.filter((l) => (l.pSkill ?? 0) >= 0.5);

    // ── 2. evidence depth ──────────────────────────────────────────────
    let evidence = [];
    let r2 = null;
    if (skillLines.length) {
      r2 = await jev(
        `${jdState}\n\n=== RESUME ===\n${resumeText}`,
        Object.fromEntries(
          skillLines.map((l, i) => [
            `ev${i}`,
            {
              type: 'score',
              instructions: `How strongly does the resume demonstrate "${l.line}"?`,
              criteria: [
                'No mention at all',
                'Listed as a skill or keyword only',
                'Mentioned in a bullet or sentence',
                'Demonstrated with a concrete outcome or result'
              ]
            }
          ])
        )
      );
      evidence = skillLines.map((l, i) => ({
        line: l.line,
        pSkill: l.pSkill,
        evidence: r2.answers[`ev${i}`]?.score ?? 0,
        confidence: r2.provider_metadata?.typesafe?.confidence?.[`ev${i}`] ?? null
      }));
    }

    const coverage =
      skillLines.length === 0
        ? 0
        : evidence.filter((e) => e.evidence >= 1).length / skillLines.length;
    const depth =
      evidence.length === 0
        ? 0
        : evidence.reduce((a, e) => a + e.evidence, 0) / (evidence.length * 3);

    // ── 3. the control: present vs absent must-haves ───────────────────
    const mustHave = jd.mustHaveSkills ?? [];
    const resumeLower = resumeText.toLowerCase();
    const present = mustHave.filter((s) => matcherSaysCovered(s, resumeLower));
    const absent = mustHave.filter((s) => !matcherSaysCovered(s, resumeLower));

    const probeSkills = [
      ...present.slice(0, 20).map((s) => ({ skill: s, label: 'present' })),
      ...absent.slice(0, 20).map((s) => ({ skill: s, label: 'absent' }))
    ];

    let control = [];
    let r3 = null;
    if (probeSkills.length) {
      r3 = await jev(
        `${jdState}\n\n=== RESUME ===\n${resumeText}`,
        Object.fromEntries(
          probeSkills.map((it, i) => [
            `sk${i}`,
            {
              type: 'noul',
              instructions:
                `Does the resume demonstrate real working knowledge of ${it.skill}? ` +
                `Answer no if the resume neither mentions it nor shows closely related equivalent experience.`
            }
          ])
        )
      );
      control = probeSkills.map((it, i) => ({
        skill: it.skill,
        label: it.label,
        pDemonstrated: r3.answers[`sk${i}`]?.noul ?? null
      }));
    }

    for (const r of [r1, r2, r3]) {
      if (!r) continue;
      totalInputTokens += r.usage?.input_tokens ?? 0;
      totalOutputTokens += r.usage?.output_tokens ?? 0;
    }

    return {
      id: entry.id,
      tier: entry.tier,
      idealScore: entry.idealScore,
      lineCount: lines.length,
      classified,
      skillLineCount: skillLines.length,
      evidence,
      jevAtsMatching: 60 * coverage + 40 * depth,
      jevCoverage: coverage,
      jevDepth: depth,
      control
    };
  });

  // ── Aggregate ─────────────────────────────────────────────────────────
  const positives = [];
  const negatives = [];
  for (const m of measured) {
    const truth = [
      ...(corpus.find((e) => e.id === m.id)?.jd.mustHaveSkills ?? []),
      ...(corpus.find((e) => e.id === m.id)?.jd.niceToHaveSkills ?? []),
      ...(corpus.find((e) => e.id === m.id)?.jd.implicitSkills ?? [])
    ];
    for (const c of m.classified) {
      const isPositive = truth.some((s) => lineMatchesSkill(c.line, s));
      (isPositive ? positives : negatives).push({ ...c, isPositive });
    }
  }

  let auc = 0;
  for (const p of positives) {
    for (const n of negatives) {
      auc += p.pSkill > n.pSkill ? 1 : p.pSkill === n.pSkill ? 0.5 : 0;
    }
  }
  auc /= positives.length * negatives.length;

  const control = measured.flatMap((m) => m.control);
  const controlPresent = control.filter((c) => c.label === 'present');
  const controlAbsent = control.filter((c) => c.label === 'absent');
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  let agree = 0;
  for (const c of control) {
    if ((c.pDemonstrated >= 0.5) === (c.label === 'present')) agree++;
  }

  const summary = {
    model: MODEL,
    measuredAt: new Date().toISOString(),
    corpusSize: measured.length,
    linesClassified: positives.length + negatives.length,
    skillLineRate: (skillLinesTotal(measured) / (positives.length + negatives.length)),
    meanPSkillForRealSkills: mean(positives.map((p) => p.pSkill)),
    meanPSkillForNonSkills: mean(negatives.map((n) => n.pSkill)),
    auc,
    control: {
      n: control.length,
      meanPDemonstratedForPresent: mean(controlPresent.map((c) => c.pDemonstrated)),
      meanPDemonstratedForAbsent: mean(controlAbsent.map((c) => c.pDemonstrated)),
      agreement: agree / control.length
    },
    usage: {
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      estimatedCostUsd: totalInputTokens * 0.000000042,
      wallClockSeconds: (Date.now() - t0) / 1000
    }
  };

  console.log('\n=== JEV CORPUS MEASUREMENT ===');
  console.log(`lines classified      : ${summary.linesClassified}`);
  console.log(`classified as skill   : ${(summary.skillLineRate * 100).toFixed(1)}%`);
  console.log(`mean P(skill) real    : ${summary.meanPSkillForRealSkills.toFixed(3)}`);
  console.log(`mean P(skill) non     : ${summary.meanPSkillForNonSkills.toFixed(3)}`);
  console.log(`AUC                   : ${summary.auc.toFixed(3)}`);
  console.log(`\ncontrol: mean P(demonstrated) present = ${summary.control.meanPDemonstratedForPresent.toFixed(3)}`);
  console.log(`         mean P(demonstrated) absent  = ${summary.control.meanPDemonstratedForAbsent.toFixed(3)}`);
  console.log(`         agreement with token matcher = ${(summary.control.agreement * 100).toFixed(1)}%`);
  console.log(`\nusage: ${summary.usage.inputTokens} input tokens, ${summary.usage.outputTokens} output tokens`);
  console.log(`estimated cost: $${summary.usage.estimatedCostUsd.toFixed(6)}`);
  console.log(`wall clock: ${summary.usage.wallClockSeconds.toFixed(1)}s`);

  fs.writeFileSync(
    OUT_PATH,
    JSON.stringify(
      {
        _comment:
          'Jev (typesafe-ai/jev) measurements over the 50-JD ATS validation corpus. ' +
          'Produced by scripts/measure-jev-corpus.cjs. The Pearson comparison against ' +
          'the current engine lives in tests/unit/scoring/jev-corpus.test.ts and reads ' +
          'this file, so the claim is pinned by an offline test.',
        summary,
        measurements: measured
      },
      null,
      2
    )
  );
  console.log(`\nwrote ${OUT_PATH}`);
})().catch((e) => {
  console.error(String(e).slice(0, 900));
  process.exitCode = 1;
});

function skillLinesTotal(measured) {
  return measured.reduce((a, m) => a + m.skillLineCount, 0);
}
