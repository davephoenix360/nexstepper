import 'server-only';

import { createHash } from 'node:crypto';
import { z } from 'zod';

import { generateObjectWithFallbacks } from '@/lib/ai/fallback';
import { CHAT_MODEL, CHAT_FALLBACKS } from '@/lib/ai/providers';
import type { ResumeData } from '@/lib/resume-schema';
import type { JobPosting } from '@/lib/resume-schema/job-posting';

/**
 * First-session analysis — the deep "review my resume against this job
 * description" pass.
 *
 * ## Why this exists
 *
 * The assistant can edit a resume, score it, and change its layout. What
 * it could not do was the thing the user actually came for: a considered
 * read of their resume *as a document*, judged against a specific role.
 *
 * That is expensive relative to the other derived artifacts — one model
 * call, ~11K input tokens, ~3K output, about $0.003 — so it runs ONCE
 * per (resume, JD) pair and is cached. Editing the resume does not
 * invalidate it (the critique is about the GAP, which the user can close
 * themselves). Editing the JD does invalidate it, via the `jd_hash`.
 *
 * Plan: docs/plans/chat-agent-v3.md §5
 */

/** Below this, the resume is too thin to critique meaningfully. */
const MIN_RESUME_CHARS = 200;
/** Long enough for a real resume, short enough to stay in one context. */
const MAX_RESUME_CHARS = 40_000;
/** Per-model timeout. */
const ANALYSIS_TIMEOUT_MS = 45_000;

/**
 * The schema's array limits are deliberately GENEROUS.
 *
 * The first live run failed because the model returned 13
 * `alreadyCovered` items against a `.max(12)` limit — a Zod
 * `too_big` on an otherwise perfectly good critique. That cost the
 * whole call: the primary model was discarded, the fallback chain
 * ran, and the paste flow waited 35 seconds instead of ~8.
 *
 * So the limits here exist only to bound the ABSOLUTE worst case, and
 * the prompt renderer truncates to what it actually displays. It is
 * far better to drop the 13th item than to throw away a good review
 * and wait for another model.
 */
export const firstSessionAnalysisSchema = z.object({
  /** One sentence. The single most important thing to say. */
  headline: z.string(),
  /** Overall read: is this resume a contender for this role? */
  verdict: z.enum(['strong', 'workable', 'weak']),
  /** What the resume already does well, with the evidence from it. */
  strengths: z
    .array(
      z.object({
        point: z.string(),
        evidence: z.string()
      })
    )
    .max(12),
  /** What is missing, why it matters for THIS role, and how much. */
  gaps: z
    .array(
      z.object({
        point: z.string(),
        why: z.string(),
        severity: z.enum(['high', 'medium', 'low'])
      })
    )
    .max(15),
  /**
   * Terms the job description asks for that the resume does not show.
   *
   * The whole point is that this list is TRUSTWORTHY: the assistant must
   * not ask the user for skills they already listed, and must not invent
   * skills the job never asked for.
   */
  keywordGaps: z.array(z.string()).max(30),
  /**
   * Things the job asks for that the resume ALREADY demonstrates.
   *
   * This is the anti-repetition list — the assistant must not keep
   * suggesting a skill the candidate already has.
   */
  alreadyCovered: z.array(z.string()).max(30),
  /** Rough length read, in the assistant's own words. */
  lengthNote: z.string().nullable(),
  /**
   * Concrete next actions, most valuable first. Each should be
   * actionable on this resume specifically.
   */
  nextActions: z.array(z.string()).max(12)
});

/**
 * What the prompt actually shows.
 *
 * The analysis is sent on every chat turn, so the prompt copy is
 * truncated to what a reader can use. The full list stays in the
 * database.
 */
export const ANALYSIS_DISPLAY_LIMITS = {
  strengths: 6,
  gaps: 8,
  keywordGaps: 12,
  alreadyCovered: 12,
  nextActions: 6
} as const;

export type FirstSessionAnalysis = z.infer<typeof firstSessionAnalysisSchema>;

