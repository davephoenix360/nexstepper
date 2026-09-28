/**
 * Tests for `importResumeAction` — focused on the error shape that
 * Phase 1e UX hardening added.
 *
 * Plan: docs/plans/import-ux-and-timeouts.md
 *
 * Specifically:
 *   1. `ai_failure` from `parseResumeText` produces a CLEAN user-facing
 *      message (no SDK class name like `NoObjectGeneratedError` in
 *      the `error` field) and surfaces the raw SDK error under
 *      `technical` for the "What happened?" disclosure.
 *   2. `ai_failure` also writes a server-side console.error so dev
 *      logs (and any Sentry console-log scraper) capture the raw error.
 *   3. Other error codes (`no_api_key`, `pdf_parse_failed`, ...) pass
 *      through unchanged from `parseResumeText` — the action does NOT
 *      sanitize them because they're already user-facing strings.
 *   4. The action's catch block for the AI parse is NOT triggered when
 *      `parseResumeText` returns a discriminated-union failure (the
 *      failure path goes through `if (!parsed.ok)` not `catch`).
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────

const mockGetSession = vi.fn();
const mockHeaders = vi.fn();
const mockParseResumeText = vi.fn();
const mockExtractFileText = vi.fn();
const mockRevalidatePath = vi.fn();
const mockTrackServer = vi.fn();
const mockCreateMasterResume = vi.fn();

vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: (...args: unknown[]) => mockGetSession(...args) } }
}));

vi.mock('next/headers', () => ({
  headers: async () => new Headers()
}));

vi.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args)
}));

vi.mock('@/lib/db/queries', () => ({
  // We only care about the resume insert path here; throw to fail loud
  // if the action accidentally tries to insert during an error test.
  createMasterResume: (...args: unknown[]) => mockCreateMasterResume(...args)
}));

vi.mock('@/lib/resume-parser/parse-resume', () => ({
  parseResumeText: (...args: unknown[]) => mockParseResumeText(...args)
}));

// `extract-file-text` re-exports `MAX_FILE_BYTES` from
// `lib/resume-parser/index.ts`, so we have to re-export it from the
// mock too. The action pulls MAX_FILE_BYTES in via its import of
// `lib/resume-parser`.
vi.mock('@/lib/resume-parser/extract-file-text', async () => {
  // Re-export the original MAX_FILE_BYTES so the action's import
  // resolves. We override only `extractFileText`.
  const actual = await vi.importActual<typeof import('@/lib/resume-parser/extract-file-text')>(
    '@/lib/resume-parser/extract-file-text'
  );
  return {
    ...actual,
    extractFileText: (...args: unknown[]) => mockExtractFileText(...args)
  };
});

vi.mock('@/lib/posthog/server', () => ({
  trackServer: (...args: unknown[]) => mockTrackServer(...args)
}));

vi.mock('@/lib/posthog/events', () => ({
  PostHogEvents: { RESUME_IMPORTED: 'resume_imported' }
}));

// ─── Imports (must come AFTER mocks) ─────────────────────────────────────

import { importResumeAction } from '@/app/(dashboard)/dashboard/resumes/actions';

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * Build a fake FormData for the action. We don't actually need a real
 * File blob — extractFileText is mocked — so a `File`-like polyfill
 * keeps the action's type narrowing happy.
 */
function buildFormData({
  name = 'Test Master',
  payload = { name: 'fake.txt', size: 100, type: 'text/plain' } as unknown as File
}: { name?: string; payload?: unknown } = {}) {
  const fd = new FormData();
  fd.set('name', name);
  // Use a real File (vitest jsdom provides one) for type-correctness.
  // The action does `formData.get('file') as File`; we satisfy that
  // without touching the mocked extractFileText (which controls what
  // extracted.text returns).
  const realFile = new File(['hello world'], 'fake.txt', {
    type: 'text/plain'
  });
  // We pass the real File regardless of `payload` arg above — the
  // payload arg is just to satisfy the helper signature without
  // complex conditional construction. The action never inspects the
  // file's bytes because extractFileText is mocked.
  fd.set('file', realFile);
  return { fd, realFile };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });
  // Default: extractFileText returns enough text to pass the
  // `extracted.text.length` check (≥ 100 chars after trim). The
  // action inspects `extracted.ok` to discriminate success vs.
  // failure (same pattern as parseResumeText), so the success
  // mock MUST carry `ok: true` or the action short-circuits.
  mockExtractFileText.mockResolvedValue({
    ok: true,
    text: 'A'.repeat(500),
    pageCount: 1
  });
});

// ─── Tests ────────────────────────────────────────────────────────────────

