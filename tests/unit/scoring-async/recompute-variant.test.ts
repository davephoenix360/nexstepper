import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn()
}));

const mockGetResume = vi.fn();
const mockRecordScoreSnapshot = vi.fn();
vi.mock('@/lib/db/queries', () => ({
  getResume: (...args: unknown[]) => mockGetResume(...args),
  recordScoreSnapshot: (...args: unknown[]) => mockRecordScoreSnapshot(...args)
}));

const mockScoreResumeHybridFromEnvelope = vi.fn();
vi.mock('@/lib/scoring-async/score-hybrid', () => ({
  scoreResumeHybridFromEnvelope: (...args: unknown[]) =>
    mockScoreResumeHybridFromEnvelope(...args)
}));

const mockBuildDynamicTips = vi.fn();
vi.mock('@/lib/scoring/tips', () => ({
  buildDynamicTips: (...args: unknown[]) => mockBuildDynamicTips(...args)
}));

const mockBuildMatchBreakdown = vi.fn();
const mockMaybeAppendSkillGapEntry = vi.fn();
vi.mock('@/lib/inline-issue/build-match-breakdown', () => ({
  buildMatchBreakdown: (...args: unknown[]) => mockBuildMatchBreakdown(...args),
  maybeAppendSkillGapEntry: (...args: unknown[]) => mockMaybeAppendSkillGapEntry(...args)
}));

const mockTrackServer = vi.fn();
vi.mock('@/lib/posthog/server', () => ({
  trackServer: (...args: unknown[]) => mockTrackServer(...args)
}));

vi.mock('@/lib/posthog/events', () => ({
  PostHogEvents: { SCORE_COMPUTED: 'score_computed' }
}));

import { revalidatePath } from 'next/cache';
import {
  recomputeVariantScore,
  revalidateVariantScorePaths
} from '@/lib/scoring-async/recompute-variant';

const DATA = { sections: { basics: { summary: 'Current resume' } } };
const JOB = { title: 'Engineer' };
const BREAKDOWN = { overallScore: 77, computedInMs: 42 };
const TIPS = { 'Accomplishment Focus': 'tip' };
const MATCH = [{ criterion: 'Accomplishment Focus', path: 'sections.work.0...' }];
const FINAL_MATCH = [...MATCH, { criterion: 'Skill Gap', path: 'sections.skills' }];

describe('recomputeVariantScore', () => {
  beforeEach(() => {
    mockGetResume.mockReset();
    mockRecordScoreSnapshot.mockReset();
    mockScoreResumeHybridFromEnvelope.mockReset();
    mockBuildDynamicTips.mockReset();
    mockBuildMatchBreakdown.mockReset();
    mockMaybeAppendSkillGapEntry.mockReset();
    mockTrackServer.mockReset();
    vi.mocked(revalidatePath).mockClear();

    mockScoreResumeHybridFromEnvelope.mockResolvedValue(BREAKDOWN);
    mockBuildDynamicTips.mockReturnValue(TIPS);
    mockBuildMatchBreakdown.mockReturnValue(MATCH);
    mockMaybeAppendSkillGapEntry.mockReturnValue(FINAL_MATCH);
  });

  it('re-reads the current resume when no source is supplied', async () => {
    mockGetResume.mockResolvedValue({
      resume: { isMaster: false },
      data: { ...DATA, jobContext: JOB }
    });

    const result = await recomputeVariantScore('r1', 'u1');

    expect(mockGetResume).toHaveBeenCalledWith('r1', 'u1');
    expect(mockScoreResumeHybridFromEnvelope).toHaveBeenCalledWith(
      { ...DATA, jobContext: JOB },
      JOB
    );
    expect(result).toEqual({
      breakdown: BREAKDOWN,
      tips: TIPS,
      matchBreakdown: FINAL_MATCH
    });
  });

  it('persists the full breakdown, not just the headline number', async () => {
    mockGetResume.mockResolvedValue({
      resume: { isMaster: false },
      data: { ...DATA, jobContext: JOB }
    });

    await recomputeVariantScore('r1', 'u1');

    expect(mockRecordScoreSnapshot).toHaveBeenCalledWith('r1', 'u1', {
      matchScore: 77,
      matchBreakdown: FINAL_MATCH,
      dynamicTips: TIPS,
      breakdown: BREAKDOWN,
      computedInMs: 42
    });
    expect(mockTrackServer).toHaveBeenCalledWith('u1', 'score_computed', {
      resumeId: 'r1',
      overallScore: 77,
      computedInMs: 42
    });
  });

  it('uses a supplied envelope without re-reading it', async () => {
    const source = { data: DATA as never, job: JOB as never };

    await recomputeVariantScore('r1', 'u1', source);

    expect(mockGetResume).not.toHaveBeenCalled();
    expect(mockScoreResumeHybridFromEnvelope).toHaveBeenCalledWith(DATA, JOB);
  });

  it('refuses a master or a variant with no JD when re-reading', async () => {
    mockGetResume.mockResolvedValueOnce({ resume: { isMaster: true }, data: DATA });
    await expect(recomputeVariantScore('r1', 'u1')).rejects.toThrow(/master/i);

    mockGetResume.mockResolvedValueOnce({ resume: { isMaster: false }, data: DATA });
    await expect(recomputeVariantScore('r1', 'u1')).rejects.toThrow(/job description/i);

    expect(mockRecordScoreSnapshot).not.toHaveBeenCalled();
  });

  it('does not revalidate inside the helper', async () => {
    mockGetResume.mockResolvedValue({
      resume: { isMaster: false },
      data: { ...DATA, jobContext: JOB }
    });

    await recomputeVariantScore('r1', 'u1');

    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe('revalidateVariantScorePaths', () => {
  it('invalidates both the editor and the list', () => {
    revalidateVariantScorePaths('r1');

    expect(revalidatePath).toHaveBeenCalledWith('/dashboard/resumes/r1');
    expect(revalidatePath).toHaveBeenCalledWith('/dashboard/resumes');
  });
});