export type FirstSessionAnalysisResult =
  | { ok: true; data: FirstSessionAnalysis; modelUsed: string }
  | { ok: false; code: FirstSessionAnalysisErrorCode; error: string };

export type FirstSessionAnalysisErrorCode =
  | 'no_api_key'
  | 'resume_too_short'
  | 'resume_too_large'
  | 'no_job_description'
  | 'ai_failure'
  | 'empty_output';

/**
 * Digest of the job description text.
 *
 * Changing the JD changes the hash, which is what invalidates a cached
 * analysis. Using the TEXT rather than a parsed structure means we
 * invalidate even when the parse produces the same result — the raw text
 * is what the user actually changed.
 */
export function hashJobDescription(jdText: string): string {
  return createHash('sha256')
    .update(jdText.trim())
    .digest('hex')
    .slice(0, 32);
}

const ANALYSIS_SYSTEM_PROMPT = `You are a senior recruiter and resume reviewer reviewing ONE candidate's resume against ONE job description.

You are doing the review a good recruiter does when deciding whether to move this person to the next round. Be specific, be useful, be honest.

# Rules

- **Only claim what the resume actually shows.** Every strength must cite evidence that appears in the resume. If you cannot point to it, it is not there.
- **Never invent.** Do not suggest a metric the candidate did not give you. Do not claim they have a skill because the job description mentions it. If the resume is silent on something, say it is missing — that is a finding, not a failure.
- **Every gap must be specific to THIS role.** "Add leadership examples" is useless. "The JD asks for Python; the resume shows only JavaScript and SQL" is useful.
- **Rank by leverage.** The next actions are ordered by how much they move this specific candidacy. The weakest dimension and the missing required skills come first.
- **Do not repeat what is already there.** Put job requirements the resume already demonstrates into \`alreadyCovered\`, and keep them out of \`keywordGaps\`. The candidate should never be asked for something they already listed.
- **keywordGaps must be traceable to the job description.** Every entry must be a term the JD asks for. Never include a skill the JD never mentions.
- Be direct. "This resume does not evidence any backend work" is more useful than "consider highlighting your technical strengths".
- If the resume is genuinely good for this role, say so. Inventing problems to seem thorough is a failure, not thoroughness.

# Keep it tight

These are HARD limits. Exceeding them makes the whole review get thrown away and re-run, which costs the user 30 seconds:

- strengths: at most ${ANALYSIS_DISPLAY_LIMITS.strengths}
- gaps: at most ${ANALYSIS_DISPLAY_LIMITS.gaps}
- keywordGaps: at most ${ANALYSIS_DISPLAY_LIMITS.keywordGaps}
- alreadyCovered: at most ${ANALYSIS_DISPLAY_LIMITS.alreadyCovered}
- nextActions: at most ${ANALYSIS_DISPLAY_LIMITS.nextActions}

If you have more to say, pick the ones that matter most. A shorter review that arrives is worth more than a complete one that gets rejected.

# Output

- \`headline\`: one sentence, the single most important thing.
- \`verdict\`: strong / workable / weak for this role.
- \`strengths\`: what works, each with the evidence from the resume.
- \`gaps\`: what is missing, why it matters for this role, and how severe it is.
- \`keywordGaps\`: job requirements the resume does not show.
- \`alreadyCovered\`: job requirements the resume does show.
- \`lengthNote\`: rough length read, or null.
- \`nextActions\`: concrete, ordered by leverage.`;

function buildAnalysisUserPrompt(
  resumeText: string,
  jobDescription: string
): string {
  return `Here is my resume.

<resume>
${resumeText}
</resume>

Here is the job description.

<job_description>
${jobDescription}
</job_description>

Review the resume against the job description.`;
}

/**
 * Section key → the slug used by `data.print.hiddenSections`.
 *
 * Keys are the `ResumeData.sections` names; slugs are the ids the
 * templates render (`id="section-{slug}"`) and the values the print
 * preferences store. Mirrors SECTION_TABLE in
 * `lib/inline-issue/map-path-to-section.ts`.
 */
