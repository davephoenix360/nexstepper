import 'server-only';

import { templateListForPrompt } from '../templates';
import {
  editResumeArgsSchema,
  estimatePageCountArgsSchema,
  getAtsScoreArgsSchema,
  getPrintSettingsArgsSchema,
  switchTemplateArgsSchema,
  updatePrintHiddenSectionsArgsSchema,
  updatePrintSettingsArgsSchema,
  validateResumeArgsSchema
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
  },

  getPrintSettings: {
    description: [
      'Read the page-layout settings for this resume: margin, line height,',
      'font size, the spacing between sections, and the spacing between',
      'entries inside a section.',
      '',
      'Call this when the user says the resume is the wrong length, looks',
      'cramped, or looks too sparse — before changing anything. These five',
      'knobs are how you fit a resume onto fewer pages WITHOUT cutting',
      'content.'
    ].join('\n'),
    parameters: getPrintSettingsArgsSchema
  },

  updatePrintSettings: {
    description: [
      'Change the page-layout settings for this resume.',
      '',
      'Send only the settings you are changing; anything you omit keeps its',
      'current value.',
      '',
      'Values: margin (compact = 0.5in, standard = 0.75in, generous = 1in),',
      'lineHeight (compact / standard / relaxed), fontSize (small = 10pt,',
      'standard = 11pt, large = 12pt), sectionSpacing (compact / standard /',
      'relaxed) between major sections, itemSpacing (compact / standard /',
      'relaxed) between entries inside a section.',
      '',
      'Order of operations for "make it fit on one page": cut content first,',
      'then tighten margin and line height. Never cut content you need in',
      'order to avoid tightening the layout.'
    ].join('\n'),
    parameters: updatePrintSettingsArgsSchema
  },

  validateResume: {
    description: [
      'Check that this resume will save, without saving it.',
      '',
      'Call this when the user says they cannot save, or when a change might',
      'break the document. Returns the exact fields that are blocking the',
      'save, so you can repair them or tell the user precisely what is wrong.',
      '',
      'You can optionally pass `proposedEdit` — the same operations as',
      'editResume — to check whether a change you are about to make would',
      'save. Nothing is written either way.'
    ].join('\n'),
    parameters: validateResumeArgsSchema
  },

  updatePrintHiddenSections: {
    description: [
      'Hide or show sections in the PRINTED document (the PDF).',
      '',
      'Hiding a section does NOT delete it — the user can still see and edit it',
      'in the editor, it just does not appear in the PDF they submit. Say that',
      'when you use this, so they do not think their work was thrown away.',
      '',
      'This is often the cheapest way to fit a page: hiding a section costs',
      'nothing from the content, while tightening the layout only buys a',
      'little. Prefer it over cutting work the user wrote.',
      '',
      'Valid section slugs: experience, skills, projects, education, awards,',
      'certificates, publications, volunteer, languages, interests, references.'
    ].join('\n'),
    parameters: updatePrintHiddenSectionsArgsSchema
  },

  estimatePageCount: {
    description: [
      'Estimate how many pages this resume will print on, and what would',
      'bring it down.',
      '',
      'Call this whenever the user asks about length: "is this one page?",',
      '"how long is this?", "will this fit?", "what do I cut?". It returns',
      'the estimated page count, the content height in inches, where that',
      'height went, and — for each visible section — how many inches hiding',
      'it would save and what the resume would then print as.',
      '',
      'The numbers are measured, not guessed: real resumes were printed',
      'through the real templates and their PDF pages counted. But the',
      'assistant cannot render the document, so treat the result as an',
      'estimate and say "about" when it is close to a page boundary.',
      '',
      'Call it BEFORE proposing to cut content, so you can show what the',
      'free options (hiding a section, tightening the layout) would buy',
      'first.'
    ].join('\n'),
    parameters: estimatePageCountArgsSchema
  }
} as const;

export type ChatToolName = keyof typeof CHAT_TOOLS;
