/**
 * Tests for `deleteResumeAction` —
 * `app/(dashboard)/dashboard/resumes/actions.ts > deleteResumeAction`.
 *
 * Verifies:
 *   - Not-signed-in → `{ ok: false, error: 'Not signed in' }`.
 *   - Invalid input shape → `{ ok: false, error: 'Invalid input' }`
 *     with `fieldErrors` populated.
 *   - Query returns false (resume not owned / not found) → `{ ok:false,
 *     error: 'Resume not found' }`.
 *   - Query returns true → `{ ok: true, data: { id, isMaster,
 *     variantCount } }`, PostHog tracked with the right props,
 *     `/dashboard/resumes` + the editor path revalidated.
 *
 * Plan: docs/plans/delete-resume.md §Acceptance criteria #4 + #6.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

// --- Mocks ---------------------------------------------------------------

const mockGetSession = vi.fn();
const mockDeleteResume = vi.fn();
const mockTrackServer = vi.fn();
const mockRevalidatePath = vi.fn();

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: (...args: unknown[]) => mockGetSession(...args)
    }
  }
}));

vi.mock('next/headers', () => ({
  // Server Actions call `headers()` to build a Better Auth session
  // lookup. Return an empty Headers instance — `getSession` is mocked
  // anyway, so the value is never read.
  headers: async () => new Headers()
}));

vi.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args)
}));

vi.mock('@/lib/db/queries', () => ({
  deleteResume: (...args: unknown[]) => mockDeleteResume(...args)
}));

vi.mock('@/lib/posthog/server', () => ({
  trackServer: (...args: unknown[]) => mockTrackServer(...args)
}));

vi.mock('@/lib/posthog/events', () => ({
  PostHogEvents: { RESUME_DELETED: 'resume_deleted' }
}));

// --- Imports -------------------------------------------------------------

import { deleteResumeAction } from '@/app/(dashboard)/dashboard/resumes/actions';

// --- Helpers --------------------------------------------------------------

const VALID_INPUT = {
  resumeId: 'resume-123',
  isMaster: true,
  variantCount: 3
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });
});

// --- Tests ----------------------------------------------------------------

describe('deleteResumeAction', () => {
  it('returns "Not signed in" when there is no session', async () => {
    mockGetSession.mockResolvedValueOnce(null);

    const result = await deleteResumeAction(VALID_INPUT);

    expect(result).toEqual({ ok: false, error: 'Not signed in' });
    expect(mockDeleteResume).not.toHaveBeenCalled();
    expect(mockTrackServer).not.toHaveBeenCalled();
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it('returns "Invalid input" with fieldErrors when resumeId is missing', async () => {
    const result = await deleteResumeAction({
      isMaster: true,
      variantCount: 0
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('Invalid input');
      expect(result.fieldErrors?.resumeId).toBeDefined();
    }
    expect(mockDeleteResume).not.toHaveBeenCalled();
  });

  it('rejects non-boolean isMaster and negative variantCount', async () => {
    const bad = await deleteResumeAction({
      resumeId: 'r1',
      isMaster: 'yes' as unknown as boolean,
      variantCount: -1
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.error).toBe('Invalid input');
      expect(bad.fieldErrors).toBeDefined();
    }

    const bad2 = await deleteResumeAction({
      resumeId: 'r1',
      isMaster: true,
      variantCount: 1.5
    });
    expect(bad2.ok).toBe(false);
  });

  it('returns "Resume not found" when the query reports failure', async () => {
    mockDeleteResume.mockResolvedValueOnce(false);

    const result = await deleteResumeAction(VALID_INPUT);

    expect(result).toEqual({ ok: false, error: 'Resume not found' });
    expect(mockDeleteResume).toHaveBeenCalledWith('resume-123', 'user-1');
    expect(mockTrackServer).not.toHaveBeenCalled();
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it('returns success, tracks PostHog, and revalidates paths when delete succeeds', async () => {
    mockDeleteResume.mockResolvedValueOnce(true);

    const result = await deleteResumeAction({
      resumeId: 'master-abc',
      isMaster: true,
      variantCount: 2
    });

    expect(result).toEqual({
      ok: true,
      data: { id: 'master-abc', isMaster: true, variantCount: 2 }
    });

    expect(mockDeleteResume).toHaveBeenCalledWith('master-abc', 'user-1');
    expect(mockTrackServer).toHaveBeenCalledWith(
      'user-1',
      'resume_deleted',
      {
        resumeId: 'master-abc',
        isMaster: true,
        variantCount: 2
      }
    );
    expect(mockRevalidatePath).toHaveBeenCalledWith('/dashboard/resumes');
    expect(mockRevalidatePath).toHaveBeenCalledWith(
      '/dashboard/resumes/master-abc'
    );
  });

  it('passes through isMaster=false for a variant delete (zero variants cascaded)', async () => {
    mockDeleteResume.mockResolvedValueOnce(true);

    const result = await deleteResumeAction({
      resumeId: 'variant-xyz',
      isMaster: false,
      variantCount: 0
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({
        id: 'variant-xyz',
        isMaster: false,
        variantCount: 0
      });
    }
    expect(mockTrackServer).toHaveBeenCalledWith(
      'user-1',
      'resume_deleted',
      {
        resumeId: 'variant-xyz',
        isMaster: false,
        variantCount: 0
      }
    );
  });
});