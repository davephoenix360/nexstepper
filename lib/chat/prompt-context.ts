/**
 * The pure parts of the chat prompt: the resume snapshot and the ATS
 * score block.
 *
 * ## Why these live apart from `system-prompt.ts`
 *
 * `system-prompt.ts` also builds the template catalogue, and that
 * pulls the resume TEMPLATE COMPONENTS in — React components that a
 * plain Node script cannot load (the `react-server` condition swaps
 * React for the server build, where `createContext` does not exist).
 *
 * Everything in THIS module is pure text: no React, no IO, no
 * `server-only` marker. So a probe script can build the exact same
 * ATS block the model receives, and assert on it, without a bundler.
 *
 * `system-prompt.ts` re-exports both builders, so every existing
 * import path keeps working.
 */
import type { ResumeData } from '@/lib/resume-schema';
import type { ScoreBreakdown } from '@/lib/scoring/score';
import type { RenderedBreakdownSource } from '@/lib/scoring/snapshot-breakdown';
import { buildDynamicTips } from '@/lib/scoring/tips';
import { tipsToPlainText } from '@/lib/scoring/tips-text';
import { biggestRecoverableWin } from '@/lib/scoring/priority';
import { criteriaTextForModel } from './ats-criteria-text';

/**
 * Extract a profile URL from the basics.profiles array by network name.
 */
function getProfileUrl(
  profiles: ResumeData['sections']['basics']['profiles'],
  network: string
): string | null {
  const entry = profiles?.find((p) => p.network.toLowerCase() === network.toLowerCase());
  return entry?.url ?? null;
}

/**
 * Flatten a location object into a readable string.
 */
function formatLocation(loc: ResumeData['sections']['basics']['location']): string {
  if (!loc) return '(none)';
  const parts = [loc.city, loc.region, loc.countryCode].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : '(none)';
}

/**
 * Build a plain-text snapshot of the current resume state.
 * Injected as context into every chat turn so the model sees the
 * current data without us having to pass the full JSONB blob
 * over the wire.
 */
export function buildResumeContext(data: ResumeData): string {
  const sections = data.sections;
  const basics = sections?.basics;
  const parts: string[] = [];

  parts.push('=== RESUME DATA ===');
  parts.push(`Name: ${basics?.name ?? data.name ?? '(none)'}`);
  // label is the headline/headline equivalent
  parts.push(`Headline: ${basics?.label ?? '(none)'}`);
  parts.push(`Email: ${basics?.email ?? '(none)'}`);
  parts.push(`Location: ${formatLocation(basics?.location)}`);
  parts.push(`Phone: ${basics?.phone ?? '(none)'}`);
  parts.push(`Website: ${basics?.url ?? '(none)'}`);
  parts.push(`LinkedIn: ${getProfileUrl(basics?.profiles, 'linkedin') ?? '(none)'}`);
  parts.push(`GitHub: ${getProfileUrl(basics?.profiles, 'github') ?? '(none)'}`);
  parts.push(`Summary: ${basics?.summary ?? '(none)'}`);
  parts.push('');

  // sections.work uses nested positions (one entry per company)
  if (sections?.work?.length) {
    parts.push('--- EXPERIENCE ---');
    for (const job of sections.work) {
      for (const pos of job.positions ?? []) {
        parts.push(
          `[${job.company}${job.location ? `, ${job.location}` : ''}] ${pos.title}`
        );
        parts.push(`${pos.startDate ?? ''} → ${pos.endDate || 'Present'}`);
        if (pos.highlights?.length) {
          for (const h of pos.highlights) parts.push(`  • ${h}`);
        }
      }
      parts.push('');
    }
  }

  if (sections?.education?.length) {
    parts.push('--- EDUCATION ---');
    for (const edu of sections.education) {
      const dl = edu.degree?.degreeLevel ?? '';
      const majors = edu.degree?.majors?.length ? `, ${edu.degree.majors.join(', ')}` : '';
      parts.push(`[${edu.institution}] ${dl}${majors}`);
      parts.push(`${edu.startDate ?? ''}${edu.endDate ? ` → ${edu.endDate}` : ''}`);
      if (edu.gpa) parts.push(`GPA: ${edu.gpa}`);
      parts.push('');
    }
  }

  if (sections?.skills?.length) {
    parts.push('--- SKILLS ---');
    for (const skill of sections.skills) {
      const level = skill.level ? ` (${skill.level})` : '';
      // The keywords are the whole point of a skill category in this
      // schema — without them the model cannot tell whether "Python" is
      // already listed, so it would duplicate the entry or (worse) replace
      // the category and wipe the user's existing skills.
      const kws = skill.keywords?.length ? `: ${skill.keywords.join(', ')}` : ': (empty)';
      parts.push(`  ${skill.name}${level}${kws}`);
    }
    parts.push('');
  }

  if (sections?.projects?.length) {
    parts.push('--- PROJECTS ---');
    for (const proj of sections.projects) {
      parts.push(`${proj.name}${proj.url ? ` — ${proj.url}` : ''}`);
      if (proj.description) parts.push(`  ${proj.description}`);
      if (proj.highlights?.length) {
        for (const h of proj.highlights) parts.push(`  • ${h}`);
      }
      parts.push('');
    }
  }

  // sections.certificates = certifications
  if (sections?.certificates?.length) {
    parts.push('--- CERTIFICATIONS ---');
    for (const cert of sections.certificates) {
      let line = cert.name;
      if (cert.issuer) line += ` (${cert.issuer})`;
      if (cert.date) line += ` — ${cert.date}`;
      parts.push(line);
    }
    parts.push('');
  }

  if (sections?.languages?.length) {
    parts.push('--- LANGUAGES ---');
    for (const lang of sections.languages) {
      parts.push(`${lang.language}${lang.fluency ? ` — ${lang.fluency}` : ''}`);
    }
    parts.push('');
  }

  // Remaining sections the assistant can edit. Kept compact — these are
  // rarely the subject of a conversation, but the model still needs to see
  // them to avoid duplicating an entry the user already has.
  const other: string[] = [];
  if (sections?.volunteer?.length) {
    other.push(
      `VOLUNTEER: ${sections.volunteer
        .map((v) => `${v.position} @ ${v.organization}`)
        .join('; ')}`
    );
  }
  if (sections?.awards?.length) {
    other.push(
      `AWARDS: ${sections.awards.map((a) => `${a.title}${a.awarder ? ` (${a.awarder})` : ''}`).join('; ')}`
    );
  }
  if (sections?.publications?.length) {
    other.push(`PUBLICATIONS: ${sections.publications.map((p) => p.name).join('; ')}`);
  }
  if (sections?.interests?.length) {
    other.push(
      `INTERESTS: ${sections.interests
        .map((i) => (i.keywords?.length ? `${i.name} (${i.keywords.join(', ')})` : i.name))
        .join('; ')}`
    );
  }
  if (other.length > 0) {
    parts.push('--- OTHER SECTIONS ---');
    parts.push(...other);
    parts.push('');
  }

  return parts.join('\n');
}

