import 'server-only';

import { editResumeArgsSchema, switchTemplateArgsSchema } from './tools/types';
import type { EditResumeArgs, SwitchTemplateArgs } from './tools/types';

/**
 * Dispatch a tool call from the AI to the appropriate handler.
 *
 * Tool calls come from the AI SDK as `{ name: string, args: unknown }`.
 * We validate the args with Zod before dispatching to keep malformed
 * inputs from propagating into the DB layer.
 *
 * Returns a plain serialisable result. The caller is responsible for
 * formatting this as an `tool_result` message back to the AI / DB.
 */
export async function executeTool(
  resumeId: string,
  name: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  args: any
): Promise<{ ok: true; result: unknown } | { ok: false; error: string }> {
  switch (name) {
    case 'editResume': {
      const parsed = editResumeArgsSchema.safeParse(args);
      if (!parsed.success) {
        return {
          ok: false,
          error: `Invalid editResume arguments: ${parsed.error.message}`
        };
      }
      const { executeEditResume } = await import('./tools/edit-resume');
      return await executeEditResume(resumeId, parsed.data as EditResumeArgs);
    }

    case 'switchTemplate': {
      const parsed = switchTemplateArgsSchema.safeParse(args);
      if (!parsed.success) {
        return {
          ok: false,
          error: `Invalid switchTemplate arguments: ${parsed.error.message}`
        };
      }
      const { executeSwitchTemplate } = await import('./tools/switch-template');
      return await executeSwitchTemplate(
        resumeId,
        parsed.data as SwitchTemplateArgs
      );
    }

    default:
      return { ok: false, error: `Unknown tool: ${name}` };
  }
}
