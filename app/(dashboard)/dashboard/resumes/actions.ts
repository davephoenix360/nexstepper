'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { createMasterResume } from '@/lib/db/queries';

/**
 * Discriminated union for Server Action results — see AGENTS.md §3.
 * TypeScript narrows cleanly on the client (`if (result.ok) result.data.foo`).
 */
export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

const createMasterResumeSchema = z.object({
  name: z
    .string()
    .min(1, 'Name is required')
    .max(100, 'Name must be 100 characters or fewer')
});

/**
 * Create a new master resume for the signed-in user.
 *
 * Auth: Better Auth session lookup — Server Actions are public endpoints
 * regardless of where they appear in the UI, so we re-check at the top.
 * Validation: Zod `safeParse` — never trust the client shape.
 *
 * Slice 1 routes the create form's submit to `/dashboard/resumes`. Slice 2
 * (editor page) will swap this to `/dashboard/resumes/${id}/edit`.
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
