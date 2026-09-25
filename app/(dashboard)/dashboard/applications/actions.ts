'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';

import { auth } from '@/lib/auth';
import {
  createApplication,
  deleteApplication,
  updateApplication
} from '@/lib/db/queries';
import {
  createApplicationInputSchema,
  parseJd,
  updateApplicationInputSchema
} from '@/lib/jd-parser';
import { trackServer } from '@/lib/posthog/server';
import { PostHogEvents } from '@/lib/posthog/events';

/**
 * Server Actions for Applications — the create flow calls the JD parser
 * (Claude) before persisting, so the action result is a discriminated
 * union that surfaces both validation errors and AI errors structurally.
 *
 * Same pattern as the resume actions (AGENTS.md §3): discriminated
 * `ActionResult<T>` return, Zod safeParse at the top, ownership
 * check inside the query helper, revalidatePath on success.
 */

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]>; code?: string };

/**
 * Create a new Application from a pasted JD.
 *
 * Flow:
 *  1. Auth check.
 *  2. Zod validate the input shape (the input fields the user can edit
 *     — title, JD text, optional source).
 *  3. Call the JD parser (Claude). If the parse fails, we surface the
 *     AI's error code/message back to the client — the user can decide
 *     whether to retry or to create a "draft" Application without a
 *     parsed shape.
 *  4. Insert the row + revalidate /dashboard/applications.
 */
export async function createApplicationAction(
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { ok: false, error: 'Not signed in' };
  }

  const parsed = createApplicationInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Invalid input',
      fieldErrors: parsed.error.flatten().fieldErrors
    };
  }

  const result = await parseJd(parsed.data.jdText);
  if (!result.ok) {
    trackServer(session.user.id, PostHogEvents.APPLICATION_PARSE_FAILED, {
      errorCode: result.code,
      jdLength: parsed.data.jdText.length
    });
    return {
      ok: false,
      code: result.code,
      error: result.error
    };
  }

  const created = await createApplication(session.user.id, {
    jobTitle: parsed.data.jobTitle,
    company: parsed.data.company ?? null,
    jdText: parsed.data.jdText,
    jdParsed: result.data,
    sourceUrl: parsed.data.sourceUrl ?? null,
    sourceBoard: parsed.data.sourceBoard ?? null,
    notes: parsed.data.notes ?? ''
  });

  trackServer(session.user.id, PostHogEvents.JD_PARSED, {
    applicationId: created.id,
    jdLength: parsed.data.jdText.length,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens
  });
  trackServer(session.user.id, PostHogEvents.APPLICATION_CREATED, {
    applicationId: created.id,
    sourceBoard: parsed.data.sourceBoard ?? 'unknown',
    jdLength: parsed.data.jdText.length
  });

  revalidatePath('/dashboard/applications');
  return { ok: true, data: { id: created.id } };
}

/**
 * Update an Application. All fields optional (PATCH semantics). Used by
 * the application detail page for status changes, notes, and
 * JD re-parsing.
 */
export async function updateApplicationAction(
  applicationId: string,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { ok: false, error: 'Not signed in' };
  }

  const parsed = updateApplicationInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Invalid input',
      fieldErrors: parsed.error.flatten().fieldErrors
    };
  }

  // If the JD text was updated, re-parse it. The caller can also pass
  // a new jdText explicitly to trigger a re-parse (e.g. from a "refresh
  // parsed shape" button).
  let jdParsed: ReturnType<typeof Object> | undefined;
  if (parsed.data.jdText !== undefined) {
    const result = await parseJd(parsed.data.jdText);
    if (!result.ok) {
      return {
        ok: false,
        code: result.code,
        error: result.error
      };
    }
    jdParsed = result.data as unknown;
  }

  const ok = await updateApplication(applicationId, session.user.id, {
    ...(parsed.data.jobTitle !== undefined
      ? { jobTitle: parsed.data.jobTitle }
      : {}),
    ...(parsed.data.company !== undefined
      ? { company: parsed.data.company ?? null }
      : {}),
    ...(parsed.data.jdText !== undefined
      ? { jdText: parsed.data.jdText }
      : {}),
    ...(jdParsed !== undefined ? { jdParsed } : {}),
    ...(parsed.data.sourceUrl !== undefined
      ? { sourceUrl: parsed.data.sourceUrl ?? null }
      : {}),
    ...(parsed.data.sourceBoard !== undefined
      ? { sourceBoard: parsed.data.sourceBoard }
      : {}),
    ...(parsed.data.status !== undefined
      ? { status: parsed.data.status }
      : {}),
    ...(parsed.data.appliedAt !== undefined
      ? { appliedAt: parsed.data.appliedAt }
      : {}),
    ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes } : {})
  });

  if (!ok) {
    return { ok: false, error: 'Application not found' };
  }

  revalidatePath('/dashboard/applications');
  revalidatePath(`/dashboard/applications/${applicationId}`);
  return { ok: true, data: { id: applicationId } };
}

/**
 * Delete an Application. Cascades to resumeVariants. The tailored resume
 * rows in `resumes` are NOT deleted (they may be useful standalone
 * or referenced by other applications later).
 */
export async function deleteApplicationAction(
  applicationId: string
): Promise<ActionResult<{ id: string }>> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { ok: false, error: 'Not signed in' };
  }

  const ok = await deleteApplication(applicationId, session.user.id);
  if (!ok) {
    return { ok: false, error: 'Application not found' };
  }

  revalidatePath('/dashboard/applications');
  return { ok: true, data: { id: applicationId } };
}
