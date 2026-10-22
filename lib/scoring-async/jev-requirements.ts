import 'server-only';

import { resumeDataToScoreable } from '@/lib/scoring/score';
import { flattenJobText, flattenResumeText } from '@/lib/scoring/similarity';
import {
  EVIDENCE_RUBRIC,
  type JevRequirementEvaluation,
  type JevRequirementLine,
  type JevPriorityBucket
} from '@/lib/scoring/jev-requirements';
import type { JobPosting, ResumeData } from '@/lib/resume-schema';

import {
  assertZeroDataRetention,
  jevDecide,
  readNoul,
  readScore,
  type JevQuestion
} from '@/lib/ai/jev';

/**
 * Ask Jev three things about a JD's requirement entries:
 *
 * 1. **Is this a genuine skill?** — a specific tool, technology or
 *    technique the candidate would use on the job. This is the vocabulary
 *    the ATS keyword score is measured against.
 * 2. **Is this an eligibility gate?** — a degree, certification, work
 *    authorisation or years-of-experience threshold that the candidate
 *    cannot satisfy by adding content to their resume. These are not
 *    skill gaps and must not be penalised as one.
 * 3. **How strongly does the resume demonstrate it?** — on a 0–3
 *    evidence rubric, as a probability-weighted position.
 *
 * ## Why the evidence question is the important one
 *
 * The token matcher decides "is this skill covered?" by testing whether
 * the JD's words appear in the resume. That is wrong in both directions:
 *
 *   - **False negative.** A JD asking for `Postgres` and a resume
 *     saying `PostgreSQL` — the candidate HAS the skill, and is
 *     penalised 8 points and told to add a skill they already have.
 *     This is not hypothetical: it is what happened on a real resume in
 *     the dev database.
 *   - **False positive.** `go` inside `mongodb`.
 *
 * The skill-match module's own docstring says the right long-term answer
 * is "Jev-style semantic judging" and rejects a hand-rolled synonym map
 * as guesswork that silently invents matches. This module is that
 * answer.
 *
 * ## Two calls, and the second depends on the first
 *
 * The classification call is cheap and its answer decides which entries
 * need an evidence score. The evidence call needs the resume, so it
 * runs second. Both carry every question in one request, and Jev
 * evaluates questions in parallel, so latency barely moves with the
 * number of entries.
 *
 * ## Cost and latency
 *
 * Two calls, roughly 250ms each, a few thousand input tokens —
 * **$0.0002** per evaluation. The whole 50-JD validation sweep (150
 * calls) cost $0.0059.
 *
 * ## Failure
 *
 * A failed call does not throw. It returns an evaluation with
 * `ok: false`, and the caller falls back to the token-based signals. A
 * scoring path that fails because a decision model was unreachable would
 * be worse than the thing it improves.
 */
