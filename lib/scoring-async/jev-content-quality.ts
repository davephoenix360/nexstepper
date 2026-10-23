import 'server-only';

import { resumeDataToScoreable } from '@/lib/scoring/score';
import type {
  JevBulletEvaluation,
  JevContentQualityEvaluation
} from '@/lib/scoring/jev-content-quality';
import { flattenResumeText } from '@/lib/scoring/similarity';
import type { ResumeData } from '@/lib/resume-schema';

import {
  assertZeroDataRetention,
  jevDecide,
  readScore,
  type JevQuestion
} from '@/lib/ai/jev';

/**
 * Judge each work bullet semantically instead of lexically.
 *
 * ## What the dimension used to do
 *
 * `lib/scoring/dimensions/content-quality.ts` measured two things with
 * string operations:
 *
 *   1. `accomplishmentRatio` — does the bullet contain a DIGIT?
 *   2. `actionVerbUsage` — does the bullet start with a verb from our
 *      ACTION_VERBS list?
 *
 * Both are proxies, and both proxies leak:
 *
 *   - **The digit test is unfair across fields.** "Reduced API latency
 *     by 40%" has a number. "Established a patient-support triage
 *     protocol that cut wait times" does not — but it is a stronger
 *     bullet. A candidate in a role where numbers are not the currency
 *     is marked down for writing well. The dimension's own docstring
 *     flags this: *"quantifying impact is genuinely unevenly available
 *     across fields, so this sub-criterion scores honest candidates in
 *     less numerate roles lower. It is weighted 0.21 — more than Intent
 *     Coverage (0.10), which is the dimension that actually measures JD
 *     match."*
 *
 *   - **The action-verb list is a lexicon.** "Architected" is not in
 *     `ACTION_VERBS`, so a bullet starting with it counts as NEITHER
 *     strong nor weak — it just doesn't earn the point. The question
 *     the criterion is really asking is semantic, and can be asked
 *     semantically.
 *
 * ## Why a rubric and not a yes/no question
 *
 * A binary question was tried first: *"does this bullet describe an
 * accomplishment with a result?"* That is true of almost every bullet a
 * candidate bothered to write — the dimension scored 91/100 for
 * everybody, stopped discriminating, and pushed the overall score 15
 * points above the hand-labelled ideal.
 *
 * A rubric spreads the answers across the range, which is what a
 * dimension needs to do. "Built a thing" and "built a thing that cut
 * wait times" are different, and only a scale can tell them apart.
 *
 * ## Cost and latency
 *
 * This dimension does not depend on the JD, so the state is the resume
 * alone — smaller than the requirement-evaluation state. The questions
 * are evaluated in parallel, and the state is billed once, so the
 * marginal cost of a question is its own text.
 *
 * ## Failure
 *
 * A failed call is not an error: the evaluation comes back `ok: false`
 * and the caller keeps the lexical score.
 */

/**
 * The most bullets we will judge.
 *
 * Two questions per bullet, and a pathological resume could otherwise
 * produce a request the model will not answer well. Past the cap the
 * evaluation declines and the caller falls back to the lexical score,
 * which is the right trade — a slightly worse measurement is better
 * than a wrong one.
 */
export const MAX_JUDGED_BULLETS = 60;

/**
 * How much impact does this bullet claim?
 *
 * Level 0 is a duty. Level 3 is a specific outcome. The middle levels
 * are where most real bullets live, which is the point: "built a thing"
 * and "built a thing that cut wait times" are different, and a binary
 * question could not tell them apart.
 */
export const IMPACT_RUBRIC = [
  'States a duty, responsibility or routine task, with no result',
  'States an activity with a vague or implied result',
  'States a clear accomplishment with a result or effect',
  'States a specific accomplishment with a measurable outcome'
] as const;

/**
 * How strongly does this bullet open?
 *
 * The lexical version asked "does the first word appear in our
 * ACTION_VERBS list?", which does not know "Architected" and so scored
 * it as neither strong nor weak. This asks the question the criterion
 * actually means.
 *
 * The first version of this rubric was too generous — it put almost
 * every bullet at level 2 ("opens with a strong active verb"), because
 * "Owned" and "Authored" ARE strong active verbs, even when what
 * follows is a routine task. The levels below are ordered by how much
 * the opening tells a reader, which is what separates them.
 */
export const OPENING_RUBRIC = [
  'Opens passively, with a noun phrase, or with a weak generic action such as helped with, worked on, responsible for, involved in, or participated in',
  'Opens with a plain active verb naming the activity, with no particular scope',
  'Opens with a strong active verb naming a specific accomplishment, with a concrete scope',
  'Opens with a strong active verb and a specific result or a named, non-trivial scope'
] as const;

/**
 * Collect the work bullets, in the same order and with the same filter
 * as `content-quality.ts` — so the two lists line up index for index.
 */
export function collectWorkHighlights(
  resume: Parameters<typeof flattenResumeText>[0]
): string[] {
  const out: string[] = [];
  for (const job of resume.work) {
    for (const pos of job.positions) {
      if (pos.highlights) out.push(...pos.highlights);
    }
  }
  return out.filter((h) => typeof h === 'string' && h.trim().length > 0);
}

export async function evaluateJevContentQuality(
  resume: ResumeData
): Promise<JevContentQualityEvaluation> {
  const scoreable = resumeDataToScoreable(resume);
  const bullets = collectWorkHighlights(scoreable);

  if (bullets.length === 0) {
    return { bullets: [], ok: false };
  }
  if (bullets.length > MAX_JUDGED_BULLETS) {
    return { bullets: [], ok: false };
  }

  const state = [
    '=== RESUME WORK BULLETS ===',
    ...bullets.map((b, i) => `${i + 1}. ${b}`)
  ].join('\n');

  const questions: Record<string, JevQuestion> = {};
  bullets.forEach((bullet, i) => {
    questions[`impact${i}`] = {
      type: 'score',
      instructions: `How much impact does this work bullet claim?\nBullet: "${bullet}"`,
      criteria: [...IMPACT_RUBRIC]
    };
    questions[`opening${i}`] = {
      type: 'score',
      instructions: `How strongly does this work bullet open?\nBullet: "${bullet}"`,
      criteria: [...OPENING_RUBRIC]
    };
  });

  try {
    const result = await jevDecide({ state, questions });
    assertZeroDataRetention(result);

    const judged: JevBulletEvaluation[] = bullets.map((text, i) => ({
      text,
      impact: readScore(result, `impact${i}`) ?? 0,
      opening: readScore(result, `opening${i}`) ?? 0
    }));

    return { bullets: judged, ok: true };
  } catch (err) {
    console.warn(
      `[jev] content-quality evaluation unavailable, keeping the lexical score: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return { bullets: [], ok: false };
  }
}
