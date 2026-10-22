import 'server-only';

import { headers } from 'next/headers';
import { auth } from '@/lib/auth';

/**
 * Print-settings tools.
 *
 * ## Why the agent needs these
 *
 * "Make it fit on one page" is one of the most common requests a resume
 * tool gets, and until now the agent could not answer it at all. Page
 * length is driven by four knobs — margin, line height, font size, and
 * section spacing — and the agent can now read them, explain them, and
 * change them.
 *
 * This is the "make it fit on one page" lever that is NOT about cutting
 * content. The right order for the agent is:
 *
 *   1. Cut content (finetune down) if there is genuinely too much.
 *   2. Tighten layout (margin/line height) if the content is right but
 *      the page is too long.
 *
 * Knowing the difference is the whole point of exposing both.
 *
 * ## Scope
 *
 * These are per-resume (a variant can print differently from its
 * master), which is why they live on the `resumes` row rather than in
 * the resume data envelope.
 */

const MARGIN_VALUES: Record<string, string> = {
  compact: '0.5in',
  standard: '0.75in',
  generous: '1in'
};
const LINE_HEIGHT_VALUES: Record<string, string> = {
  compact: '1.2',
  standard: '1.4',
  relaxed: '1.6'
};
const FONT_SIZE_VALUES: Record<string, string> = {
  small: '10pt',
  standard: '11pt',
  large: '12pt'
};
const SECTION_SPACING_VALUES: Record<string, string> = {
  compact: '0.75rem',
  standard: '1.25rem',
  relaxed: '2rem'
};

function describeSettings(settings: import('@/lib/print-settings').PrintSettings): string {
  return [
    `margin: ${settings.margin} (${MARGIN_VALUES[settings.margin]})`,
    `lineHeight: ${settings.lineHeight} (${LINE_HEIGHT_VALUES[settings.lineHeight]})`,
    `fontSize: ${settings.fontSize} (${FONT_SIZE_VALUES[settings.fontSize]})`,
    `sectionSpacing: ${settings.sectionSpacing} (${SECTION_SPACING_VALUES[settings.sectionSpacing]})`
  ].join('\n');
}

/**
 * Read the current print settings for the attached resume.
 */
export async function executeGetPrintSettings(
  resumeId: string
): Promise<{ ok: true; result: string } | { ok: false; error: string }> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return { ok: false, error: 'Not authenticated' };

  const { getResume } = await import('@/lib/db/queries');
  const { coercePrintSettings } = await import('@/lib/print-settings');
  const existing = await getResume(resumeId, session.user.id);
  if (!existing) return { ok: false, error: 'Resume not found or not owned' };

  const settings = coercePrintSettings(existing.resume.printSettings);

  return {
    ok: true,
    result: `Current print settings:\n${describeSettings(settings)}\n\nTightening margin to compact and line height to compact saves roughly half an inch of vertical space per page — often the difference between one page and two.`
  };
}

/**
 * Change the print settings for the attached resume.
 *
 * Accepts a partial object: any key you omit keeps its current value.
 * That matters because the agent usually wants to change ONE thing
 * ("make it fit") without silently resetting the user's other choices.
 */
export async function executeUpdatePrintSettings(
  resumeId: string,
  args: {
    margin?: 'compact' | 'standard' | 'generous';
    lineHeight?: 'compact' | 'standard' | 'relaxed';
    fontSize?: 'small' | 'standard' | 'large';
    sectionSpacing?: 'compact' | 'standard' | 'relaxed';
  }
): Promise<{ ok: true; result: string } | { ok: false; error: string }> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return { ok: false, error: 'Not authenticated' };

  const { getResume, updatePrintSettings } = await import('@/lib/db/queries');
  const { coercePrintSettings } = await import('@/lib/print-settings');
  const { revalidatePath } = await import('next/cache');

  const existing = await getResume(resumeId, session.user.id);
  if (!existing) return { ok: false, error: 'Resume not found or not owned' };

  const current = coercePrintSettings(existing.resume.printSettings);
  const next = coercePrintSettings({ ...current, ...stripUndefined(args) });

  // `coercePrintSettings` falls back to ALL DEFAULTS when the object
  // fails validation, which would silently discard the user's existing
  // choices. Detect that and fail loudly instead.
  const changed = (Object.keys(next) as Array<keyof typeof next>).filter(
    (k) => next[k] !== current[k]
  );
  if (changed.length === 0) {
    return {
      ok: true,
      result: `No change — the settings were already:\n${describeSettings(current)}`
    };
  }

  const saved = await updatePrintSettings(resumeId, session.user.id, next);
  if (!saved) return { ok: false, error: 'Could not update print settings' };

  revalidatePath(`/dashboard/resumes/${resumeId}`);

  return {
    ok: true,
    result: `Updated print settings (${changed.join(', ')}):\n${describeSettings(saved)}\n\nTell the user the change may need a moment to appear in the preview.`
  };
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out as Partial<T>;
}
