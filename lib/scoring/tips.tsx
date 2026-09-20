/**
 * Improvement tips for each ATS sub-criterion.
 *
 * Displayed as hover tooltips on the expanded sub-criteria breakdown
 * in the scorecard panel. Each tip is a short, actionable sentence —
 * the user should know exactly what to do after reading it.
 *
 * Tips are keyed by the canonical sub-criterion label as it appears
 * in `ScoreBreakdown.criteriaScores` so the scorecard can do a
 * direct lookup without any mapping layer.
 *
 * Two layers:
 *
 *   1. CRITERIA_TIPS — static fallback strings. Always present,
 *      never null. Used when we don't have enough signal to build a
 *      dynamic tip (e.g. no JD attached for ATS criteria).
 *
 *   2. buildDynamicTips — pure function that, given the same
 *      ScoreBreakdown the panel already renders plus the resume +
 *      JD envelopes, returns resume-specific actionable advice per
 *      sub-criterion. Returns a Partial<Record<…>> so callers merge
 *      it on top of CRITERIA_TIPS with `??`. Pure / sync / no IO.
 *
 * Design choices:
 *   - The dynamic helper re-tokenizes the resume + JD once each
 *     (cheap, low ms). We don't plumb pre-tokenized data from the
 *     scoring engine because (a) that would couple this module to
 *     engine internals and (b) the dynamic tip generation only runs
 *     when the user expands the details panel — latency there is
 *     fine.
 *   - Dynamic tips render with `<strong>` keyword emphasis (passed
 *     as ReactNode through `DimensionBar.tip`). The static fallback
 *     strings stay plain text and render unchanged.
 *   - When the dynamic helper can't produce a useful tip (no JD,
 *     empty lists, etc.) it returns undefined for that key, so the
 *     UI falls back to the static string. Every key stays
 *     renderable.
 */

import type { ReactNode } from 'react';
import type { JobPosting, ResumeData } from '@/lib/resume-schema';
import type { ScoreBreakdown } from './score';
import { SOFT_SKILLS, STOP_WORDS, WEAK_VERBS } from './dictionaries';

// ---------------------------------------------------------------------------
// Static fallback tips — always present, plain strings.
// ---------------------------------------------------------------------------

export const CRITERIA_TIPS: Record<string, string> = {
  'ATS Keyword Match':
    'Add more skills and requirements from the job description to your resume. ATS systems filter on exact and near-exact keyword matches.',

  'ATS Similarity':
    'Rewrite your descriptions to use the same language as the job posting. Phrases like "built a database" and "designed a data store" score higher when they match the JD wording.',

  'Intent Coverage':
    'Look at the JD and identify which skills are explicitly required vs. nice-to-have. Address the must-haves first — missing those costs your score 3x more than missing nice-to-haves.',

  'ATS Coverage':
    'Make sure your resume covers the main requirements: if the JD asks for five things and you only address three, add content that covers the missing ones.',

  'Role Fit':
    "Title alignment matters — if the JD asks for a 'Senior Platform Engineer' but your resume titles say 'Backend Engineer', edit them to use the JD's role family vocabulary where it's true to your experience.",

  'Seniority Fit':
    'Seniority gap: a candidate with 2 years is rarely going to land a 5+ years JD. If you have adjacent experience, call it out explicitly; otherwise focus on transferable skills.',

  'Section Completeness':
    'Fill in every standard resume section: Summary, Experience, Education, Skills, and at least one achievement-oriented section. Missing sections lower your score.',

  'Optimal Length':
    "Keep your resume to 1-2 pages. Too short and the ATS can't find enough content to score; too long and recruiters may not read it.",

  'Accomplishment Focus':
    'Replace generic duty lists with specific accomplishments. Use the XYZ formula: achieved X by doing Y, resulting in Z (e.g., "Reduced API latency by 40% by migrating to a CDN, cutting load times in half").',

  'Action Verb Usage':
    'Start bullet points with strong action verbs: Built, Designed, Led, Scaled, Automated. Avoid weak verbs like "helped with" or "worked on".',

  Tailoring:
    'Customize your resume for each application. A generic resume scores lower than one written specifically for this job — mirror the job title, required skills, and key phrases from the posting.',

  'Unique Value':
    'Highlight what makes you different: awards, certifications, notable projects, or unique domain expertise that few other candidates will have.',

  'Soft Skills':
    'Add soft skills from the job description if you have evidence of them — collaboration, leadership, communication. Show them in context, not just as a list.'
};