const SECTION_KEY_TO_SLUG: Record<string, string> = {
  work: 'experience',
  skills: 'skills',
  projects: 'projects',
  education: 'education',
  awards: 'awards',
  certificates: 'certificates',
  publications: 'publications',
  volunteer: 'volunteer',
  languages: 'languages',
  interests: 'interests',
  references: 'references'
};

/**
 * Render the resume as the flat text a reviewer actually reads.
 *
 * Deliberately NOT the JSON envelope — the model reasons about prose
 * much better than about a nested object, and this halves the token
 * count versus shipping the raw `ResumeData`.
 *
 * ## Hidden sections are EXCLUDED
 *
 * `data.print.hiddenSections` lists sections the user has excluded from
 * the printable PDF. The editor still shows them, but the document the
 * user will SUBMIT does not contain them.
 *
 * So they are excluded here too. If they were included, the analysis
 * would praise a Projects section that is not in the PDF, and would
 * report "you already demonstrate X" for content the recruiter will
 * never see — the most damaging possible kind of wrong.
 *
 * The hidden sections are named in a trailing note so the assistant can
 * still offer "you have a Projects section hidden — worth including?"
 * rather than silently forgetting content the user wrote.
 */
export function resumeToPlainText(data: ResumeData): string {
  const s = data.sections;
  const hidden = new Set(data.print?.hiddenSections ?? []);
  const isHidden = (key: string) => hidden.has(SECTION_KEY_TO_SLUG[key] ?? key);

  const lines: string[] = [];

  const b = s.basics;
  const contact = [
    b.location?.city,
    b.location?.region,
    b.email,
    b.phone,
    b.url
  ]
    .filter((v): v is string => Boolean(v && String(v).trim()))
    .join(' | ');
  if (b.name || b.label) {
    lines.push(`${b.name ?? ''}${b.label ? ` — ${b.label}` : ''}`.trim());
  }
  if (contact) lines.push(contact);
  if (b.summary && !isHidden('basics')) {
    lines.push('', 'SUMMARY', b.summary);
  }

  if (s.work?.length && !isHidden('work')) {
    lines.push('', 'EXPERIENCE');
    for (const w of s.work) {
      lines.push('', `${w.company}${w.location ? ` — ${w.location}` : ''}`);
      for (const p of w.positions ?? []) {
        const dates = [p.startDate, p.endDate].filter(Boolean).join(' to ');
        lines.push(`  ${p.title}${dates ? ` (${dates})` : ''}`);
        for (const h of p.highlights ?? []) lines.push(`    - ${h}`);
      }
    }
  }

  if (s.projects?.length && !isHidden('projects')) {
    lines.push('', 'PROJECTS');
    for (const p of s.projects) {
      lines.push('', `${p.name}${p.url ? ` (${p.url})` : ''}`);
      if (p.description) lines.push(`  ${p.description}`);
      for (const h of p.highlights ?? []) lines.push(`  - ${h}`);
    }
  }

  if (s.education?.length && !isHidden('education')) {
    lines.push('', 'EDUCATION');
    for (const e of s.education) {
      const deg = e.degree?.degreeLevel
        ? `${e.degree.degreeLevel}${e.degree.majors?.length ? `, ${e.degree.majors.join(', ')}` : ''}`
        : '';
      lines.push(`  ${e.institution}${deg ? ` — ${deg}` : ''}${e.gpa ? ` (GPA ${e.gpa})` : ''}`);
    }
  }

  if (s.skills?.length && !isHidden('skills')) {
    lines.push('', 'SKILLS');
    for (const sk of s.skills) {
      lines.push(`  ${sk.name}: ${(sk.keywords ?? []).join(', ')}`);
    }
  }

  if (s.certificates?.length && !isHidden('certificates')) {
    lines.push('', 'CERTIFICATIONS');
    for (const c of s.certificates) {
      lines.push(`  ${c.name}${c.issuer ? ` — ${c.issuer}` : ''}${c.date ? ` (${c.date})` : ''}`);
    }
  }

  if (s.awards?.length && !isHidden('awards')) {
    lines.push('', 'AWARDS');
    for (const a of s.awards) {
      lines.push(`  ${a.title}${a.awarder ? ` — ${a.awarder}` : ''}${a.date ? ` (${a.date})` : ''}`);
    }
  }

  if (s.volunteer?.length && !isHidden('volunteer')) {
    lines.push('', 'VOLUNTEER');
    for (const v of s.volunteer) {
      lines.push(`  ${v.organization}${v.position ? ` — ${v.position}` : ''}`);
    }
  }

  if (s.languages?.length && !isHidden('languages')) {
    lines.push('', 'LANGUAGES');
    for (const l of s.languages) {
      lines.push(`  ${l.language}${l.fluency ? ` (${l.fluency})` : ''}`);
    }
  }

  if (s.interests?.length && !isHidden('interests')) {
    lines.push('', 'INTERESTS');
    for (const i of s.interests) {
      lines.push(`  ${i.name}${i.keywords?.length ? `: ${i.keywords.join(', ')}` : ''}`);
    }
  }

  // Name the excluded sections so the assistant can offer to bring them
  // back, rather than silently forgetting work the user did.
  const hiddenNames = [...hidden].filter((slug) => slug !== 'basics');
  if (hiddenNames.length) {
    lines.push('');
    lines.push(
      `NOTE: the user has excluded these sections from the printed document: ${hiddenNames.join(', ')}. They are NOT part of the resume being reviewed. Do not cite them as evidence of anything.`
    );
  }

  return lines.join('\n').trim();
}

