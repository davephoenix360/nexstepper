import 'server-only';

import { editResumeArgsSchema, switchTemplateArgsSchema } from './types';

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
      'Valid IDs: minimal, classic, executive, creative, modern.',
      '',
      'Call this when the user asks to change the look or style of their resume —',
      '"use the modern one", "switch to a simpler design", "make this look more',
      'professional".'
    ].join('\n'),
    parameters: switchTemplateArgsSchema
  }
} as const;

export type ChatToolName = keyof typeof CHAT_TOOLS;
