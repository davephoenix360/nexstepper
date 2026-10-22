/**
 * The prompts people actually type to a resume AI.
 *
 * ## Why this module exists
 *
 * Every user of a resume tool opens ChatGPT and types the same handful
 * of things. The classic first prompt — "fine tune this for this job
 * description, make it one to two pages, keep only the relevant stuff,
 * make sure the ATS score improves" — is the WORKFLOW, not a special
 * request. If the product can run it for them, it should; if they want
 * to run it themselves, the prompt should be one click away.
 *
 * So the same strings serve two surfaces:
 *
 *   - the suggestion chips under an empty chat
 *   - the automatic first run when a variant is created from a JD
 *
 * One source, so the two can never drift apart.
 */

export interface SuggestedPrompt {
  /** Short label for the chip button. */
  label: string;
  /** The full prompt sent to the assistant. */
  prompt: string;
}

const GENERIC: SuggestedPrompt[] = [
  {
    label: 'Improve my resume',
    prompt:
      'Review my resume end to end and improve it. Focus on the biggest wins first: sharpen my summary, make every bullet show a measurable result, and cut anything that is not pulling its weight. Tell me what you changed and why.'
  },
  {
    label: 'Rewrite my bullets',
    prompt:
      'Rewrite the bullets in my experience section so each one leads with a strong action verb and ends with a measurable result. Keep every fact I wrote — do not invent numbers, and if a bullet needs a metric I have not given you, ask me for it.'
  },
  {
    label: 'Strengthen my summary',
    prompt:
      'Rewrite my summary so it reads like a professional wrote it for this specific role: two to four lines, no restating of job titles, no generic claims, and no filler words like "hard-working" or "results-driven".'
  },
  {
    label: 'Make it one page',
    prompt:
      'Help me get this resume onto one page. First tell me roughly how long it is and where the space is going. Then work out what to cut — and offer me the choice between trimming content and tightening the layout, since tightening the layout is free and cutting my work is not.'
  },
  {
    label: 'What is weak?',
    prompt:
      'Be blunt. What are the three weakest parts of this resume, and what specifically should I change about each one? Skip the encouragement and give me the critique.'
  }
];

const WITH_JOB: SuggestedPrompt[] = [
  {
    label: 'Tailor it to this job',
    prompt:
      'Tailor this resume to the job description I attached. Cut anything that is not relevant to this role, reorder what is left so the most relevant experience comes first, and rewrite the bullets that need it. Keep every fact I wrote — never invent a skill or a number — and tell me what you changed and why.'
  },
  {
    label: 'Trim to 1–2 pages',
    prompt:
      'Get this resume down to one or two pages while keeping it strong for this job. Work out where the space is going first, then offer me the choice between hiding sections from the PDF, tightening the layout, and cutting content — and only cut content that is genuinely irrelevant to this role.'
  },
  {
    label: 'Improve my ATS score',
    prompt:
      'Check my ATS score for this job, tell me which dimension is costing me the most, and fix that one first. Then re-score it and tell me what actually moved.'
  },
  {
    label: 'What is missing?',
    prompt:
      'Compare my resume against the job description. What required skills does the job ask for that I do not show evidence for? Be specific, and do not suggest anything I have not already done — if you think I should add something, ask me first.'
  }
];

/**
 * The prompt suggestions for a chat, given whether the resume has a job
 * description attached.
 *
 * With a JD the suggestions are JD-specific, because that is the mode
 * the product is actually for — a variant with a JD is the whole point
 * of the flow. Without one, the generic craft prompts apply.
 */
export function suggestedPrompts(hasJobContext: boolean): SuggestedPrompt[] {
  return hasJobContext ? WITH_JOB : GENERIC;
}

/**
 * The prompt to run automatically when a variant is created from a job
 * description.
 *
 * This is the prompt the user would have typed first, verbatim in
 * intent: fine-tune for this JD, keep it to one or two pages, keep only
 * what is relevant, and improve the ATS score.
 *
 * It is a single message on purpose — the agent decides what order to
 * work in, and the tools it has now let it measure as it goes.
 */
export const AUTO_TAILOR_PROMPT =
  'Tailor this resume to the job description I just attached. Get it down to one or two pages, keep only what is relevant to this role, rewrite the bullets that need it, and improve the ATS score. Keep every fact I wrote — never invent a skill, a number, or an accomplishment. If a bullet needs a metric I have not given you, ask me for it. Start by telling me what you are going to change, then make the changes.';

/**
 * The first prompt to offer when the user opens a chat on a resume that
 * was JUST created from a JD — the agent has already reviewed it, so the
 * natural next step is the tailoring pass.
 */
export const AUTO_TAILOR_CHIP: SuggestedPrompt = {
  label: 'Tailor it to this job',
  prompt: AUTO_TAILOR_PROMPT
};
