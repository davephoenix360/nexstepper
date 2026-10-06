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

/**
 * Rotating headlines. Picked at random once per modal open.
 *
 * v2 (Oct 2026): dropped the trailing emoji and the playful adjectives
 * ("fantabulous", "stardust", "like a boss"). The earlier copy read as
 * casual; v2.1 ships calmer, more product-grade language that pairs
 * better with the redesigned modal — Linear/Stripe-grade restraint
 * instead of consumer-app cheer. Length is intentionally under the 4 s
 * headline rotation so each headline is fully readable in one cycle.
 */
export const PARSING_HEADLINES: readonly string[] = [
  'Preparing your resume',
  'Reading through your experience',
  'Structuring your accomplishments',
  'Polishing your bullet points',
  'Organizing your timeline',
  'Highlighting your impact',
  'Refining your professional story',
  'Sorting your skills and projects',
  'Reviewing the details'
] as const;

/** How often the headline changes. Long enough to actually be read. */
export const HEADLINE_INTERVAL_MS = 4_000;

/* --------------------------------------------------------------------------
 * Tip duration — dynamic per tip, based on word count.
 *
 * The previous (single) `TIP_INTERVAL_MS = 6_000` constant meant long
 * tips (≈30 words) flashed by faster than the user could read them, and
 * short tips sat on screen longer than they needed to. v2 computes the
 * per-tip display duration from the tip's word count at the standard
 * auto-rotating-slide reading rate, so the carousel feels like it's
 * respecting the reader's pace.
 *
 * Reading-speed anchor (3 WPS = ~180 WPM)
 *   The Nielsen Norman Group auto-rotating-slide guideline is "1 second
 *   per 3 words" (Smashing Magazine, "Designing Better Carousel UX",
 *   2022). Brysbaert's 2019 meta-analysis of 190 studies and 17,887
 *   participants puts average silent adult non-fiction reading at 238
 *   WPM, but screen reading runs ~10% slower (≈214 WPM) and a
 *   carousel/loading-modal context isn't true silent reading — the
 *   user is also doing something else (waiting, glancing up from
 *   another tab). 180 WPM is the conservative figure the carousel UX
 *   literature converges on, and it gives the user breathing room.
 *
 * Floor and ceiling
 *   NN/G also recommends a minimum of 5–7 s for short headings so the
 *   carousel doesn't feel twitchy, and a sensible upper bound so a
 *   one-off long tip doesn't stall the rotation. We use 5 s floor and
 *   15 s ceiling.
 * + FADE_PADDING_MS
 *   The component fades between tips; that's overhead, not reading
 *   time, so we don't double-count it in the formula. It is exposed
 *   separately so callers that don't fade can add it themselves.
 * -------------------------------------------------------------------------- */

/** Words-per-second the carousel assumes. See note above. */
export const TIP_WORDS_PER_SECOND = 3;

/** Minimum display duration per tip, regardless of how short the text is. */
export const TIP_MIN_DURATION_MS = 5_000;

/** Maximum display duration per tip — prevents one long tip from stalling. */
export const TIP_MAX_DURATION_MS = 15_000;

/**
 * Count words in a tip. Whitespace-split, ignoring empty tokens. Punctuation
 * glued to a word (e.g. "deployments") counts as part of the word. Em-dashes
 * ("—") and quotes are stripped because they're not actually read; an em-dash
 * in "start each bullet with a verb, then add a number" is silent.
 */
export function tipWordCount(text: string): number {
  // Strip non-word punctuation that would inflate the count: em-dash,
  // en-dash, ellipsis, curly quotes. (Hyphens INSIDE words — "well-built"
  // — should count as part of the word, so we leave ASCII hyphens alone.)
  const cleaned = text
    .replace(/[—–…]/g, ' ')
    .replace(/[""'']/g, '');
  return cleaned.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * How long a tip should stay on screen, given its text. Pure & sync — safe
 * to call inside React render to drive a per-tip `setTimeout`.
 *
 * Returns the clamped value in milliseconds:
 *   `clamp((wordCount / TIP_WORDS_PER_SECOND) * 1000,
 *          TIP_MIN_DURATION_MS,
 *          TIP_MAX_DURATION_MS)`
 *
 * Worked examples (with TIP_WORDS_PER_SECOND = 3, MIN = 5000, MAX = 15000):
 *   12-word tip → 4000 ms → clamped to 5000 ms (floor)
 *   20-word tip → 6667 ms
 *   30-word tip → 10000 ms
 *   45-word tip → 15000 ms → clamped to 15000 ms (ceiling)
 */
export function tipDurationMs(text: string): number {
  const words = tipWordCount(text);
  const readingMs = (words / TIP_WORDS_PER_SECOND) * 1000;
  return Math.min(
    TIP_MAX_DURATION_MS,
    Math.max(TIP_MIN_DURATION_MS, readingMs)
  );
}

export type ResumeTipCategory = 'resume' | 'cover-letter' | 'nexstepper';

export interface ResumeTip {
  category: ResumeTipCategory;
  /** Emoji shown next to the tip. Kept — they're contextual mnemonics. */
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
