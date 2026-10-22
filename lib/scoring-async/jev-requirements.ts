import 'server-only';

import { resumeDataToScoreable } from '@/lib/scoring/score';
import { flattenJobText, flattenResumeText } from '@/lib/scoring/similarity';
import {
  EVIDENCE_RUBRIC,
  type JevRequirementEvaluation
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
 * Ask Jev which of a JD's requirement lines are genuine skills, and how
 * strongly the resume demonstrates each one.
 *
 * ## Two calls, because the second depends on the first
 *
 * 1. **Classify** — one binary question per JD requirement line: "is this
 *    naming a specific skill, tool, technology or technique that the
 *    candidate would use on the job?"
 * 2. **Evidence** — one rubric question per line that classified as a
 *    skill: "how strongly does the resume demonstrate this?"
 *
 * The binary question is deliberately BINARY. The first attempt used a
 * five-way choice (skill / qualification / responsibility / preference /
 * boilerplate) and it collapsed: Jev put plain tool names like "AWS",
 * "Kafka" and "Terraform" into the `qualification` bucket, with
 * confidence around 0.44 across the board. A forced choice with no
 * escape hatch always lands somewhere. A probability does not have that
 * failure mode.
 *
 * ## Cost and latency
 *
 * Two calls, roughly 200ms each, about 3,000 input tokens in total —
 * **$0.00013** per evaluation. The whole 50-JD validation sweep (150
 * calls) cost $0.0058.
 *
 * ## Failure
 *
 * A failed call does not throw. It returns an evaluation with
 * `ok: false`, and the caller falls back to the token-based ATS Keyword
 * Match. A scoring path that fails because a decision model was
 * unreachable would be worse than the thing it improves.
 */
export async function evaluateJevRequirements(
  resume: ResumeData,
  job: JobPosting
): Promise<JevRequirementEvaluation> {
  // The requirement set is the INTENT EXTRACTOR's skill lists, not the
  // JD's raw text.
  //
  // That matters because of what production actually stores: the variant
  // editor saves the pasted JD into `jobContext.description` as raw text,
  // and `jobContext.requirements` / `niceToHaves` / `benefits` stay
  // EMPTY forever. The only structured requirement lists in production are
  // `mustHaveSkills` and `niceToHaveSkills`, which the intent extractor
  // fills in. Feeding Jev the raw JD text instead would mean asking it
  // to classify prose, and feeding it `job.requirements` would mean
  // asking it to classify an array that is always empty.
  //
  // The extractor's lists also carry the bug this work is here to fix: it
  // puts a "Bachelor's degree" requirement into `mustHaveSkills`, because
  // its prompt lists "Qualifications" as a must-have section header and
  // its schema has nowhere else to put a non-skill. Jev separates those
  // out.
  const lines = [
    ...(job.mustHaveSkills ?? []),
    ...(job.niceToHaveSkills ?? [])
  ]
    .map((l) => String(l).trim())
    .filter((l) => l.length > 0);

  const empty: JevRequirementEvaluation = {
    lines: [],
    requirements: [],
    gates: [],
    ok: false
  };

  if (lines.length === 0) return empty;

  const scoreable = resumeDataToScoreable(resume);
  const jobText = flattenJobText(job);
  const resumeText = flattenResumeText(scoreable);

  const jobState = [
    `Job title: ${job.title ?? ''}`,
    job.company ? `Company: ${job.company}` : '',
    job.description ? `Description: ${job.description}` : '',
    '',
    'Requirement lines:',
    ...lines.map((line, i) => `${i + 1}. ${line}`)
  ]
    .filter(Boolean)
    .join('\n');

  // ── Call 1 — classify each line ───────────────────────────────────────
  const classifyQuestions: Record<string, JevQuestion> = {};
  lines.forEach((line, i) => {
    classifyQuestions[`line${i}`] = {
      type: 'noul',
      instructions:
        `Is "${line}" naming a specific skill, tool, technology, or technique ` +
        `that the candidate would use on the job? Answer no if it describes ` +
        `a degree, a certification, a number of years of experience, a ` +
        `management or soft skill, or a duty rather than a tool.`
    };
  });

  let classified: Awaited<ReturnType<typeof jevDecide>>;
  try {
    classified = await jevDecide({ state: jobState, questions: classifyQuestions });
    assertZeroDataRetention(classified);
  } catch (err) {
    // A scoring path must not fail because a decision model was
    // unreachable. Fall back to the token-based signal.
    //
    // But it is logged: a silent fallback would mean every user quietly
    // gets the old (broken) keyword score with nothing in the logs to
    // say why. If the provider pin ever stops working, this line is
    // where it shows up.
    console.warn(
      `[jev] classification unavailable, keeping the token-based keyword score: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return empty;
  }

  const pSkills = lines.map((_, i) => readNoul(classified, `line${i}`) ?? 0);
  const skillIndexes = pSkills
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p >= 0.5)
    .map(({ i }) => i);

  if (skillIndexes.length === 0) {
    // No genuine skills found. That is a legitimate answer (the JD may
    // state only qualifications), but there is nothing to score on, so
    // the caller keeps the token-based signal.
    return {
      lines: lines.map((text, i) => ({
        text,
        pSkill: pSkills[i]!,
        isGate: pSkills[i]! < 0.5,
        evidence: null
      })),
      requirements: [],
      gates: lines,
      ok: false
    };
  }

  // ── Call 2 — how strongly does the resume demonstrate each skill? ─────
  const evidenceState = [
    jobState,
    '',
    '=== RESUME ===',
    resumeText
  ].join('\n');

  const evidenceQuestions: Record<string, JevQuestion> = {};
  skillIndexes.forEach((lineIndex, i) => {
    evidenceQuestions[`ev${i}`] = {
      type: 'score',
      instructions: `How strongly does the resume demonstrate "${lines[lineIndex]}"?`,
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
    // The classification is still usable even if the evidence pass
    // failed — but without evidence there is no depth signal, so the
    // caller falls back rather than scoring on half the signal.
    console.warn(
      `[jev] evidence pass unavailable, keeping the token-based keyword score: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return empty;
  }

  const evidenceByIndex = new Map<number, number>();
  skillIndexes.forEach((lineIndex, i) => {
    const score = readScore(evidenced, `ev${i}`);
    if (score !== null) evidenceByIndex.set(lineIndex, score);
  });

  const evaluatedLines = lines.map((text, i) => ({
    text,
    pSkill: pSkills[i]!,
    isGate: pSkills[i]! < 0.5,
    evidence: evidenceByIndex.get(i) ?? null
  }));

  return {
    lines: evaluatedLines,
    requirements: evaluatedLines
      .filter((l) => !l.isGate && l.evidence !== null)
      .map((l) => ({ text: l.text, evidence: l.evidence! })),
    gates: evaluatedLines.filter((l) => l.isGate).map((l) => l.text),
    ok: true
  };
}
