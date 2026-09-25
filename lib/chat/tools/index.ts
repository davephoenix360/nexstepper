import 'server-only';

import { editResumeArgsSchema, switchTemplateArgsSchema } from './types';

/**
 * Tool definitions for the AI chat assistant.
 *
 * These MUST match the exact shape the AI SDK expects in the
 * `tools` array of a `streamText` / `generateText` call:
 * `{ name, description, parameters }` where `parameters` is a
 * `$schema`-compatible JSON schema object (not a Zod schema).
 *
 * We derive the JSON schema from our Zod schemas so there's one
 * canonical definition and no drift.
 */
export const CHAT_TOOLS = [
  {
    name: 'editResume',
    description:
      'Edit the user\'s resume. Call this when the user asks you to make a specific change — e.g. "add a new job", "update my email", "rewrite the summary". Merge your partial changes into the existing resume. Never call this without user instruction.',
    parameters: editResumeArgsSchema as {
      // The AI SDK's `parameters` must be a plain JSON-schema object.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      [key: string]: any;
    }
  },
  {
    name: 'switchTemplate',
    description:
      'Change the active resume template. Call this when the user asks to switch templates — e.g. "use the modern template" or "switch to the executive style". Valid IDs: minimal, classic, executive, creative, modern.',
    parameters: switchTemplateArgsSchema as {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      [key: string]: any;
    }
  }
] as const;

export type ChatToolName = (typeof CHAT_TOOLS)[number]['name'];
