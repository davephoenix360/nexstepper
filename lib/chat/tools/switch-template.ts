import 'server-only';

import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { saveResumeRevision } from '@/lib/db/queries';
import type { SwitchTemplateArgs } from './types';
import { AVAILABLE_TEMPLATES } from '../system-prompt';

const TEMPLATE_DESCRIPTIONS: Record<string, string> = {
  minimal: 'Minimal — clean, single-column, typography-focused',
  classic: 'Classic — traditional two-column with clear hierarchy',
  executive: 'Executive — formal, bold headers, senior-role optimised',
  creative: 'Creative — visual, colour accents, design-forward',
  modern: 'Modern — contemporary layout with balanced whitespace'
};

/**
 * Execute a `switchTemplate` tool call.
 *
 * Updates the `template` field on the resume and persists via
 * `saveResumeRevision`. Ownership is verified before any write.
 *
 * Returns a plain object serialised as the tool result.
 */
export async function executeSwitchTemplate(
  resumeId: string,
  args: SwitchTemplateArgs
): Promise<{ ok: true; result: string } | { ok: false; error: string }> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return { ok: false, error: 'Not authenticated' };

  const userId = session.user.id;

  // Validate the requested template ID.
  if (
    !(AVAILABLE_TEMPLATES as readonly string[]).includes(args.templateId)
  ) {
    return {
      ok: false,
      error: `Unknown template: ${args.templateId}. Available: ${AVAILABLE_TEMPLATES.join(', ')}`
    };
  }

  // Lazy-import to avoid circular dep.
  const { getResume } = await import('@/lib/db/queries');
  const existing = await getResume(resumeId, userId);
  if (!existing) return { ok: false, error: 'Resume not found or not owned' };

  const updated = { ...existing.data, template: args.templateId };

  try {
    const rev = await saveResumeRevision(resumeId, userId, updated, {
      message: `Switched template to ${args.templateId} via AI chat`
    });
    if (!rev) return { ok: false, error: 'Failed to save template change' };
    const desc = TEMPLATE_DESCRIPTIONS[args.templateId] ?? args.templateId;
    return {
      ok: true,
      result: `Template switched to **${args.templateId}** (${desc}). Your preview has been updated.`
    };
  } catch (err) {
    console.error('[executeSwitchTemplate]', err);
    return { ok: false, error: 'Failed to save template change' };
  }
}
