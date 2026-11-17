/**
 * The `getAtsScore` tool's output — rendered as plain text for the model.
 *
 * ## Why this lives outside the tool
 *
 * The tool itself is server-only (it reads the session, the resume and
 * the database), which makes it awkward to assert on. The RENDERING is
 * pure: given a breakdown it is the same string every time. So the
 * renderer lives here, and the tool calls it.
 *
 * That matters because this output is the agent's SECOND look at the
 * score — the system prompt carries the first. If the two formats
 * disagree, the agent reads two different stories about the same
 * resume: the prompt says one thing happened, the tool says another.
 * One renderer, one shape.
 *
 * ## What the model gets
 *
 *   - the overall score and the seven dimension scores,
 *   - the sub-criterion scores (the fine-grained parts behind each
 *     dimension) and which one is weakest,
 *   - the missing skills and the eligibility requirements (kept apart,
 *     because an eligibility requirement is not a skill gap),
 *   - the scorecard's own advice, so the agent quotes it instead of
 *     improvising, and
 *   - which dimension to fix first, by recoverable points.
 */
import type { ScoreBreakdown } from '@/lib/scoring/score';
import { biggestRecoverableWin } from '@/lib/scoring/priority';
import { criteriaTextForModel } from './ats-criteria-text';

/**
 * Render the breakdown as compact text the model can act on.
 *
 * Text rather than raw JSON because the model reads this far better as
 * prose+lines, and because it keeps the token cost of the tool result
 * down — tool results are fed back into the conversation.
 *
 * `tips` are the scorecard's own dynamic tips, rendered as plain text.
 * They are the concrete advice ("10 of 29 work bullets describe a task
 * rather than an outcome (…named bullets…)") — without them the model
 * sees only the dimension numbers and improvises, which is how the chat
 * ended up with vaguer advice than the scorecard beside it.
 */
export function formatScoreForModel(
  breakdown: ScoreBreakdown,
  usedHybrid: boolean,
  tips?: Record<string, string>
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

  // The concrete advice, as plain text — the same words the scorecard
  // is showing the candidate right now.
  const adviceEntries = Object.entries(tips ?? {});
  const adviceSection = adviceEntries.length
    ? '\n\nWhat to fix (same advice the scorecard shows — quote it, do not improvise):\n' +
      adviceEntries.map(([criterion, text]) => `  • ${criterion}: ${text}`).join('\n')
    : '';

  // Which dimension to fix first — recoverable points, not the raw
  // score. The scorecard's "Start here" line uses the same measure, so
  // the agent and the scorecard point at the same bar.
  const topWin = biggestRecoverableWin(breakdown.dimensionScores, {
    useV2Weights: !breakdown.intentCoverageBreakdown?.fallback
  });
  const startHere = topWin
    ? `\n\nStart here: ${topWin.label} is at ${Math.round(topWin.score)}/100 and carries ` +
      `${Math.round(topWin.weight * 100)}% of the overall score — worth up to ` +
      `${topWin.points.toFixed(1)} points. Recommend this one first.`
    : '';

  // The sub-criterion scores — the fine-grained parts behind each
  // dimension bar.
  //
  // The agent calls this tool to MEASURE ITS OWN EDITS. Seeing only
  // the dimension numbers, it could tell whether the score moved but
  // not which part of the score moved — so it would report "it went
  // up" and then improvise what to do next. The criteria scores are
  // keyed the same way the advice is, so the agent can say which
  // part improved and quote the advice for the part that did not.
  const criteriaText = criteriaTextForModel(breakdown);
  const criteriaSection = criteriaText ? `\n\n${criteriaText}` : '';

  // Eligibility requirements are not skill gaps — they get their own
  // block so the assistant can say something useful about them instead
  // of reporting "missing: Bachelor's degree".
  const eligibility = breakdown.eligibility ?? [];
  const eligibilityLines = eligibility.map(
    (note) =>
      `  ${note.requirement.text} — ${note.status}` +
      (note.completesOn ? ` (completes ${note.completesOn})` : '') +
      (note.message ? ` — ${note.message}` : '')
  );

  return `Overall ATS match: ${breakdown.overallScore} / 100

Dimension scores (strongest first):
${dimLines}${criteriaSection}

${missedLines.length ? 'Missing skills:\n' + missedLines.join('\n') : 'Missing skills: none reported'}${
    eligibilityLines.length
      ? '\n\nEligibility requirements (not skill gaps — do not tell the user to add these to their resume):\n' +
        eligibilityLines.join('\n')
      : ''
  }${adviceSection}${startHere}

Weakest dimension: ${weakest[0]} (${Math.round(weakest[1])}). Fixing that one is worth more than polishing a stronger one.
${
  usedHybrid
    ? ''
    : '\n(Note: semantic scoring was unavailable, so this is the keyword-only score. It may differ slightly from the scorecard.)'
}`;
}
