/**
 * One number, three surfaces.
 *
 * ## The bug this pins
 *
 * Three surfaces show or quote a variant's ATS score:
 *
 *   1. the scorecard on the variant page,
 *   2. the badge on the resume list,
 *   3. the chat agent's system prompt.
 *
 * They used to answer "what is this resume's score?" three different
 * ways, and two of them disagreed with the page by design:
 *
 *   - the PAGE read the PERSISTED breakdown (the enhanced / Jev score),
 *   - the LIST and the CHAT each computed a fresh score with the SYNC
 *     engine.
 *
 * The sync engine and the hybrid engine differ exactly where the
 * hybrid engine is built to disagree — ATS keyword evidence, content
 * quality, intent coverage — so this was the NORMAL case, not an edge
 * case. A user could look at a scorecard saying 57, ask the agent
 * "what's my score?", and be told 51. The agent was not wrong; it was
 * answering from a different engine.
 *
 * That is this codebase's characteristic failure mode: not a crash, but
 * a number that disagrees with itself.
 *
 * ## The rule these tests lock
 *
 * The PERSISTED SNAPSHOT is the score. Every surface reads it through
 * the same resolver. Only a variant that has never been scored falls
 * back to computing one, and that fallback is the sync engine — which
 * is what the page and the badge already used, so they still agree
 * with each other.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const mocks = vi.hoisted(() => ({
  getLatestScoreSnapshot: vi.fn()
}));

vi.mock('@/lib/db/queries', () => ({
  getLatestScoreSnapshot: mocks.getLatestScoreSnapshot
}));

import { resolveVariantScore } from '@/lib/variant-score';
import { blankResumeData } from '@/lib/resume-schema';
import type { ScoreBreakdown } from '@/lib/scoring';
import type { JobPosting } from '@/lib/resume-schema';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');

function makeBreakdown(overallScore: number, keyword: number): ScoreBreakdown {
  return {
    overallScore,
    dimensionScores: {
      atsMatching: keyword,
      structure: 80,
      contentQuality: 70,
      alignment: 60,
      intentCoverage: 90,
      roleFit: 64,
      seniorityFit: 50
    },
    criteriaScores: {
      'ATS Keyword Match': keyword,
      'ATS Similarity': 90,
      'ATS Coverage': 80,
      'Intent Coverage': 90,
      'Section Completeness': 100,
      'Optimal Length': 70,
      'Accomplishment Focus': 70,
      'Action Verb Usage': 80,
      Tailoring: 60,
      'Unique Value': 50,
      'Role Fit': 64,
      'Seniority Fit': 50,
      'Soft Skills': 50
    },
    computedInMs: 4,
    intentCoverageBreakdown: {
      value: 90,
      missed: { mustHave: [], niceToHave: [], implicit: [] },
      penalty: 0,
      fallback: false,
      eligibility: []
    }
  };
}

const resume = blankResumeData();
const job = { title: 'Staff Engineer' } as unknown as JobPosting;

describe('resolveVariantScore', () => {
  beforeEach(() => {
    mocks.getLatestScoreSnapshot.mockReset();
  });

  it('returns the persisted breakdown — the number the scorecard shows', async () => {
    const persisted = makeBreakdown(57, 66);
    mocks.getLatestScoreSnapshot.mockResolvedValueOnce({
      id: 's1',
      resumeId: 'v1',
      matchScore: 57,
      breakdown: persisted,
      matchBreakdown: [],
      dynamicTips: {},
      computedInMs: 4,
      createdAt: new Date()
    });

    const result = await resolveVariantScore({
      resumeId: 'v1',
      resume,
      job
    });

    expect(result.breakdown?.overallScore).toBe(57);
    expect(result.breakdown?.criteriaScores['ATS Keyword Match']).toBe(66);
    expect(result.source).toBe('snapshot');
  });

  it('reports `computed` when there is no snapshot, so the caller can say so', async () => {
    mocks.getLatestScoreSnapshot.mockResolvedValueOnce(null);

    const result = await resolveVariantScore({
      resumeId: 'v1',
      resume,
      job
    });

    expect(result.source).toBe('computed');
    expect(result.breakdown).not.toBeNull();
  });

  it('reports `computed` when the snapshot predates the breakdown column', async () => {
    // A row written before `breakdown` existed carries `breakdown: null`.
    // The page used to fall back to the sync engine for these — the
    // scorecard and the agent must agree on that too.
    mocks.getLatestScoreSnapshot.mockResolvedValueOnce({
      id: 's1',
      resumeId: 'v1',
      matchScore: 51,
      breakdown: null,
      matchBreakdown: [],
      dynamicTips: {},
      computedInMs: 4,
      createdAt: new Date()
    });

    const result = await resolveVariantScore({
      resumeId: 'v1',
      resume,
      job
    });

    expect(result.source).toBe('computed');
  });

  it('has no score at all without a job description', async () => {
    const result = await resolveVariantScore({
      resumeId: 'v1',
      resume,
      job: null
    });

    expect(result.breakdown).toBeNull();
    // And it does not read the database for a master resume.
    expect(mocks.getLatestScoreSnapshot).not.toHaveBeenCalled();
  });
});

describe('the three surfaces agree by construction', () => {
  it('the page and the chat both go through the shared resolver', () => {
    const page = read('app/(dashboard)/dashboard/resumes/[id]/page.tsx');
    const chat = read('app/api/chat/route.ts');

    expect(page).toContain('resolveVariantScore');
    expect(chat).toContain('resolveVariantScore');
  });

  it('the chat does not compute a score of its own any more', () => {
    // The sync engine in the chat route is what made the agent quote a
    // different number from the scorecard. It must not come back.
    const chat = read('app/api/chat/route.ts');
    expect(chat).not.toContain('scoreResumeFromEnvelope');
  });

  it('the resolver itself goes through the shared snapshot rule', () => {
    const resolver = read('lib/variant-score.ts');
    expect(resolver).toContain('resolveRenderedBreakdownWithSource');
  });

  it('the list still resolves through the same pure rule (it needs a batched query)', () => {
    const queries = read('lib/db/queries.ts');
    const listFn = queries.slice(
      queries.indexOf('export async function listResumes'),
      queries.indexOf('export async function listResumes') + 6000
    );
    expect(listFn).toContain('resolveRenderedBreakdown');
  });

  it('the chat tool persists the FULL breakdown, not just the headline', () => {
    // Without the breakdown, the snapshot it writes is invisible to the
    // page — `resolveRenderedBreakdown` rejects it and the scorecard
    // falls back to the sync engine, so the divergence returns by the
    // back door.
    const tool = read('lib/chat/tools/get-ats-score.ts');
    const write = tool.slice(
      tool.indexOf('recordScoreSnapshot('),
      tool.indexOf('recordScoreSnapshot(') + 700
    );
    expect(write).toContain('breakdown,');
  });
});
