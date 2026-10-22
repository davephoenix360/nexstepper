import 'server-only';

import { headers } from 'next/headers';
import { auth } from '@/lib/auth';

/**
 * `getAtsScore` — read the CURRENT ATS score for the resume this chat is
 * attached to.
 *
 * ## Why the agent needs this
 *
 * The chat route already puts a score in the system prompt — but it is
 * computed ONCE, at request time, from the resume as it was BEFORE this
 * turn's edits. So after the agent edits the resume, the number it was
 * given is stale, and it has no way to check whether its own edit
 * actually helped.
 *
 * That is the gap this closes: edit → measure → report the delta. It is
 * the difference between the agent guessing at an improvement and
 * verifying one.
 *
 * ## It is free
 *
 * The ATS engine makes zero AI Gateway calls — `lib/scoring/` is pure
 * TypeScript with a build-time purity test, and the semantic half of the
 * hybrid path runs a local ONNX model rather than a hosted one. So this
 * tool costs nothing in tokens and needs no Pro gating.
 *
 * ## Why the hybrid path, and the fallback
 *
 * The scorecard the user is looking at is computed with the HYBRID
 * scorer (BM25 + semantic embeddings). The chat prompt uses the cheap
 * sync scorer, because the hybrid path pays a ~2-5s cold start for the
 * ONNX model on a cold lambda and the prompt is rebuilt on every turn.
 *
 * The tool uses the HYBRID path, because the number the agent quotes has
 * to match the number on the user's screen — a mismatch there is a trust
 * problem, and the tool is called rarely enough that the cold start does
 * not matter. If the hybrid path fails (model download blocked, ONNX
 * unavailable, timeout) it falls back to the sync scorer so the agent
 * always gets a number rather than an error.
 */

const SYNC_TIMEOUT_MS = 15_000;

export async function executeGetAtsScore(
  resumeId: string
): Promise<{ ok: true; result: string } | { ok: false; error: string }> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return { ok: false, error: 'Not authenticated' };

  const userId = session.user.id;

  const { getResume } = await import('@/lib/db/queries');
  const existing = await getResume(resumeId, userId);
  if (!existing) return { ok: false, error: 'Resume not found or not owned' };

  const { resume, data } = existing;

  if (resume.isMaster) {
    return {
      ok: false,
      error:
        'This is a master resume. ATS scoring only applies to variants, because it measures a resume against a specific job description.'
    };
  }

  if (!data.jobContext) {
    return {
      ok: false,
      error:
        'No job description is attached to this variant, so there is nothing to score it against. Ask the user to paste a job description first.'
    };
  }

  let breakdown: import('@/lib/scoring/score').ScoreBreakdown | null = null;
  let usedHybrid = false;

  try {
    const { scoreResumeHybridFromEnvelope } = await import(
      '@/lib/scoring-async/score-hybrid'
    );
    breakdown = await Promise.race([
      scoreResumeHybridFromEnvelope(data, data.jobContext),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error('hybrid scoring timed out')),
          SYNC_TIMEOUT_MS
        )
      )
    ]);
    usedHybrid = true;
  } catch {
    // Fall back to the pure sync scorer. It is less accurate (BM25 only,
    // no semantic paraphrase matching) but it always works and it is what
    // the system prompt used, so the model can still compare before and
    // after consistently.
    const { scoreResumeFromEnvelope } = await import('@/lib/scoring');
    breakdown = scoreResumeFromEnvelope(data, data.jobContext, new Date());
  }

  if (!breakdown) {
    return { ok: false, error: 'Could not compute a score for this resume.' };
  }

  // Persist a snapshot so the scorecard reflects reality after an agent
  // edit. Only for the hybrid path — writing a BM25-only score into the
  // snapshot history would make the scorecard jump to a different number
  // than the one the user sees when they hit Recompute themselves.
  if (usedHybrid) {
    try {
      const { buildDynamicTips } = await import('@/lib/scoring/tips');
      const { buildMatchBreakdown } = await import('@/lib/inline-issue/build-match-breakdown');
      const { recordScoreSnapshot } = await import('@/lib/db/queries');
      const tips = buildDynamicTips(breakdown, data, data.jobContext);
      await recordScoreSnapshot(resumeId, userId, {
        matchScore: breakdown.overallScore,
        matchBreakdown: buildMatchBreakdown(breakdown),
        dynamicTips: tips,
        computedInMs: breakdown.computedInMs
      });
    } catch {
      // A failed snapshot write must not fail the tool — the score is
      // still valid and still worth reporting.
    }
  }

  return { ok: true, result: formatScoreForModel(breakdown, usedHybrid) };
}

/**
 * Render the breakdown as compact text the model can act on.
 *
 * Text rather than raw JSON because the model reads this far better as
 * prose+lines, and because it keeps the token cost of the tool result
 * down — tool results are fed back into the conversation.
 */
function formatScoreForModel(
  breakdown: import('@/lib/scoring/score').ScoreBreakdown,
  usedHybrid: boolean
): string {
  const dim = breakdown.dimensionScores;
  const ic = breakdown.intentCoverageBreakdown;

  const dims: Array<[string, number]> = [
    ['atsMatching', dim.atsMatching],
    ['structure', dim.structure],
    ['contentQuality', dim.contentQuality],
    ['alignment', dim.alignment],
    ['intentCoverage', dim.intentCoverage],
    ['roleFit', dim.roleFit],
    ['seniorityFit', dim.seniorityFit]
  ];

  const dimLines = [...dims]
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `  ${k}: ${Math.round(v)}`)
    .join('\n');

  const missed = ic.missed.mustHave ?? [];
  const missedNice = ic.missed.niceToHave ?? [];
  const missedLines = [
    missed.length ? `  MUST-HAVE missing: ${missed.slice(0, 12).join(', ')}` : '',
    missedNice.length ? `  nice-to-have missing: ${missedNice.slice(0, 10).join(', ')}` : ''
  ].filter(Boolean);

  const weakest = [...dims].sort((a, b) => a[1] - b[1])[0];

  return `Overall ATS match: ${breakdown.overallScore} / 100

Dimension scores (strongest first):
${dimLines}

${missedLines.length ? 'Missing skills:\n' + missedLines.join('\n') : 'Missing skills: none reported'}

Weakest dimension: ${weakest[0]} (${Math.round(weakest[1])}). Fixing that one is worth more than polishing a stronger one.
${
  usedHybrid
    ? ''
    : '\n(Note: semantic scoring was unavailable, so this is the keyword-only score. It may differ slightly from the scorecard.)'
}`;
}
