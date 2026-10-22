import 'server-only';

import { templateListForPrompt } from '../templates';
import {
  editResumeArgsSchema,
  getAtsScoreArgsSchema,
  switchTemplateArgsSchema
} from './types';

/**
 * Tool definitions for the AI chat assistant.
 *
 * These MUST match the exact shape the AI SDK expects in the `tools` object of
 * a `streamText` / `generateText` call: `{ description, parameters }` where
 * `parameters` is a schema the SDK can convert (we hand it our Zod schemas, and
 * the route remaps the key to the SDK's `inputSchema`).
 *
 * We derive the schemas from our Zod definitions so there's one canonical
 * definition and no drift.
 *
 * ## Descriptions are load-bearing
 *
 * The description is the only thing the model sees when deciding whether a
 * change is "editable". Both tools below are written to be *permissive about
 * intent* rather than restrictive: the previous version of `editResume` said
 * "Never call this without user instruction", which trained the model to sit
 * on its hands when a user said something as ordinary as "I don't like my
 * summary". The system prompt carries the safety rules; the description
 * carries the affordances.
 */
export const CHAT_TOOLS = {
  /**
   * The main editing tool. Surgical by design — the model names what to change
   * and which entry to change it on, and never has to echo the user's resume
   * back. See `./types.ts` for the full rationale.
   */
  editResume: {
    description: [
      'Edit the user\'s resume.',
      '',
      'Use this for ANY change to resume content — rewriting the summary, adding or',
      'removing a job, fixing a typo, tightening bullet points, swapping a skill,',
      'updating contact details, changing the headline.',
      '',
      'When the user expresses dissatisfaction ("I don\'t like my summary", "this',
      'sounds too generic", "make it stronger") that IS a request to edit. Propose a',
      'rewrite in your reply AND call this tool with the new text — do not wait to be',
      'asked twice.',
      '',
      'You only need to send the fields that change. Everything you omit is left',
      'exactly as it is, so never resend content you are not changing.',
      '',
      'To edit an existing entry, match it with `matchCompany` (and `matchRole` when',
      'a company has more than one role). To create something new use `addWork` /',
      '`addEducation` / `addProject` / `addSkills`.',
      '',
      '`addSkills` merges keywords into an existing category, so "add Python" keeps',
      'the user\'s other skills.'
    ].join('\n'),
    parameters: editResumeArgsSchema
  },

  switchTemplate: {
    description: [
      'Change which template the resume renders with.',
      '',
      // Derived from the registry via `../templates`, NOT hand-listed. This list
      // used to be a hardcoded string that silently fell behind: it named five
      // templates while the registry had six, so the model had no way to know
      // the Jake template existed and "switch to the jake template" could only
      // fail. A missing id here is invisible — no type error, no test, no
      // warning — it just makes that template unreachable from chat.
      `Valid IDs: ${templateListForPrompt()}.`,
      '',
      'Call this when the user asks to change the look or style of their resume —',
      '"use the modern one", "switch to a simpler design", "make this look more',
      'professional".'
    ].join('\n'),
    parameters: switchTemplateArgsSchema
  },

  getAtsScore: {
    description: [
      'Get the current ATS match score for this resume against the attached job description.',
      '',
      'Call this AFTER making an edit, to check whether the edit actually moved the',
      'score — and to tell the user what changed. The score in your context was',
      'computed before this turn\'s edits, so it is stale once you edit anything.',
      '',
      'Returns the overall score, every dimension, and which skills are still',
      'missing. Use it to prioritise: fixing the weakest dimension is worth more',
      'than polishing a strong one.'
    ].join('\n'),
    parameters: getAtsScoreArgsSchema
  }
} as const;

export type ChatToolName = keyof typeof CHAT_TOOLS;