export async function evaluateJevRequirements(
  resume: ResumeData,
  job: JobPosting
): Promise<JevRequirementEvaluation> {
  // The requirement set is the INTENT EXTRACTOR's lists.
  //
  // That matters because of what production actually stores: the variant
  // editor saves the pasted JD into `jobContext.description` as raw
  // text, and `jobContext.requirements` / `niceToHaves` / `benefits` stay
  // EMPTY forever. The only structured requirement lists in production are
  // the ones the intent extractor fills in.
  //
  // The extractor's lists also carry the bug this work is here to fix: it
  // puts a "Bachelor's degree" requirement into `mustHaveSkills`, because
  // its prompt lists "Qualifications" as a must-have section header and
  // its schema has nowhere else to put a non-skill.
  const buckets: Record<JevPriorityBucket, string[]> = {
    must: (job.mustHaveSkills ?? []).map((l) => String(l).trim()).filter(Boolean),
    nice: (job.niceToHaveSkills ?? []).map((l) => String(l).trim()).filter(Boolean),
    implicit: (job.implicitSkills ?? []).map((l) => String(l).trim()).filter(Boolean)
  };

  // The flat list, in bucket order, with the bucket each entry came from.
  const entries: Array<{ text: string; bucket: JevPriorityBucket }> = [
    ...buckets.must.map((text) => ({ text, bucket: 'must' as const })),
    ...buckets.nice.map((text) => ({ text, bucket: 'nice' as const })),
    ...buckets.implicit.map((text) => ({ text, bucket: 'implicit' as const }))
  ];

  const empty: JevRequirementEvaluation = {
    lines: [],
    requirements: [],
    gates: [],
    scorable: { must: [], nice: [], implicit: [] },
    ok: false
  };

  if (entries.length === 0) return empty;

  const scoreable = resumeDataToScoreable(resume);
  const jobText = flattenJobText(job);
  const resumeText = flattenResumeText(scoreable);

  const jobState = [
    `Job title: ${job.title ?? ''}`,
    job.company ? `Company: ${job.company}` : '',
    job.description ? `Description: ${job.description}` : '',
    '',
    'Requirement entries:',
    ...entries.map((e, i) => `${i + 1}. ${e.text}`)
  ]
    .filter(Boolean)
    .join('\n');

  // ── Call 1 — classify each entry: skill? gate? ─────────────────────────
  const classifyQuestions: Record<string, JevQuestion> = {};
  entries.forEach((entry, i) => {
    classifyQuestions[`skill${i}`] = {
      type: 'noul',
      instructions:
        `Is "${entry.text}" naming a specific skill, tool, technology, or technique ` +
        `that the candidate would use on the job? Answer no if it describes ` +
        `a degree, a certification, a number of years of experience, a ` +
        `management or soft skill, or a duty rather than a tool.`
    };
    classifyQuestions[`gate${i}`] = {
      type: 'noul',
      instructions:
        `Is "${entry.text}" an eligibility gate — a degree, a certification, a ` +
        `licence, a work-authorisation or clearance requirement, or a ` +
        `minimum number of years of experience — that the candidate cannot ` +
        `satisfy by adding content to their resume? Answer no if it is a ` +
        `skill they could demonstrate, or a duty or soft skill they could ` +
        `show evidence of.`
    };
  });

  let classified: Awaited<ReturnType<typeof jevDecide>>;
  try {
    classified = await jevDecide({
      state: jobState,
      questions: classifyQuestions
    });
    assertZeroDataRetention(classified);
  } catch (err) {
    // A scoring path must not fail because a decision model was
    // unreachable. Fall back to the token-based signals.
    //
    // But it is logged: a silent fallback would mean every user quietly
    // gets the old (broken) score with nothing in the logs to say why.
    console.warn(
      `[jev] classification unavailable, keeping the token-based scores: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return empty;
  }

  const pSkills = entries.map((_, i) => readNoul(classified, `skill${i}`) ?? 0);
  const pGates = entries.map((_, i) => readNoul(classified, `gate${i}`) ?? 0);

  // ── Call 2 — how strongly does the resume demonstrate each entry? ──────
  //
  // Asked for EVERY entry, not just the skills: the intent-coverage
  // dimension needs to know whether a non-skill entry (a duty, a soft
  // skill) is demonstrated too, so it can be scored honestly rather than
  // being silently dropped.
  const evidenceState = [jobState, '', '=== RESUME ===', resumeText].join('\n');

  const evidenceQuestions: Record<string, JevQuestion> = {};
  entries.forEach((entry, i) => {
    evidenceQuestions[`ev${i}`] = {
      type: 'score',
      instructions: `How strongly does the resume demonstrate "${entry.text}"?`,
      criteria: [...EVIDENCE_RUBRIC]
    };
  });

  let evidenced: Awaited<ReturnType<typeof jevDecide>>;
  try {
    evidenced = await jevDecide({
      state: evidenceState,
      questions: evidenceQuestions
    });
    assertZeroDataRetention(evidenced);
  } catch (err) {
    console.warn(
      `[jev] evidence pass unavailable, keeping the token-based scores: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return empty;
  }

  const lines: JevRequirementLine[] = entries.map((entry, i) => ({
    text: entry.text,
    bucket: entry.bucket,
    pSkill: pSkills[i]!,
    pGate: pGates[i]!,
    evidence: readScore(evidenced, `ev${i}`)
  }));

  // The entries to score, per bucket: everything that is NOT a gate.
  //
  // A gate is excluded because the candidate cannot close the gap by
  // rewording a bullet — telling someone to add "5+ years of experience"
  // to their resume is not advice. A duty or a soft skill is NOT a gate:
  // the candidate CAN show evidence of it, so it stays scored and
  // "demonstrated" is decided by the evidence score.
  const scorable: JevRequirementEvaluation['scorable'] = {
    must: [],
    nice: [],
    implicit: []
  };
  for (const line of lines) {
    if (line.pGate >= 0.5) continue;
    scorable[line.bucket].push(line.text);
  }

  return {
    lines,
    // The genuine skill requirements, with their evidence depth. This is
    // the vocabulary the ATS keyword score is measured against.
    requirements: lines
      .filter((l) => l.pSkill >= 0.5 && l.evidence !== null)
      .map((l) => ({ text: l.text, evidence: l.evidence! })),
    gates: lines.filter((l) => l.pGate >= 0.5).map((l) => l.text),
    scorable,
    ok: true
  };
}
