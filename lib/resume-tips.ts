/**
 * Copy for the AI-resume-parsing loading modal.
 *
 * AI import genuinely takes 30–90 seconds (text extraction, then a large
 * strict-JSON parse against the full `ResumeSections` schema). That is a long
 * time to stare at a spinner, and the Sep 28 latency audit found it was
 * driving abandonment.
 *
 * The modal turns dead time into two things at once:
 *   1. A rotating headline so the wait has some personality.
 *   2. A rotating tip carousel that teaches the user something genuinely
 *      useful about resumes, cover letters, or how to use Nexstepper —
 *      so a user who is waiting for their first import is also learning the
 *      product.
 *
 * Kept in its own module (no React) so the copy is testable and so the modal
 * component stays presentational.
 */

/** Rotating headlines. Picked at random once per modal open. */
export const PARSING_HEADLINES: readonly string[] = [
  'Preparing your fantabulous resume ✨',
  'Sprinkling some stardust on your career 🌟',
  'Wrangling your work history into shape 🧵',
  'Teaching your bullets to tell a story 📖',
  'Polishing every comma and keyword 💎',
  'Rolling up your achievements like a boss 🚀',
  'Untangling your timeline ⏳',
  'Making your experience sound as good as it was 🏆',
  'Reading between the lines of your CV 🔍',
  'Giving your skills a proper spotlight 🎯',
  'Fetching your quantifications out of hiding 📊',
  'Making this the best version of you yet 🌈'
] as const;

/** How often the headline changes. Long enough to actually be read. */
export const HEADLINE_INTERVAL_MS = 4_000;

/** How often the tip changes. */
export const TIP_INTERVAL_MS = 6_000;

export type ResumeTipCategory = 'resume' | 'cover-letter' | 'nexstepper';

export interface ResumeTip {
  category: ResumeTipCategory;
  /** Emoji shown next to the tip. */
  emoji: string;
  text: string;
}

/**
 * The tip carousel.
 *
 * Three roughly-equal categories on purpose. The product tips exist because
 * the single most confusing thing about Nexstepper — that a *master* resume
 * is the general one you maintain, and a *variant* is a per-job tailored copy
 * — is exactly what a new user needs to know while they are waiting for
 * their first import to land.
 */
export const RESUME_TIPS: readonly ResumeTip[] = [
  // ─── Resume craft ────────────────────────────────────────────────────────
  {
    category: 'resume',
    emoji: '📏',
    text: 'Keep it to one or two pages. If it runs longer, the oldest roles are usually the ones costing you space.'
  },
  {
    category: 'resume',
    emoji: '🔢',
    text: 'Start each bullet with a verb, then add a number where you honestly have one — "cut deploy time 40%" beats "helped with deployments" every time.'
  },
  {
    category: 'resume',
    emoji: '🧩',
    text: 'Mirror the job description\'s own vocabulary. If the posting says " stakeholder management ", do not write " people skills ".'
  },
  {
    category: 'resume',
    emoji: '✂️',
    text: 'Delete your pronouns, your full street address, and your references ("References available on request" is the modern default).'
  },
  {
    category: 'resume',
    emoji: '🎓',
    text: 'Your GPA only helps if it is strong. Leave it out otherwise and let your projects do the talking.'
  },
  {
    category: 'resume',
    emoji: '🗂️',
    text: 'Group skills into categories like "Backend" or "Languages" instead of one long undifferentiated list — it scans much faster.'
  },
  {
    category: 'resume',
    emoji: '📅',
    text: 'Use consistent date formats everywhere. Mixed "Jan 2020" and "01/2020" reads as careless to a human reviewer.'
  },
  {
    category: 'resume',
    emoji: '💡',
    text: 'A summary is not a biography. Two or three lines on what you do, what you are good at, and what you want next.'
  },

  // ─── Cover letters ───────────────────────────────────────────────────────
  {
    category: 'cover-letter',
    emoji: '✉️',
    text: 'Never send "Dear Hiring Manager". Name the person if you can — it is the fastest way to look like you actually read the posting.'
  },
  {
    category: 'cover-letter',
    emoji: '🎯',
    text: 'The first line should answer "why this company, why this role" in one sentence. Everything after that is evidence.'
  },
  {
    category: 'cover-letter',
    emoji: '🔗',
    text: 'Quote something specific from the job description and show you can already do it. It turns a generic letter into a targeted one.'
  },
  {
    category: 'cover-letter',
    emoji: '📄',
    text: 'A cover letter is an argument, not a resume in prose. Pick two or three accomplishments and make the case, rather than listing everything.'
  },
  {
    category: 'cover-letter',
    emoji: '🖊️',
    text: 'Keep it under 300 words. Recruiters skim, and a long letter guarantees the top gets skimmed too.'
  },
  {
    category: 'cover-letter',
    emoji: '🔍',
    text: 'Match the company\'s own words about themselves — their mission line, their product names. It shows you did the reading.'
  },

  // ─── Using Nexstepper ────────────────────────────────────────────────────
  {
    category: 'nexstepper',
    emoji: '🗝️',
    text: 'A master resume is the general one for a whole type of role — keep it current, and keep it clean. Variants are the tailored copies you make per job.'
  },
  {
    category: 'nexstepper',
    emoji: '🌱',
    text: 'The workflow is: keep one master for your field → paste a job description → get a tailored variant for that specific role. Your master never gets wrecked.'
  },
  {
    category: 'nexstepper',
    emoji: '🎚️',
    text: 'The ATS score has seven weighted dimensions. Fix the lowest one first — moving a 30 up to a 60 helps far more than nudging a 90.'
  },
  {
    category: 'nexstepper',
    emoji: '💬',
    text: 'You can just tell the assistant what you dislike. "I don\'t like this summary" is enough — it will rewrite it and tell you what it changed.'
  },
  {
    category: 'nexstepper',
    emoji: '🖨️',
    text: 'To get a PDF, use your browser\'s Print → Save as PDF. It gives you the same layout on screen and on paper.'
  },
  {
    category: 'nexstepper',
    emoji: '🔒',
    text: 'Every edit is saved as a revision, so nothing is ever lost. You can always step back if an AI rewrite misses the mark.'
  },
  {
    category: 'nexstepper',
    emoji: '📤',
    text: 'Need a second pair of eyes? Generate a share link and send it to a friend or mentor — they can view it without an account.'
  }
] as const;

/**
 * Pick a headline deterministically from a seed.
 *
 * Exported (rather than calling `Math.random()` inline in the component) so
 * tests can assert the rotation logic without stubbing globals.
 */
export function pickHeadline(seed: number): string {
  const list = PARSING_HEADLINES;
  const index = Math.abs(Math.trunc(seed)) % list.length;
  return list[index];
}

/**
 * Pick a tip for a given carousel position, cycling through the full list.
 */
export function pickTip(index: number): ResumeTip {
  return RESUME_TIPS[Math.abs(Math.trunc(index)) % RESUME_TIPS.length];
}
