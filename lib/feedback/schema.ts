/**
 * Zod schemas + types for the user-feedback feature.
 *
 * Single source of truth for the wire-shape of a feedback submission,
 * shared between the server action (`submitFeedbackAction`) and any
 * future client-side validation. Keep the user-facing error messages
 * here too so the form can render them directly.
 */
import { z } from 'zod';

/**
 * Coarse category. We deliberately keep the enum tiny — the message
 * body is the real signal. Triage on a label-style dropdown is plenty
 * for an early-stage product; we can add `'praise'` / `'question'`
 * later without a migration.
 */
export const FEEDBACK_CATEGORIES = ['bug', 'idea', 'other'] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

/**
 * Display copy for the category radio group. Kept in this file (not
 * the component) so it's findable from the same place as the type
 * definition and so any future admin / analytics view can reuse it.
 */
export const FEEDBACK_CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  bug: 'Something is broken',
  idea: 'I have an idea',
  other: 'Something else'
};

/**
 * Per-category prompts for the message field. The form swaps these
 * in as the user toggles the radio, so the prompt always matches
 * the kind of feedback being collected. ("What broke?" focuses the
 * user on reproduction; "What did you have in mind?" invites
 * aspiration; "What's on your mind?" is the open-ended fallback.)
 *
 * Variant of placeholder chosen by the component is the
 * shorter-at-the-top one (dialog uses a tighter copy because the
 * field is shorter and the user is already mid-flow).
 */
export const FEEDBACK_CATEGORY_PROMPTS: Record<FeedbackCategory, string> = {
  bug: 'What broke?',
  idea: 'What did you have in mind?',
  other: 'What’s on your mind?'
};

export const FEEDBACK_CATEGORY_PLACEHOLDERS: Record<
  FeedbackCategory,
  { page: string; dialog: string }
> = {
  bug: {
    page:
      'What you were doing, what you expected, and what actually happened. Screenshots and steps to reproduce are gold.',
    dialog:
      'Tell us what you were doing and what happened. Even one sentence helps.'
  },
  idea: {
    page:
      'The feature, who it’s for, and why it would matter. A rough sketch or a competitor’s example is welcome — we’ll figure out the rest.',
    dialog: 'A sentence or two is plenty. We’ll follow up if we have questions.'
  },
  other: {
    page:
      'A question, a kind word, a billing query, anything. We read every note personally.',
    dialog: 'Anything you want to say. Even a single line is useful.'
  }
};

/** Hard cap on message length. Keeps a single row from blowing up the DB. */
export const FEEDBACK_MESSAGE_MAX = 5_000;
/** Minimum message length — anything shorter is almost certainly noise / spam. */
export const FEEDBACK_MESSAGE_MIN = 10;

/** Soft cap on the optional reply-to email length. */
export const FEEDBACK_EMAIL_MAX = 254; // RFC 5321 limit.

/**
 * Wire shape of a feedback submission. Validated with `safeParse` on
 * the server; the form mirrors these constraints client-side as a UX
 * nicety, but never as a security boundary.
 */
export const feedbackInputSchema = z.object({
  message: z
    .string()
    .trim()
    .min(
      FEEDBACK_MESSAGE_MIN,
      `Please write at least ${FEEDBACK_MESSAGE_MIN} characters so we have something to work with.`
    )
    .max(
      FEEDBACK_MESSAGE_MAX,
      `Message is too long (max ${FEEDBACK_MESSAGE_MAX.toLocaleString()} characters).`
    ),
  category: z.enum(FEEDBACK_CATEGORIES, {
    message: 'Pick a category so we can route this correctly.'
  }),
  /** Optional reply-to. Validated as a real email but never required. */
  email: z
    .string()
    .trim()
    .max(FEEDBACK_EMAIL_MAX, 'That email looks too long.')
    .email('That email address doesn\u2019t look right.')
    .optional()
    .or(z.literal(''))
});

export type FeedbackInput = z.infer<typeof feedbackInputSchema>;

/**
 * Result shape returned by `submitFeedbackAction`. Mirrors the
 * `ActionResult<T>` discriminated union used elsewhere in the app
 * (`app/(dashboard)/dashboard/resumes/actions.ts`) so callers get
 * a consistent `if (result.ok) result.data.…` narrowing.
 */
export type SubmitFeedbackResult =
  | { ok: true; data: { feedbackId: string; githubSynced: boolean } }
  | {
      ok: false;
      error: string;
      fieldErrors?: Record<string, string[]>;
    };

/**
 * Count URL-like substrings in a message. We cap this to keep the
 * public form from being abused as a backlink farm — three is a
 * comfortable ceiling for legitimate "this other thing exists, also
 * check this doc, also check this repo" feedback.
 */
export const FEEDBACK_MAX_URLS = 3;
export function countUrls(text: string): number {
  // Tolerant matcher: http(s):// or www. — false positives are fine
  // here since the user is already past the message-length floor.
  const matches = text.match(/\b(?:https?:\/\/|www\.)\S+/gi);
  return matches ? matches.length : 0;
}