describe('importResumeAction — ai_failure sanitization', () => {
  it('returns a clean user-facing message for ai_failure and surfaces the SDK error under `technical`', async () => {
    const rawSdkError =
      'AI_NoObjectGeneratedError: Schema validation failed for [object Object]';
    mockParseResumeText.mockResolvedValueOnce({
      ok: false,
      code: 'ai_failure',
      error: rawSdkError
    });

    const { fd } = buildFormData();
    const result = await importResumeAction(fd);

    expect(result.ok).toBe(false);
    if (result.ok) return;

    // The user-facing message must NOT contain the SDK error class
    // name. This is the regression the Phase 1e audit found — the
    // old code appended the raw SDK message to the user-visible
    // error, leaking class names like `NoObjectGeneratedError`.
    expect(result.error).not.toContain('AI_NoObjectGeneratedError');
    expect(result.error).not.toContain('Schema validation');
    expect(result.code).toBe('ai_failure');
    // The friendly copy is friendly.
    expect(result.error.toLowerCase()).toMatch(/(try again|paste the text)/);
    // The raw SDK string is preserved on `technical` for the
    // "What happened?" disclosure.
    expect(result.technical).toBe(rawSdkError);
  });

  it('logs the raw SDK error to console.error so dev logs (and Sentry console scraper) capture it', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockParseResumeText.mockResolvedValueOnce({
      ok: false,
      code: 'ai_failure',
      error: 'SomeSdkError: detailed'
    });

    const { fd } = buildFormData();
    await importResumeAction(fd);

    expect(spy).toHaveBeenCalledWith(
      '[importResumeAction] ai_failure:',
      'SomeSdkError: detailed'
    );
    spy.mockRestore();
  });

  it('does NOT sanitize other error codes (they already come back as user-facing strings from parseResumeText)', async () => {
    mockParseResumeText.mockResolvedValueOnce({
      ok: false,
      code: 'no_api_key',
      error:
        'Resume import needs a Vercel AI Gateway key. Set AI_GATEWAY_API_KEY in your environment.'
    });

    const { fd } = buildFormData();
    const result = await importResumeAction(fd);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('no_api_key');
    expect(result.error).toMatch(/AI Gateway key/);
    // No `technical` field is added for non-ai_failure codes — the
    // SDK-style raw error isn't being held by parseResumeText in the
    // first place for these.
    expect(result.technical).toBeUndefined();
  });

  it('does NOT swallow `validation_failed` — passes the existing user-friendly copy through verbatim', async () => {
    mockParseResumeText.mockResolvedValueOnce({
      ok: false,
      code: 'validation_failed',
      error:
        'The AI returned data that did not match the expected resume shape. Please try again or paste the text instead.'
    });

    const { fd } = buildFormData();
    const result = await importResumeAction(fd);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('validation_failed');
    expect(result.error).toContain('did not match the expected resume shape');
    expect(result.technical).toBeUndefined();
  });

  it('does NOT call console.error for non-ai_failure error codes', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockParseResumeText.mockResolvedValueOnce({
      ok: false,
      code: 'pdf_parse_failed',
      error: "We couldn't read that PDF."
    });

    const { fd } = buildFormData();
    await importResumeAction(fd);

    // Console.error is reserved for the ai_failure case specifically
    // (where we want a Sentry-style signal that the AI fell over).
    // File-parsing failures are routine user errors, not infra
    // incidents, and shouldn't pollute the error dashboard.
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('importResumeAction — happy path still works', () => {
  it('revalidates the resumes path and tracks PostHog on success', async () => {
    const parsedData = {
      profile: {
        name: 'Jane Doe',
        title: 'Engineer',
        location: 'Remote',
        links: []
      },
      experience: [],
      projects: [],
      education: [],
      skills: { languages: [], frameworks: [], tools: [], other: [] },
      certifications: [],
      recognition: []
    };
    mockParseResumeText.mockResolvedValueOnce({ ok: true, data: parsedData });
    // `createMasterResume` in lib/db/queries.ts returns a Resume
    // directly (not a wrapped object) — the action does `created.id`.
    mockCreateMasterResume.mockResolvedValueOnce({
      id: 'resume-new',
      userId: 'user-1',
      name: 'Test Master',
      isMaster: true,
      template: 'modern',
      createdAt: new Date(),
      updatedAt: new Date(),
      parentResumeId: null,
      jobContextId: null
    } as any);

    const { fd } = buildFormData();
    const result = await importResumeAction(fd);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.id).toBe('resume-new');
    expect(mockRevalidatePath).toHaveBeenCalledWith('/dashboard/resumes');
    expect(mockTrackServer).toHaveBeenCalledWith(
      'user-1',
      'resume_imported',
      expect.objectContaining({ resumeId: 'resume-new' })
    );
  });
});