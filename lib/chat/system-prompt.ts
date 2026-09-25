import 'server-only';

import type { ResumeData } from '@/lib/resume-schema';
import type { ScoreBreakdown } from '@/lib/scoring/score';

/**
 * Available resume template IDs. Keep in sync with the Zod schema default.
 */
export const AVAILABLE_TEMPLATES = [
  'minimal',
  'classic',
  'executive',
  'creative',
  'modern'
] as const;
export type TemplateId = (typeof AVAILABLE_TEMPLATES)[number];

const TEMPLATE_DESCRIPTIONS: Record<TemplateId, string> = {
  minimal: 'Minimal — clean, single-column, typography-focused',
  classic: 'Classic — traditional two-column with clear hierarchy',
  executive: 'Executive — formal, bold headers, senior-role optimised',
  creative: 'Creative — visual, colour accents, design-forward',
  modern: 'Modern — contemporary layout with balanced whitespace'
};

/**
 * Extract a profile URL from the basics.profiles array by network name.
 */
function getProfileUrl(profiles: ResumeData['sections']['basics']['profiles'], network: string): string | null {
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
      parts.push(`  ${skill.name}${level}`);
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

  return parts.join('\n');
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
export function buildAtsContext(score: ScoreBreakdown): string {
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

  return `=== ATS SCORE (latest, vs current JD) ===
Overall match: ${score.overallScore} / 100

Dimension scores (0–100, sorted by strength):
${dimLines}${missedSection}${fallbackNote}

Use these numbers to prioritise edits — fixing a 38 in intentCoverage typically lifts the overall match more than tweaking a 78. Don't invent missing skills; only surface gaps the score actually reports.`;
}

/**
 * Build the system prompt for the chat assistant.
 * The resume context is built fresh on every call so the model
 * always sees the current state.
 */
export function buildSystemPrompt(
  data: ResumeData,
  jobContext?: ResumeData['jobContext'],
  atsScore?: ScoreBreakdown | null
): string {
  const resumeText = buildResumeContext(data);
  const templateName = data.template ?? 'classic';

  let jobSection = '';
  if (jobContext?.description) {
    // No rawText — use description (the parsed AI text)
    jobSection =
      '\n\n=== JOB DESCRIPTION ===\n' +
      jobContext.description.slice(0, 4000) +
      (jobContext.description.length > 4000 ? '\n[...truncated...]' : '');
  }

  if (!jobSection && jobContext?.title) {
    // Fall back to structured fields when description is empty
    jobSection = `\n\n=== JOB CONTEXT ===\nTitle: ${jobContext.title}`;
    if (jobContext.company) jobSection += `\nCompany: ${jobContext.company}`;
    if (jobContext.requirements?.length)
      jobSection +=
        '\nRequirements: ' + jobContext.requirements.slice(0, 10).join(', ');
    if (jobContext.niceToHaveSkills?.length)
      jobSection +=
        '\nPreferred Skills: ' + jobContext.niceToHaveSkills.slice(0, 10).join(', ');
  }

  // Only feed the ATS section when both a JD is attached AND a usable
  // score exists. The score is meaningless without a JD to compare
  // against, and a neutral fallback is just noise.
  const atsSection =
    atsScore && jobSection ? '\n\n' + buildAtsContext(atsScore) : '';

  return `You are Nexstepper — a helpful resume assistant. You help users refine their resume, understand how it matches a job description, and switch between resume templates.

You have two tools:
1. **editResume** — Merge partial changes into the user's resume. Only call this when the user asks you to make a specific change. Always explain what you're doing before calling it.
2. **switchTemplate** — Change the resume template. Available templates: ${AVAILABLE_TEMPLATES.map(
    (t) => `${t} (${TEMPLATE_DESCRIPTIONS[t]})`
  ).join('; ')}.

Guidelines:
- Be concise and actionable. Give specific suggestions, not generic advice.
- When editing, preserve the user's voice and accomplishments exactly — don't hallucinate details.
- If asked to tailor for a job, reference the job description context when available — and use the ATS SCORE block (when present) to prioritise edits by leverage.
- If asked to switch templates, use switchTemplate and briefly describe the result.
- If the user asks something outside resume help, politely redirect.

Current resume state:
${resumeText}${jobSection}${atsSection}

Current active template: ${templateName} (${TEMPLATE_DESCRIPTIONS[templateName as TemplateId] ?? 'Unknown'}).`;
}