// ---------------------------------------------------------------------------
// Dynamic-tip builder — resume-specific actionable advice per sub-criterion.
// ---------------------------------------------------------------------------

export type SubCriterionKey = keyof ScoreBreakdown['criteriaScores'];

export type DynamicTips = Partial<Record<SubCriterionKey, ReactNode>>;

const MAX_KEYWORDS_IN_TIP = 3;
const MAX_REQUIREMENTS_IN_TIP = 3;
const MAX_WEAK_VERBS_IN_TIP = 3;
const MAX_TITLE_KEYWORDS_IN_TIP = 4;
const MAX_SOFT_SKILLS_IN_TIP = 4;
const MAX_MISSING_SECTIONS_IN_TIP = 4;

/**
 * Build a per-sub-criterion dynamic-tip map. Entries are only set
 * when we have enough signal to write a resume-specific sentence;
 * absent entries fall back to `CRITERIA_TIPS[key]` at render time.
 *
 * Pure / sync / no IO. Re-tokenizes the resume + JD once each.
 */
export function buildDynamicTips(
  breakdown: ScoreBreakdown,
  resume: ResumeData | null,
  job: JobPosting | null
): DynamicTips {
  const out: DynamicTips = {};
  if (!resume) return out;

  const resumeText = flattenResumeTextForTips(resume);

  // ATS Matching (3 sub-criteria).
  if (job) {
    const missingKeywords = computeMissingKeywords(job, resumeText);
    if (missingKeywords.length > 0) {
      const top = missingKeywords.slice(0, MAX_KEYWORDS_IN_TIP);
      const tail = missingKeywords.length > MAX_KEYWORDS_IN_TIP
        ? ` (top ${MAX_KEYWORDS_IN_TIP} of ${missingKeywords.length})`
        : '';
      out['ATS Keyword Match'] = (
        <>
          Add these missing keywords from the JD:{' '}
          <strong>{top.join(', ')}</strong>
          {tail}.
        </>
      );
    }

    // v2 Intent Coverage — surface the per-priority miss list when
    // the engine has v2 intent data (mustHave/niceToHave/implicit
    // skill arrays populated). Skips the v1 token-level fallback
    // when the extractor produced no structured intent (legacy
    // rows + failed extractions). The v1 'ATS Keyword Match' tip
    // above still fires in that case, so the user always sees
    // something actionable.
    if (hasV2Intent(job)) {
      const intentTip = buildIntentCoverageMissListTip(job, resumeText);
      if (intentTip) out['Intent Coverage'] = intentTip;
    }

    const similarityScore = breakdown.criteriaScores['ATS Similarity'];
    if (similarityScore < 70) {
      out['ATS Similarity'] = (
        <>
          BM25 similarity is <strong>{Math.round(similarityScore)}/100</strong> —
          your wording differs from the JD. Try paraphrasing your bullets to
          use the same vocabulary as the posting.
        </>
      );
    }

    const uncoveredRequirements = computeUncoveredRequirements(job, resumeText);
    if (uncoveredRequirements.length > 0) {
      const total = (job.requirements ?? []).length;
      const covered = total - uncoveredRequirements.length;
      const samples = uncoveredRequirements
        .slice(0, MAX_REQUIREMENTS_IN_TIP)
        .map(truncateRequirement);
      const tail = uncoveredRequirements.length > MAX_REQUIREMENTS_IN_TIP
        ? ` (+${uncoveredRequirements.length - MAX_REQUIREMENTS_IN_TIP} more)`
        : '';
      out['ATS Coverage'] = (
        <>
          You're addressing <strong>{covered} of {total}</strong> required
          responsibilities. Not yet covered:{' '}
          <strong>{samples.join('; ')}</strong>
          {tail}.
        </>
      );
    }
  }

  // Structure (2 sub-criteria).
  const missingSections = computeMissingSections(resume);
  if (missingSections.length > 0) {
    const list = missingSections.slice(0, MAX_MISSING_SECTIONS_IN_TIP);
    out['Section Completeness'] = (
      <>
        You're missing the{' '}
        <strong>{joinWithAnd(list)}</strong>{' '}
        {list.length > 1 ? 'sections' : 'section'}. Add{' '}
        {list.length > 1 ? 'them' : 'it'} to lift your score.
      </>
    );
  }

  const wordCountValue = resumeText.trim().split(/\s+/).filter(Boolean).length;
  if (wordCountValue < 500) {
    out['Optimal Length'] = (
      <>
        Your resume is <strong>{wordCountValue} words</strong> — well under
        the 500-word minimum. Add more detail to your experience bullets.
      </>
    );
  } else if (wordCountValue > 800) {
    out['Optimal Length'] = (
      <>
        Your resume is <strong>{wordCountValue} words</strong> —{' '}
        <strong>{wordCountValue - 800}</strong> over the 800-word ceiling.
        Trim a few bullets or condense older roles.
      </>
    );
  }

  // Content Quality (2 sub-criteria).
  const highlights = collectHighlights(resume);
  if (highlights.length > 0) {
    const withDigits = highlights.filter((h) => /\d/.test(h)).length;
    const withoutDigits = highlights.length - withDigits;
    if (withoutDigits > 0 && withDigits < highlights.length) {
      out['Accomplishment Focus'] = (
        <>
          Only <strong>{withDigits} of {highlights.length}</strong> work
          bullets include a number. Try quantifying your impact — %s, $s,
          time saved, team size.
        </>
      );
    }

    const weakBullets = highlights.filter((h) => {
      const first = h.trim().split(/\s+/)[0]?.toLowerCase();
      return !!first && WEAK_VERBS.has(first);
    });
    if (weakBullets.length > 0) {
      const weakVerbsUsed = Array.from(
        new Set(
          weakBullets
            .map((h) => h.trim().split(/\s+/)[0]?.toLowerCase() ?? '')
            .filter(Boolean)
        )
      ).slice(0, MAX_WEAK_VERBS_IN_TIP);
      out['Action Verb Usage'] = (
        <>
          <strong>{weakBullets.length} of {highlights.length}</strong> bullets
          start with weak verbs (
          <strong>{weakVerbsUsed.join(', ')}</strong>). Lead with strong
          verbs like Built, Led, Scaled.
        </>
      );
    }
  }

  // Alignment (3 sub-criteria).
  const tailoringScore = breakdown.criteriaScores.Tailoring;
  const summary = resume.sections.basics.summary ?? '';
  const title = job?.title ?? '';
  if (title && summary) {
    const titleKeywords = Array.from(new Set(titleTokens(title)))
      .filter((t) => !summary.toLowerCase().includes(t))
      .slice(0, MAX_TITLE_KEYWORDS_IN_TIP);
    if (tailoringScore < 30 && titleKeywords.length > 0) {
      out['Tailoring'] = (
        <>
          Your summary is <strong>{Math.round(tailoringScore)}%</strong>{' '}
          similar to the job title. Try mirroring these title keywords in
          your summary:{' '}
          <strong>{titleKeywords.join(', ')}</strong>.
        </>
      );
    }
  }

  // 'Unique Value' is binary — the static tip covers it.

  if (SOFT_SKILLS.length > 0) {
    const haystack = resumeText.toLowerCase();
    const missingSoftSkills = SOFT_SKILLS.filter((s) => !haystack.includes(s));
    if (missingSoftSkills.length > 0 && missingSoftSkills.length < SOFT_SKILLS.length) {
      const list = missingSoftSkills.slice(0, MAX_SOFT_SKILLS_IN_TIP);
      out['Soft Skills'] = (
        <>
          Your resume is missing{' '}
          <strong>{joinWithAnd(list)}</strong>{' '}
          {list.length > 1 ? 'mentions' : 'mention'} — add{' '}
          {list.length > 1 ? 'them' : 'it'} with concrete examples.
        </>
      );
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// Pure helpers — extracted so they can be unit-tested independently.
// ---------------------------------------------------------------------------

/**
 * Flatten the resume into one text blob for tokenization. Mirrors
 * `flattenResumeText` from `lib/scoring/similarity.ts` closely enough
 * for actionable advice — we don't need pixel-perfect parity with
 * the engine, just a representative signal.
 */
export function flattenResumeTextForTips(resume: ResumeData): string {
  const parts: string[] = [];
  parts.push(resume.sections.basics.summary ?? '');
  parts.push(resume.sections.basics.label ?? '');
  for (const s of resume.sections.skills) {
    parts.push(s.name, ...(s.keywords ?? []));
  }
  for (const w of resume.sections.work) {
    parts.push(w.description ?? '');
    for (const p of w.positions) {
      parts.push(p.title ?? '');
      if (p.highlights) parts.push(...p.highlights);
    }
  }
  for (const proj of resume.sections.projects ?? []) {
    parts.push(proj.name ?? '', proj.description ?? '');
    if (proj.highlights) parts.push(...proj.highlights);
  }
  for (const edu of resume.sections.education ?? []) {
    parts.push(
      edu.institution ?? '',
      edu.degree?.degreeLevel ?? '',
      ...(edu.degree?.majors ?? []),
      ...(edu.degree?.minors ?? [])
    );
  }
  for (const a of resume.sections.awards ?? []) {
    parts.push(a.title ?? '', a.awarder ?? '');
  }
  for (const pub of resume.sections.publications ?? []) {
    parts.push(pub.name ?? '', pub.publisher ?? '');
  }
  return parts.filter(Boolean).join(' ');
}

/**
 * Compute the JD tokens that the resume text does not contain. Mirrors
 * `ats-matching.ts > jobTokensWithoutStopWords` + token-set membership
 * check closely enough for actionable advice.
 */
export function computeMissingKeywords(
  job: JobPosting,
  resumeText: string
): string[] {
  const jobTokens = jobTokensWithoutStopWords(job);
  const resumeTokens = new Set(tokenizeLight(resumeText));
  const missing: string[] = [];
  for (const tok of jobTokens) {
    if (!resumeTokens.has(tok)) missing.push(tok);
  }
  return missing;
}

/**
 * For each JD requirement, return the bullet if NONE of its non-stop
 * tokens appear in the resume text. Mirrors the coverage check from
 * `ats-matching.ts > computeCoverageScore` — same token-set
 * membership semantics, no BM25.
 */
export function computeUncoveredRequirements(
  job: JobPosting,
  resumeText: string
): string[] {
  const requirements = job.requirements ?? [];
  if (requirements.length === 0) return [];
  const resumeTokens = new Set(tokenizeLight(resumeText));
  const uncovered: string[] = [];
  for (const req of requirements) {
    const tokens = tokenizeLight(req).filter((t) => !STOP_WORDS.has(t));
    if (tokens.length === 0) continue; // vacuously covered
    if (!tokens.some((t) => resumeTokens.has(t))) {
      uncovered.push(req);
    }
  }
  return uncovered;
}

/**
 * List of expected sections that are empty/missing in the resume.
 * Matches the four sections the engine scores (`scoreStructure`):
 * basics + work + education + skills. "Summary" specifically refers
 * to the `basics.summary` field — the `basics.label` (job title) is
 * tracked separately as part of the profile, not the summary.
 */
export function computeMissingSections(resume: ResumeData): string[] {
  const missing: string[] = [];
  if (!resume.sections.basics.summary?.trim()) missing.push('Summary');
  if (resume.sections.work.length === 0) missing.push('Experience');
  const edu = resume.sections.education ?? [];
  if (edu.length === 0) missing.push('Education');
  if (resume.sections.skills.length === 0) missing.push('Skills');
  return missing;
}

/**
 * Collect every `work[*].positions[*].highlights` string. Mirrors
 * `content-quality.ts > collectHighlights` — projects deliberately
 * excluded.
 */
export function collectHighlights(resume: ResumeData): string[] {
  const out: string[] = [];
  for (const job of resume.sections.work) {
    for (const pos of job.positions) {
      if (pos.highlights) out.push(...pos.highlights);
    }
  }
  return out.filter((h) => typeof h === 'string' && h.trim().length > 0);
}

/**
 * Cheap tokenization for tips. Same lowercase + `\W+` split + length
 * filter as `ats-matching.ts > tokensFromText`. Not used by the
 * scoring engine itself — just close enough for human-facing advice.
 */
export function tokenizeLight(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\W+/)
    .filter((t) => t.length >= 2);
}

/**
 * True when the JD has at least one v2-extracted priority skill
 * populated. Drives the v2 Intent Coverage dynamic tip branch
 * (mirrors the same gate the score-actions flag uses to decide
 * which weight set to apply).
 */
function hasV2Intent(job: JobPosting): boolean {
  return (
    (job.mustHaveSkills?.length ?? 0) +
      (job.niceToHaveSkills?.length ?? 0) +
      (job.implicitSkills?.length ?? 0) >
    0
  );
}

/**
 * v2 Intent Coverage dynamic tip — surfaces the per-priority miss
 * list with priority-bolded skill names. Reads like:
 *
 *   Missing 2 must-have infra skills: **Terraform, Helm**, plus
 *   1 nice-to-have: **Kustomize**.
 *
 * Returns `null` when every priority skill is present (no tip
 * needed). The cap mirrors `scoreIntentCoverageParams` in
 * `lib/scoring/dimensions/intent-coverage.ts` — three per priority
 * keeps the tooltip readable; counts beyond three get a "+N more"
 * tail.
 */
function buildIntentCoverageMissListTip(
  job: JobPosting,
  resumeText: string
): ReactNode {
  const resumeTextLower = resumeText.toLowerCase();
  const missedMustHave = findMissingForTip(
    job.mustHaveSkills ?? [],
    resumeTextLower,
    3
  );
  const missedNiceToHave = findMissingForTip(
    job.niceToHaveSkills ?? [],
    resumeTextLower,
    3
  );
  const missedImplicit = findMissingForTip(
    job.implicitSkills ?? [],
    resumeTextLower,
    3
  );

  if (
    missedMustHave.items.length === 0 &&
    missedNiceToHave.items.length === 0 &&
    missedImplicit.items.length === 0
  ) {
    return null;
  }

  // Use the ORIGINAL missed counts (not the truncated items.length)
  // for the pluralize wording — "Missing 5 must-have skills" even
  // when we only show the top 3 in the tooltip.
  const mustHaveTotal = missedMustHave.items.length + countTail(missedMustHave.tail);
  const niceToHaveTotal = missedNiceToHave.items.length + countTail(missedNiceToHave.tail);
  const implicitTotal = missedImplicit.items.length + countTail(missedImplicit.tail);

  return (
    <>
      {missedMustHave.items.length > 0 && (
        <>
          {pluralize(mustHaveTotal, 'must-have skill', 'must-have skills')}:{' '}
          <strong>{missedMustHave.items.join(', ')}</strong>
          {missedMustHave.tail}
          {missedNiceToHave.items.length > 0 || missedImplicit.items.length > 0
            ? ', plus '
            : '.'}
        </>
      )}
      {missedNiceToHave.items.length > 0 && (
        <>
          {pluralize(niceToHaveTotal, 'nice-to-have', 'nice-to-haves')}:{' '}
          <strong>{missedNiceToHave.items.join(', ')}</strong>
          {missedNiceToHave.tail}
          {missedImplicit.items.length > 0 ? ', plus ' : '.'}
        </>
      )}
      {missedImplicit.items.length > 0 && (
        <>
          {pluralize(implicitTotal, 'implicit skill', 'implicit skills')}:{' '}
          <strong>{missedImplicit.items.join(', ')}</strong>
          {missedImplicit.tail}.
        </>
      )}
    </>
  );
}

/**
 * Extract the "+N more" count from the tail string, or 0 if no tail.
 * Used to recover the original missed count for accurate pluralize
 * wording even after the items array is truncated for display.
 */
function countTail(tail: string): number {
  const match = /\(\+(\d+) more\)/.exec(tail);
  return match ? Number(match[1]) : 0;
}

/**
 * Find missing skills for the dynamic tip. Returns the items list
 * (capped at `maxItems`) plus a "+N more" tail when the original
 * list was longer.
 */
function findMissingForTip(
  skills: string[],
  resumeTextLower: string,
  maxItems: number
): { items: string[]; tail: string } {
  const missed: string[] = [];
  for (const skill of skills) {
    if (typeof skill !== 'string' || skill.length === 0) continue;
    if (!resumeTextLower.includes(skill.toLowerCase())) {
      missed.push(skill);
    }
  }
  const items = missed.slice(0, maxItems);
  const tail =
    missed.length > maxItems
      ? ` (+${missed.length - maxItems} more)`
      : '';
  return { items, tail };
}

/** Pluralize a noun. Singular / plural form passed explicitly so the
 * caller controls the exact wording (the tip is shown to candidates
 * in plain English).
 */
function pluralize(count: number, singular: string, plural: string): string {
  if (count === 1) return `Missing 1 ${singular}`;
  return `Missing ${count} ${plural}`;
}

function jobTokensWithoutStopWords(job: JobPosting): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (text: string) => {
    for (const t of tokenizeLight(text)) {
      if (STOP_WORDS.has(t)) continue;
      if (seen.has(t)) continue;
      seen.add(t);
      out.push(t);
    }
  };
  push(job.title ?? '');
  push(job.description ?? '');
  for (const r of job.requirements ?? []) push(r);
  for (const n of job.niceToHaves ?? []) push(n);
  for (const b of job.benefits ?? []) push(b);
  return out;
}

function titleTokens(title: string): string[] {
  return tokenizeLight(title).filter((t) => !STOP_WORDS.has(t));
}

function truncateRequirement(req: string): string {
  const trimmed = req.trim();
  if (trimmed.length <= 60) return trimmed;
  return trimmed.slice(0, 57) + '...';
}

/**
 * Join an array of nouns with commas and a final " and " — "A", "A and B",
 * "A, B, and C". Used for short lists like missing sections / soft skills.
 */
function joinWithAnd(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}
