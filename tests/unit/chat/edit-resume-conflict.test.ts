import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mockSession = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: () => mockSession() } }
}));

vi.mock('next/headers', () => ({
  headers: () => Promise.resolve(new Headers())
}));

const mockGetResume = vi.fn();
const mockSaveResumeRevision = vi.fn();
vi.mock('@/lib/db/queries', () => ({
  getResume: (...args: unknown[]) => mockGetResume(...args),
  saveResumeRevision: (...args: unknown[]) => mockSaveResumeRevision(...args)
}));

import { executeEditResume } from '@/lib/chat/tools/edit-resume';
import { RevisionConflictError } from '@/lib/db/revision-guard';
import { sampleResumeData } from '@/lib/resume-schema/sample';

const OLD_TEXT =
  'Built an algorithm that compresses data so efficiently it triggered a lawsuit from Big Content.';

const ARGS = {
  replaceWorkHighlight: [
    {
      path: 'sections.work.0.positions.0.highlights.0',
      oldText: OLD_TEXT,
      newText: 'Led the compression algorithm through a successful launch.'
    }
  ]
};

describe('executeEditResume revision guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockGetResume.mockResolvedValue({
      resume: { id: 'resume-1', currentRevisionId: 'rev-1' },
      data: sampleResumeData
    });
  });

  it('passes the revision it actually read into the guarded save', async () => {
    mockSaveResumeRevision.mockResolvedValue({ id: 'rev-2' });

    const result = await executeEditResume('resume-1', ARGS);

    expect(result.ok).toBe(true);
    expect(mockSaveResumeRevision).toHaveBeenCalledWith(
      'resume-1',
      'user-1',
      expect.objectContaining({ sections: expect.any(Object) }),
      expect.objectContaining({
        message: 'Edited via AI chat',
        expectedRevisionId: 'rev-1'
      })
    );
  });

  it('reports a stale read as a retryable conflict instead of claiming success', async () => {
    mockSaveResumeRevision.mockImplementation(() => {
      throw new RevisionConflictError();
    });

    const result = await executeEditResume('resume-1', ARGS);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/changed since it was read/i);
      expect(result.error).toMatch(/read the resume again/i);
    }
  });
});
