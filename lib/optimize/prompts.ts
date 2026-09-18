/**
 * Optimize tool — system + user prompts for the rewrite model.
 *
 * The Optimize tool rewrites a specific section of the candidate's
 * resume to better match a target job description. It is NOT a
 * "generate a new resume from a JD" tool — it preserves the
 * candidate's existing content and only improves phrasing, keyword
 * alignment, and impact framing.
 *
 * ## What "Optimize" does NOT do
 *
 * - Invent experience the candidate doesn't have.
 *   "Add Kubernetes to your resume" is bad; "rewrite your bullet so
 *   the Kubernetes work you already did surfaces" is good.
 * - Change the candidate's voice drastically.
 *   We aim for "this still sounds like them, just sharper."
 * - Add metrics the candidate didn't claim.
 *   "Improved performance by 50%" needs a source — we leave that
 *   to the user to fill in.
 *
 * ## Why one prompt per section type
 *
 * `basics.summary` is a free-text bio paragraph. `work[].highlights`
 * is a bulleted list. `skills` is a flat tag list. Each rewards a
 * different rewrite style:
 *
 * - Summary: integrate keywords naturally, tighten the value prop,
 *   keep it under ~5 sentences
 * - Highlights: lead with action verbs, quantify where the source
 *   allows, surface JD-relevant keywords that are already in the
 *   candidate's experience
 * - Skills: re-rank / add only keywords the JD asks for that the
 *   candidate already lists somewhere in their resume (we do NOT
 *   invent skills)
 *
 * The dispatch is in `optimize-resume.ts`, not here. This file
 * just defines the strings.
 */

/**
 * System prompt shared by all section types. Establishes the role
 * and the hard "do not invent" rule.
 */
export const OPTIMIZER_SYSTEM_PROMPT = `You are an expert resume editor. Your job is to rewrite a specific section of the candidate's existing resume so it surfaces more clearly against a target job description.

Hard rules — these override any other instruction:

1. NEVER invent facts. If the candidate hasn't claimed a metric, a tool, a company, or an outcome, do NOT add it. You may REWRITE what they've said; you may not ADD to it.

2. NEVER change dates, employers, schools, or other identifying facts. Treat the input as the ground truth for who the candidate is.

3. Stay close to the candidate's voice. If their writing is plain and direct, don't suddenly make it flowery. If they use "I" or "we", keep that register.

4. Where the JD asks for something the candidate already mentions elsewhere in their resume, SURFACE it in the section you're rewriting. For example, if the JD asks for "Kubernetes" and the candidate mentions it in a work bullet, make sure the summary mentions it too.

5. Do not add generic filler ("passionate professional", "team player", etc.). If the original section has filler, you may tighten it out — but only when tightening makes the section more truthful, not less.

6. Match the section's natural shape. A summary is a paragraph. A bullet is one short sentence. Don't turn bullets into prose or vice versa.

7. Don't lie to flatter the JD. The output should be what the candidate genuinely is, not what the JD wants to hear.

Output ONLY the rewritten section text. No preamble, no "Here's your rewrite:", no trailing commentary. Just the section content, ready to drop into the resume.`;

interface SummaryPromptArgs {
  currentSummary: string;
  jdText: string;
}

/**
 * User prompt for the basics.summary section. Summary is the
 * highest-impact section on a resume (the first thing a recruiter
 * reads), so we allocate the most guidance to it.
 */
export function buildSummaryUserPrompt({
  currentSummary,
  jdText
}: SummaryPromptArgs): string {
  // Treat whitespace-only as "no summary written" so the model
  // gets the same fresh-write instruction instead of a block of
  // spaces that confuses its context window accounting.
  const trimmed = currentSummary?.trim() ?? '';
  const summaryBlock = trimmed
    ? trimmed
    : '(the candidate has not written a summary yet — write a fresh one from what you can infer is missing or generic)';

  return `<job_description>
${jdText}
</job_description>

<current_summary>
${summaryBlock}
</current_summary>

Rewrite the candidate's summary so it:
- Leads with the candidate's strongest fit for THIS specific JD (don't lead with generic years-of-experience statements)
- Surfaces 2-4 specific keywords from the JD that match real skills/experience in the candidate's resume
- Stays under 5 sentences (~600-900 chars)
- Does NOT prefix with "Experienced professional" or any other generic opener
- Does NOT add experience, employers, or metrics that aren't already in the resume

Output only the rewritten summary text.`;
}

interface WorkHighlightsPromptArgs {
  positionTitle: string;
  company: string;
  currentHighlights: string[];
  jdText: string;
}

/**
 * User prompt for rewriting a single work entry's highlights.
 *
 * Future work — not wired into v0. Kept here so the next section
 * type is one PR away from shipping.
 */
export function buildWorkHighlightsUserPrompt({
  positionTitle,
  company,
  currentHighlights,
  jdText
}: WorkHighlightsPromptArgs): string {
  return `<job_description>
${jdText}
</job_description>

<current_highlights role="${positionTitle}" company="${company}">
${currentHighlights.map((h, i) => `${i + 1}. ${h}`).join('\n')}
</current_highlights>

Rewrite the highlights so they:
- Lead with action verbs (no "Was responsible for", "Helped with", etc.)
- Surface 1-3 keywords from the JD that match the real work already described
- Preserve the original meaning — same projects, same outcomes, same scope
- Do NOT add metrics, percentages, or numbers that aren't already present
- Stay one bullet per highlight — don't merge bullets together

Output only the rewritten bullets, one per line.`;
}