/**
 * The scorecard's dynamic tips, as plain text the model can read.
 *
 * Built from the SAME `buildDynamicTips` the scorecard renders, so the
 * advice the chat gives and the advice the scorecard shows cannot
 * disagree — the chat used to see only the dimension numbers and
 * improvise, while the scorecard named the exact bullets to change.
 */
export function buildAtsAdviceText(
  score: ScoreBreakdown,
  resume: ResumeData
): Record<string, string> {
  try {
    const tips = buildDynamicTips(score, resume, resume.jobContext ?? null);
    return tipsToPlainText(tips);
  } catch {
    // A tip builder that throws must not take the whole prompt with
    // it — the agent still has the dimension numbers.
    return {};
  }
}

/**
 * Build a plain-text block summarising the latest ATS score for the
 * resume vs the attached JD, so the chat model can reason against
 * actual numbers instead of inferring them from the resume text.
 *
 * Returns an empty string when no usable score is available (no JD,
 * fallback scoring, etc.) — caller decides whether to omit the
 * section entirely.
 */
export function buildAtsContext(
  score: ScoreBreakdown,
  source?: RenderedBreakdownSource | null,
  /**
   * The dynamic tips as PLAIN TEXT — the same advice the scorecard
   * shows, keyed by criterion.
   *
   * ## Why the agent needs them
   *
   * Without them the agent saw only the dimension NUMBERS and had to
   * improvise the advice. The scorecard beside it was saying "10 of 29
   * work bullets describe a task rather than an outcome (…named
   * bullets…)" — so the chat was the surface with the vaguer advice.
   *
   * The tips are rendered from the scorecard's own tips, so the two
   * surfaces cannot drift.
   */
  tipText?: Record<string, string>
): string {
  const dim = score.dimensionScores;
  const ic = score.intentCoverageBreakdown;

  // Format dimension rows in a fixed, sorted-by-weight order so the
  // model can quickly find the weakest one.
  const dims: Array<[string, number]> = [
    ['atsMatching', dim.atsMatching],
    ['structure', dim.structure],
    ['contentQuality', dim.contentQuality],
    ['alignment', dim.alignment],
    ['intentCoverage', dim.intentCoverage],
    ['roleFit', dim.roleFit],
    ['seniorityFit', dim.seniorityFit]
  ];
  // Sort descending so the model's eye lands on strengths first.
  const dimLines = [...dims]
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `  ${k.padEnd(16, ' ')} ${Math.round(v).toString().padStart(3)}`)
    .join('\n');

  const missedMust = ic.missed.mustHave ?? [];
  const missedNice = ic.missed.niceToHave ?? [];
  const missedImplicit = ic.missed.implicit ?? [];

  const missedLines: string[] = [];
  if (missedMust.length > 0) {
    missedLines.push(
      `  ✗ MUST-HAVE missing (${missedMust.length}): ${missedMust.slice(0, 12).join(', ')}`
    );
  }
  if (missedNice.length > 0) {
    missedLines.push(
      `  ~ nice-to-have missing (${missedNice.length}): ${missedNice.slice(0, 12).join(', ')}`
    );
  }
  if (missedImplicit.length > 0) {
    missedLines.push(
      `  · implicit missing (${missedImplicit.length}): ${missedImplicit.slice(0, 8).join(', ')}`
    );
  }
  const missedSection = missedLines.length > 0
    ? '\n\nTop missed keywords / skills (priority order):\n' + missedLines.join('\n')
    : '\n\nTop missed keywords / skills: (none — full coverage)';

  const fallbackNote = ic.fallback
    ? '\n\nNote: intent coverage is at the neutral default because v2 intent extraction was unavailable for this JD. Prioritise keyword coverage from the JD text.'
    : '';

  // Provenance note.
  //
  // `snapshot` — this is the number on the user's scorecard. Nothing to
  // say.
  //
  // `computed` — there is no persisted score yet, so this is a
  // keyword-only estimate the user has NEVER been shown. The agent must
  // not present it as "your score". It should measure properly with
  // `getAtsScore` (which uses the same engine as the scorecard) before
  // asserting a number.
  const provenanceNote =
    source === 'computed'
      ? '\n\nNote: this score was computed on the fly because no score has been saved yet for this resume. It is a keyword-only estimate and is NOT the number on the scorecard. If the user asks for their score, call getAtsScore to measure it with the same engine the scorecard uses.'
      : '';

  // Eligibility requirements — a degree, a certification, work
  // authorisation. These are NOT skill gaps and are deliberately not in
  // the missed list, so the assistant needs them separately or it will
  // have nothing to say about the one requirement the user cannot
  // rewrite their way into.
  const eligibility = score.eligibility ?? [];
  const eligibilitySection =
    eligibility.length > 0
      ? '\n\nEligibility requirements (NOT skill gaps — do not present them as missing skills, and do not suggest the user add them to their resume):\n' +
        eligibility
          .map((note) => `  • ${note.requirement.text} → ${note.status}${note.completesOn ? ` (completes ${note.completesOn})` : ''}`)
          .join('\n')
      : '';

  // The concrete, per-criterion advice — the SAME advice the scorecard
  // shows. This is what turns "contentQuality: 68" into "10 of 29 work
  // bullets describe a task rather than an outcome (…named bullets…)".
  const adviceLines = Object.entries(tipText ?? {});
  const adviceSection = adviceLines.length
    ? '\n\nWhat to fix (the scorecard shows this — quote it, do not improvise):\n' +
      adviceLines.map(([criterion, text]) => `  • ${criterion}: ${text}`).join('\n')
    : '';

  // The sub-criterion scores — the fine-grained parts behind each
  // dimension bar.
  //
  // The dimension numbers say WHICH BAR is weak; these say which PART
  // of it is. Without them the agent could only answer "your Impact
  // score is 77" when the candidate asked what to fix, and the advice
  // it improvised was vaguer than the scorecard's — which is keyed by
  // criterion, so the criteria scores are what makes the two
  // surfaces agree.
  const criteriaSection = (() => {
    const text = criteriaTextForModel(score);
    return text ? `\n\n${text}` : '';
  })();

  // Which dimension is worth the candidate's time FIRST.
  //
  // The scorecard's "Start here" line ranks by RECOVERABLE POINTS
  // (`weight × (100 − score)`), not by the raw score — a dimension at
  // 50 that carries 21% of the score is worth more than one at 50 that
  // carries 10%. The agent should prioritise the same way, or it will
  // send the user to the wrong bar.
  const topWin = biggestRecoverableWin(score.dimensionScores, {
    useV2Weights: !score.intentCoverageBreakdown?.fallback
  });
  const startHere = topWin
    ? `\n\nStart here: ${topWin.label} is at ${Math.round(topWin.score)}/100 and carries ` +
      `${Math.round(topWin.weight * 100)}% of the overall score — worth up to ` +
      `${topWin.points.toFixed(1)} points. Recommend this one first.`
    : '';

  return `=== ATS SCORE (latest, vs current JD) ===
Overall match: ${score.overallScore} / 100

Dimension scores (0–100, sorted by strength):
${dimLines}${criteriaSection}${missedSection}${eligibilitySection}${adviceSection}${startHere}${fallbackNote}${provenanceNote}

Use these numbers to prioritise edits — fixing a 38 in intentCoverage typically lifts the overall match more than tweaking a 78. Don't invent missing skills; only surface gaps the score actually reports.

When the "What to fix" list is present, use IT: it names the specific bullets, keywords and sections to change. Do not replace it with your own general advice — the scorecard is showing the candidate the same list, and the two must agree.

When the user asks which part of their score is weakest, name the weakest sub-criterion from the sub-criterion list and quote that same criterion's advice from "What to fix". Never present a criterion listed under "Could NOT be measured" as a weakness — the engine had no signal there, so there is nothing to fix.

When an eligibility requirement is listed, tell the user what it means for them and what the resume says about it — for example "this role asks for a bachelor's degree and yours completes in June 2027, so you'll meet it by then." Do not tell them to add a degree to their resume.`;
}
