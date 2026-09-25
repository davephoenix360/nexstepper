import 'server-only';

import type { ResumeData } from '@/lib/resume-schema';

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
 * Build the system prompt for the chat assistant.
 * The resume context is built fresh on every call so the model
 * always sees the current state.
 */
export function buildSystemPrompt(
  data: ResumeData,
  jobContext?: ResumeData['jobContext']
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

  return `You are Nextep — a helpful resume assistant. You help users refine their resume, understand how it matches a job description, and switch between resume templates.

You have two tools:
1. **editResume** — Merge partial changes into the user's resume. Only call this when the user asks you to make a specific change. Always explain what you're doing before calling it.
2. **switchTemplate** — Change the resume template. Available templates: ${AVAILABLE_TEMPLATES.map(
    (t) => `${t} (${TEMPLATE_DESCRIPTIONS[t]})`
  ).join('; ')}.

Guidelines:
- Be concise and actionable. Give specific suggestions, not generic advice.
- When editing, preserve the user's voice and accomplishments exactly — don't hallucinate details.
- If asked to tailor for a job, reference the job description context when available.
- If asked to switch templates, use switchTemplate and briefly describe the result.
- If the user asks something outside resume help, politely redirect.

Current resume state:
${resumeText}${jobSection}

Current active template: ${templateName} (${TEMPLATE_DESCRIPTIONS[templateName as TemplateId] ?? 'Unknown'}).`;
}
