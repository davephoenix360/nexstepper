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
import {
  extractFileText,
  parseResumeText,
  MAX_FILE_BYTES,
  type SupportedFileType
} from '@/lib/resume-parser';

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
 * Import a resume file (PDF / DOCX / plain text) and create a new master
 * from the AI-parsed sections.
 *
 * Flow:
 *   1. Validate session + FormData shape (name + file).
 *   2. Read the file into a Buffer (in-memory only; never persisted to
 *      disk or Vercel Blob).
 *   3. `extractFileText` — PDF/DOCX/TXT → plain text.
 *   4. `parseResumeText` — plain text → ResumeSections (Anthropic call).
 *   5. `createMasterResume(userId, name, sections)` — atomic master +
 *      first revision in one transaction.
 *   6. Revalidate `/dashboard/resumes` so the new master shows up in the
 *      list immediately.
 *
 * Privacy: the file bytes and extracted text are sent to Anthropic Claude
 * for structured extraction. The original file is held in memory for the
 * duration of the request only — nothing is written to Vercel Blob or
 * anywhere else. The user sees a one-line disclosure in the UI.
 *
 * Error handling: every failure mode (auth, validation, extraction, AI,
 * DB) returns a structured `{ ok: false, code, error }` so the client
 * can show specific guidance instead of a generic toast.
 */
export type ImportResumeErrorCode =
  | 'not_signed_in'
  | 'no_file'
  | 'no_name'
  | 'file_too_large'
  | 'unsupported_type'
  // Passthrough from extractFileText
  | 'empty_file'
  | 'pdf_parse_failed'
  | 'docx_parse_failed'
  | 'text_too_short'
  // Passthrough from parseResumeText
  | 'no_api_key'
  | 'ai_failure'
  | 'validation_failed'
  | 'resume_too_short'
  // DB / unexpected
  | 'db_failure';

export type ImportResumeResult =
  | {
      ok: true;
      data: {
        id: string;
        usage?: { inputTokens: number; outputTokens: number };
        pageCount?: number;
      };
    }
  | { ok: false; code: ImportResumeErrorCode; error: string };

export async function importResumeAction(
  formData: FormData
): Promise<ImportResumeResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { ok: false, code: 'not_signed_in', error: 'Not signed in' };
  }

  // ── FormData validation ──────────────────────────────────────────────
  const name = String(formData.get('name') ?? '').trim();
  if (!name) {
    return { ok: false, code: 'no_name', error: 'Resume name is required' };
  }
  if (name.length > 100) {
    return {
      ok: false,
      code: 'no_name',
      error: 'Name must be 100 characters or fewer'
    };
  }

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return {
      ok: false,
      code: 'no_file',
      error: 'Please attach a resume file (PDF, DOCX, or text)'
    };
  }

  // Server-side size cap. Mirrors MAX_FILE_BYTES from the parser; the
  // Next.js bodySizeLimit is the outer guard, this is the inner one.
  if (file.size > MAX_FILE_BYTES) {
    return {
      ok: false,
      code: 'file_too_large',
      error: `File is too large (${(file.size / 1024 / 1024).toFixed(
        1
      )} MB; max ${MAX_FILE_BYTES / 1024 / 1024} MB).`
    };
  }

  const fileType = inferFileType(file);
  if (!fileType) {
    return {
      ok: false,
      code: 'unsupported_type',
      error: `Unsupported file type: ${file.name}. Use PDF, DOCX, or plain text.`
    };
  }

  // ── Read + extract text ──────────────────────────────────────────────
  const bytes = Buffer.from(await file.arrayBuffer());
  const extracted = await extractFileText(bytes, fileType);
  if (!extracted.ok) {
    // Map the parser's error code to the action's code (same names).
    return { ok: false, code: extracted.code, error: extracted.error };
  }

  // ── AI parse ─────────────────────────────────────────────────────────
  const parsed = await parseResumeText(extracted.text);
  if (!parsed.ok) {
    return { ok: false, code: parsed.code, error: parsed.error };
  }

  // ── Persist ──────────────────────────────────────────────────────────
  try {
    const created = await createMasterResume(
      session.user.id,
      name,
      parsed.data
    );
    revalidatePath('/dashboard/resumes');
    return {
      ok: true,
      data: {
        id: created.id,
        usage: parsed.usage,
        pageCount: extracted.pageCount
      }
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[importResumeAction] DB failure:', err);
    return { ok: false, code: 'db_failure', error: message };
  }
}

/**
 * Infer the supported file type from MIME + extension. The MIME check is
 * preferred; we fall back to the extension when the browser sends an
 * unknown / empty MIME (common on some Windows browsers for .docx).
 */
function inferFileType(file: File): SupportedFileType | null {
  const mime = file.type.toLowerCase();
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';

  if (mime === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mime === 'application/zip' || // .docx is technically a zip; some browsers send this
    ext === 'docx'
  )
    return 'docx';
  if (mime.startsWith('text/') || ext === 'txt' || ext === 'text') return 'txt';

  return null;
}

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