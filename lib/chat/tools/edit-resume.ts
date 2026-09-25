import 'server-only';

import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { saveResumeRevision } from '@/lib/db/queries';
import type { EditResumeArgs } from './types';

/**
 * Extract a profile URL from basics.profiles by network name.
 */
function getProfileUrl(
  profiles: Array<{ network: string; url: string }> | undefined,
  network: string
): string | null {
  const entry = profiles?.find(
    (p) => p.network.toLowerCase() === network.toLowerCase()
  );
  return entry?.url ?? null;
}

/**
 * Execute an `editResume` tool call.
 *
 * Merges `args` (partial ResumeData fields) into the existing resume
 * via `saveResumeRevision` — the same persistence path as every other
 * save in the app. Ownership is verified via the session before any
 * write happens.
 *
 * Returns a plain object that gets serialised as the tool result.
 */
export async function executeEditResume(
  resumeId: string,
  args: EditResumeArgs
): Promise<{ ok: true; result: string } | { ok: false; error: string }> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return { ok: false, error: 'Not authenticated' };

  const userId = session.user.id;

  // Lazy-import to avoid a circular dep and keep queries.ts tree-shakeable.
  const { getResume } = await import('@/lib/db/queries');
  const existing = await getResume(resumeId, userId);
  if (!existing) return { ok: false, error: 'Resume not found or not owned' };

  const merged = buildMergedData(existing.data, args);

  try {
    const rev = await saveResumeRevision(resumeId, userId, merged, {
      message: 'Edited via AI chat'
    });
    if (!rev) return { ok: false, error: 'Failed to save revision' };
    return {
      ok: true,
      result: `Resume updated. Changes saved as revision ${rev.id.slice(0, 8)}.`
    };
  } catch (err) {
    console.error('[executeEditResume]', err);
    return { ok: false, error: 'Failed to save resume changes' };
  }
}

/**
 * Shallow-merge partial fields into the existing ResumeData.
 * Section-level fields (work, education, skills, projects) are
 * full-array replacements — the AI passes the complete updated array.
 *
 * The actual schema uses nested structures (work.positions[],
 * education.degree{}), but the AI tool uses flat fields for
 * ergonomics. We transform here before writing.
 */
function buildMergedData(
  existing: import('@/lib/resume-schema').ResumeData,
  args: EditResumeArgs
): import('@/lib/resume-schema').ResumeData {
  const basics = existing.sections?.basics;

  // Transform flat AI experience[] → nested schema work[] with positions[]
  const workEntries =
    args.experience !== undefined
      ? args.experience.map((e) => ({
          id: e.id,
          company: e.company,
          location: e.location ?? '',
          url: '',
          description: '',
          positions: [
            {
              title: e.role,
              startDate: e.startDate ?? '',
              endDate: e.endDate ?? '',
              highlights: e.highlights ?? []
            }
          ]
        }))
      : undefined;

  // Transform flat AI education[] → nested schema education[] with degree{}
  const educationEntries =
    args.education !== undefined
      ? args.education.map((e) => ({
          id: e.id,
          institution: e.institution,
          url: '',
          location: '',
          degree: {
            degreeLevel: e.degree ?? '',
            majors: e.field ? [e.field] : [],
            minors: []
          },
          startDate: e.startDate ?? '',
          endDate: e.endDate ?? '',
          gpa: e.gpa ?? '',
          courses: []
        }))
      : undefined;

  return {
    ...existing,
    ...(args.contact && {
      name: args.contact.name ?? existing.name,
      sections: {
        ...existing.sections,
        basics: {
          ...basics,
          label:
            args.contact.headline !== undefined
              ? args.contact.headline
              : basics?.label,
          email: args.contact.email ?? basics?.email,
          phone: args.contact.phone ?? basics?.phone,
          summary: args.contact.summary ?? basics?.summary,
          url: args.contact.website ?? basics?.url,
          location: basics?.location,
          profiles: basics?.profiles,
          name: args.contact.name ?? basics?.name
        }
      }
    }),
    ...(workEntries !== undefined && {
      sections: { ...existing.sections, work: workEntries }
    }),
    ...(educationEntries !== undefined && {
      sections: { ...existing.sections, education: educationEntries }
    }),
    ...(args.skills !== undefined && {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sections: { ...existing.sections, skills: args.skills as any }
    }),
    ...(args.projects !== undefined && {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sections: { ...existing.sections, projects: args.projects as any }
    })
  };
}
