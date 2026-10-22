import 'server-only';

import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { saveResumeRevision } from '@/lib/db/queries';
import type { SwitchTemplateArgs } from './types';
import { describeTemplate, isValidTemplateId, TEMPLATE_IDS } from '../templates';

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

  // Validate against the registry, not a hand-written list. This was the
  // third copy of that list and the one that actually gated the feature:
  // the Jake template was unreachable from chat even though it existed,
  // because the validator here rejected it by name.
  if (!isValidTemplateId(args.templateId)) {
    return {
      ok: false,
      error: `Unknown template: ${args.templateId}. Available: ${TEMPLATE_IDS.join(', ')}`
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
    const desc = describeTemplate(args.templateId);
    return {
      ok: true,
      result: `Template switched to **${args.templateId}** (${desc}). Your preview has been updated.`
    };
  } catch (err) {
    console.error('[executeSwitchTemplate]', err);
    return { ok: false, error: 'Failed to save template change' };
  }
}