/**
 * Run the analysis. Never throws — a failure here must not stop the
 * variant from being created or the chat from opening.
 *
 * Takes the RAW job description text rather than a parsed `JobPosting`,
 * deliberately: the analysis only ever reads the description, and
 * taking the raw text lets it run in PARALLEL with the JD parser and
 * the Markdown formatter instead of after them. Three sequential AI
 * round-trips would put ~20s of silence in front of the user; three
 * parallel ones cost the same as the slowest.
 */
export async function runFirstSessionAnalysis(
  data: ResumeData | null | undefined,
  jdText: string
): Promise<FirstSessionAnalysisResult> {
  if (!process.env.AI_GATEWAY_API_KEY) {
    return {
      ok: false,
      code: 'no_api_key',
      error: 'AI_GATEWAY_API_KEY is not configured.'
    };
  }

  const jd = jdText.trim();
  if (!jd) {
    return {
      ok: false,
      code: 'no_job_description',
      error: 'No job description is attached to this resume.'
    };
  }

  const resumeText = data ? resumeToPlainText(data) : '';
  if (resumeText.length < MIN_RESUME_CHARS) {
    return {
      ok: false,
      code: 'resume_too_short',
      error: `Resume is too short to review (${resumeText.length} chars).`
    };
  }
  if (resumeText.length > MAX_RESUME_CHARS) {
    return {
      ok: false,
      code: 'resume_too_large',
      error: `Resume is too long to review (${resumeText.length} chars).`
    };
  }

  try {
    const result = await generateObjectWithFallbacks({
      models: [CHAT_MODEL, ...CHAT_FALLBACKS],
      system: ANALYSIS_SYSTEM_PROMPT,
      prompt: buildAnalysisUserPrompt(resumeText, jd.slice(0, 16_000)),
      schema: firstSessionAnalysisSchema,
      temperature: 0,
      abortSignal: AbortSignal.timeout(ANALYSIS_TIMEOUT_MS)
    });

    if (!result.data.headline?.trim()) {
      return {
        ok: false,
        code: 'empty_output',
        error: 'The analysis returned an empty result.'
      };
    }

    return { ok: true, data: result.data, modelUsed: result.modelUsed };
  } catch (err) {
    return {
      ok: false,
      code: 'ai_failure',
      error: err instanceof Error ? err.message : 'Analysis failed.'
    };
  }
}
