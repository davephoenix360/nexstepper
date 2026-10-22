import 'server-only';

import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { PRINTABLE_SECTION_SLUGS } from './types';

/**
 * `updatePrintHiddenSections` — hide or show sections in the PRINTED
 * document, without deleting anything.
 *
 * ## Why this is a separate tool rather than part of `editResume`
 *
 * `data.print.hiddenSections` lives on the resume ENVELOPE, not inside
 * `sections.*`. The editor keeps rendering hidden sections (dimmed, with
 * a "show in PDF" control) so the user can still see and edit content
 * they have excluded from the submission. Hiding is not deleting, and
 * the agent should be able to do one without touching the other.
 *
 * ## Why it matters for length
 *
 * Hiding a section is often the cheapest way to fit a page. Measured
 * on the Modern template with a 3-role resume, hiding Projects saves
 * 2.74 inches of a 9.5-inch usable page — about 29% of a page — with no
 * content lost. The agent can now offer that as an alternative to
 * cutting the user's work.
 *
 * The operation is ADDITIVE (`hide`) and SUBTRACTIVE (`show`) rather
 * than "replace the whole list", because a model asked to reproduce a
 * list it read in its context will occasionally drop an entry. Asking
 * for the delta cannot lose anything.
 */

/** Every slug the templates recognise. */
const PRINTABLE_SECTION_SLUGS_LIST: readonly string[] = PRINTABLE_SECTION_SLUGS;

export async function executeUpdatePrintHiddenSections(
  resumeId: string,
  args: { hide?: string[]; show?: string[] }
): Promise<{ ok: true; result: string } | { ok: false; error: string }> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return { ok: false, error: 'Not authenticated' };

  const { getResume, saveResumeRevision } = await import('@/lib/db/queries');
  const { resumeDataSchema } = await import('@/lib/resume-schema');

  const existing = await getResume(resumeId, session.user.id);
  if (!existing) return { ok: false, error: 'Resume not found or not owned' };

  const current = existing.data.print?.hiddenSections ?? [];
  const hide = args.hide ?? [];
  const show = args.show ?? [];

  const unknown = [...hide, ...show].filter(
    (slug) => !PRINTABLE_SECTION_SLUGS_LIST.includes(slug)
  );
  if (unknown.length) {
    return {
      ok: false,
      error: `Unknown section(s): ${unknown.join(', ')}. Valid slugs: ${PRINTABLE_SECTION_SLUGS_LIST.join(', ')}.`
    };
  }

  // Apply `show` first, then `hide`, so a slug listed in both ends up
  // hidden (the more restrictive of the two wins, and the user asking to
  // hide something is the more recent intent).
  const next = Array.from(
    new Set([...current.filter((s) => !show.includes(s)), ...hide])
  );

  const data = resumeDataSchema.parse({
    ...existing.data,
    print: { ...existing.data.print, hiddenSections: next }
  });

  const saved = await saveResumeRevision(resumeId, session.user.id, data, {
    message: 'Updated which sections print'
  });
  if (!saved) return { ok: false, error: 'Could not save the print preferences' };

  const added = next.filter((s) => !current.includes(s));
  const removed = current.filter((s) => !next.includes(s));

  const changes: string[] = [];
  if (added.length) changes.push(`now hidden from print: ${added.join(', ')}`);
  if (removed.length) changes.push(`now shown in print: ${removed.join(', ')}`);
  if (!changes.length) changes.push('no change — that was already the state');

  return {
    ok: true,
    result: `Print visibility updated (${changes.join('; ')}).

Currently hidden from print: ${next.length ? next.join(', ') : '(none — everything prints)'}.

The sections are still in the editor and still editable — hiding only affects the printed PDF. Tell the user that, so they do not think their work was deleted.`
  };
}
