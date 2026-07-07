'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import {
  createMasterResume,
  createVariant,
  getResume,
  saveResumeRevision
} from '@/lib/db/queries';
import { resumeDataSchema } from '@/lib/resume-schema';

/**
 * Discriminated union for Server Action results — see AGENTS.md §3.
 * TypeScript narrows cleanly on the client (`if (result.ok) result.data.foo`).
 */
export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

/**
 * Create a new master resume for the signed-in user.
 *
 * Auth: Better Auth session lookup — Server Actions are public endpoints
 * regardless of where they appear in the UI, so we re-check at the top.
 * Validation: Zod `safeParse` — never trust the client shape.
 *
 * On success the create form redirects to `/dashboard/resumes/${id}` where
 * the editor takes over.
 */
export async function createMasterResumeAction(
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { ok: false, error: 'Not signed in' };
  }

  const parsed = createMasterResumeSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Invalid input',
      fieldErrors: parsed.error.flatten().fieldErrors
    };
  }

  const created = await createMasterResume(session.user.id, parsed.data.name);
  revalidatePath('/dashboard/resumes');
  return { ok: true, data: { id: created.id } };
}

const createMasterResumeSchema = z.object({
  name: z
    .string()
    .min(1, 'Name is required')
    .max(100, 'Name must be 100 characters or fewer')
});

/**
 * Save a new revision for the current editor session.
 *
 * Validation:
 * 1. Wrapper schema ({ id, data }) is shape-checked with safeParse.
 * 2. The `data` field is also parsed against resumeDataSchema as defense in
 *    depth — SchemaForm already validates client-side, but a Server Action
 *    is a public endpoint and can't trust the wire shape.
 *
 * Auth: ownership check via getResume(id, userId). If the resume doesn't
 * exist OR doesn't belong to this user, returns a 404-shaped error rather
 * than leaking existence.
 *
 * On success: writes a new resume_revisions row and bumps
 * resumes.current_revision_id. Caller can router.refresh() to see updated
 * data; we also revalidate /dashboard/resumes so the list view reflects
 * the new revision timestamp.
 */
export async function saveResumeAction(
  input: unknown
): Promise<ActionResult<{ revisionId: string }>> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { ok: false, error: 'Not signed in' };
  }

  const parsed = saveResumeSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Invalid input',
      fieldErrors: parsed.error.flatten().fieldErrors
    };
  }

  // Defense-in-depth: parse the inner data shape. SchemaForm already
  // validates client-side; this catches tampered requests.
  const dataResult = resumeDataSchema.safeParse(parsed.data.data);
  if (!dataResult.success) {
    return {
      ok: false,
      error: 'Invalid resume data',
      fieldErrors: dataResult.error.flatten().fieldErrors
    };
  }

  // Ownership check (also covers the resume-existing case).
  const existing = await getResume(parsed.data.id, session.user.id);
  if (!existing) {
    return { ok: false, error: 'Resume not found' };
  }

  const revision = await saveResumeRevision(
    parsed.data.id,
    session.user.id,
    dataResult.data
  );

  revalidatePath('/dashboard/resumes');
  revalidatePath(`/dashboard/resumes/${parsed.data.id}`);

  return { ok: true, data: { revisionId: revision.id } };
}

const saveResumeSchema = z.object({
  id: z.string().min(1, 'Resume id is required'),
  data: z.unknown()
});

/**
 * Create a variant of an existing master resume. The variant starts as a
 * deep copy of the master's current data; the user can then tweak it
 * independently in the editor.
 *
 * Slice 2 doesn't take a job-context input yet — Phase 3 will pass an
 * optional `jobContext` when tailoring to a JD, and the action will grow
 * a `jobContext` field then.
 */
export async function createVariantAction(
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { ok: false, error: 'Not signed in' };
  }

  const parsed = createVariantSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Invalid input',
      fieldErrors: parsed.error.flatten().fieldErrors
    };
  }

  // createVariant checks master ownership internally and returns null
  // when the master isn't found / isn't owned by this user.
  const variant = await createVariant(session.user.id, parsed.data.masterId);
  if (!variant) {
    return { ok: false, error: 'Master resume not found' };
  }

  revalidatePath('/dashboard/resumes');
  revalidatePath(`/dashboard/resumes/${parsed.data.masterId}`);

  return { ok: true, data: { id: variant.id } };
}

const createVariantSchema = z.object({
  masterId: z.string().min(1, 'Master resume id is required')
});