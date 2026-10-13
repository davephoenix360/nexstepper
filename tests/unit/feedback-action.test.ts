/**
 * Tests for `submitFeedbackAction`
 * (`app/actions/feedback.ts`).
 *
 * The action is the integration point for everything feedback-related:
 *   - Zod validation
 *   - URL-count spam cap
 *   - Per-IP rate limit
 *   - DB insert (the source of truth)
 *   - Best-effort GitHub sync
 *   - PostHog event
 *
 * Each path is mocked so the test stays offline. We assert the
 * observable contract (`{ok, ...}`), not the internals.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// --- Mocks ---------------------------------------------------------------

const mockGetSession = vi.fn();
const mockInsertFeedback = vi.fn();
const mockMarkFeedbackSyncedToGitHub = vi.fn();
const mockIpUnderRateLimit = vi.fn();
const mockCreateFeedbackIssue = vi.fn();
const mockTrackServer = vi.fn();

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: (...args: unknown[]) => mockGetSession(...args)
    }
  }
}));

vi.mock('next/headers', () => ({
  // The action calls `headers()` twice — once for the Better Auth
  // session lookup, once for the client IP / user-agent. We hand
  // back a Headers instance with the relevant request-time fields.
  headers: async () =>
    new Headers({
      'x-forwarded-for': '203.0.113.42',
      'user-agent': 'jest',
      referer: 'https://www.nexstepper.com/dashboard'
    })
}));

vi.mock('@/lib/db/queries', () => ({
  insertFeedback: (...args: unknown[]) => mockInsertFeedback(...args),
  markFeedbackSyncedToGitHub: (...args: unknown[]) =>
    mockMarkFeedbackSyncedToGitHub(...args)
}));

vi.mock('@/lib/feedback/rate-limit', () => ({
  ipUnderRateLimit: (...args: unknown[]) => mockIpUnderRateLimit(...args)
}));

vi.mock('@/lib/feedback/github', () => ({
  createFeedbackIssue: (...args: unknown[]) =>
    mockCreateFeedbackIssue(...args)
}));

vi.mock('@/lib/posthog/server', () => ({
  trackServer: (...args: unknown[]) => mockTrackServer(...args)
}));

vi.mock('@/lib/posthog/events', () => ({
  PostHogEvents: { FEEDBACK_SUBMITTED: 'feedback_submitted' }
}));

// --- Imports -------------------------------------------------------------

import { submitFeedbackAction } from '@/app/actions/feedback';

// --- Helpers --------------------------------------------------------------

const VALID_INPUT = {
  message: 'The export button on the editor is broken when I click it.',
  category: 'bug' as const
};

function resetMocks() {
  vi.clearAllMocks();
  // Default: not rate limited, not signed in, insert succeeds, no
  // GitHub sync. Each test overrides what it cares about.
  mockGetSession.mockResolvedValue(null);
  mockIpUnderRateLimit.mockResolvedValue(true);
  mockInsertFeedback.mockImplementation(async (input) => ({
    id: input.id,
    userId: input.userId,
    message: input.message,
    category: input.category,
    email: input.email ?? null,
    pageUrl: input.pageUrl ?? null,
    userAgent: input.userAgent ?? null,
    ipAddress: input.ipAddress ?? null,
    githubIssueUrl: null,
    githubIssueNumber: null,
    createdAt: new Date('2026-10-13T00:00:00Z')
  }));
  mockCreateFeedbackIssue.mockResolvedValue(null);
}

beforeEach(resetMocks);
afterEach(() => {
  vi.restoreAllMocks();
});

// --- Tests ---------------------------------------------------------------

describe('submitFeedbackAction — validation', () => {
  it('rejects an empty / too-short message', async () => {
    const result = await submitFeedbackAction({
      message: 'short',
      category: 'idea'
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('Invalid input');
      expect(result.fieldErrors?.message).toBeDefined();
    }
    expect(mockInsertFeedback).not.toHaveBeenCalled();
  });

  it('rejects an unknown category', async () => {
    const result = await submitFeedbackAction({
      message: 'A perfectly fine message that meets the length floor.',
      category: 'praise'
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors?.category).toBeDefined();
    }
  });

  it('rejects too many links in the message', async () => {
    const result = await submitFeedbackAction({
      message:
        'https://a.com https://b.com https://c.com https://d.com this has four links',
      category: 'idea'
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/at most 3 links/);
    }
    expect(mockInsertFeedback).not.toHaveBeenCalled();
  });
});

describe('submitFeedbackAction — rate limiting', () => {
  it('returns a friendly error when the IP is over the limit', async () => {
    mockIpUnderRateLimit.mockResolvedValueOnce(false);

    const result = await submitFeedbackAction(VALID_INPUT);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/try again/i);
    }
    expect(mockInsertFeedback).not.toHaveBeenCalled();
    expect(mockCreateFeedbackIssue).not.toHaveBeenCalled();
  });
});

describe('submitFeedbackAction — happy paths', () => {
  it('persists the row, attempts GitHub sync, and tracks PostHog on success', async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: 'user-1' } });
    mockCreateFeedbackIssue.mockResolvedValueOnce({
      url: 'https://github.com/davephoenix360/nexstepper/issues/7',
      number: 7
    });

    const result = await submitFeedbackAction({
      message: 'Could you add a dark-mode toggle to the editor?',
      category: 'idea',
      email: 'me@example.com'
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.githubSynced).toBe(true);
      expect(result.data.feedbackId).toMatch(/[0-9a-f-]{36}/);
    }

    // Persistence came first.
    expect(mockInsertFeedback).toHaveBeenCalledTimes(1);
    const insertArgs = mockInsertFeedback.mock.calls[0][0];
    expect(insertArgs.userId).toBe('user-1');
    expect(insertArgs.message).toBe(
      'Could you add a dark-mode toggle to the editor?'
    );
    expect(insertArgs.category).toBe('idea');
    expect(insertArgs.email).toBe('me@example.com');
    expect(insertArgs.ipAddress).toBe('203.0.113.42');
    expect(insertArgs.userAgent).toBe('jest');

    // GitHub sync ran, was given the right context, and the row
    // was backfilled with the issue number / url.
    expect(mockCreateFeedbackIssue).toHaveBeenCalledTimes(1);
    expect(mockMarkFeedbackSyncedToGitHub).toHaveBeenCalledWith(
      result.ok ? result.data.feedbackId : '',
      { url: 'https://github.com/davephoenix360/nexstepper/issues/7', number: 7 }
    );

    // PostHog fired with the right shape.
    expect(mockTrackServer).toHaveBeenCalledWith(
      'user-1',
      'feedback_submitted',
      {
        feedbackId: result.ok ? result.data.feedbackId : '',
        category: 'idea',
        githubSynced: true,
        githubIssueNumber: 7
      }
    );
  });

  it('uses an anonymous distinct id when the user is not signed in', async () => {
    const result = await submitFeedbackAction(VALID_INPUT);
    expect(result.ok).toBe(true);
    const trackCall = mockTrackServer.mock.calls[0];
    expect(trackCall[0]).toMatch(/^feedback:/);
  });

  it('stores a null email when the form posts an empty string', async () => {
    await submitFeedbackAction({
      message: VALID_INPUT.message,
      category: VALID_INPUT.category,
      email: ''
    });
    expect(mockInsertFeedback.mock.calls[0][0].email).toBeNull();
  });

  it('returns githubSynced=false but still succeeds when GitHub is down', async () => {
    mockCreateFeedbackIssue.mockResolvedValueOnce(null);

    const result = await submitFeedbackAction(VALID_INPUT);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.githubSynced).toBe(false);
    }
    // The row is still saved — that's the whole point of source-of-truth-first.
    expect(mockInsertFeedback).toHaveBeenCalledTimes(1);
    // No backfill when there's no issue.
    expect(mockMarkFeedbackSyncedToGitHub).not.toHaveBeenCalled();
    // PostHog still fires.
    expect(mockTrackServer).toHaveBeenCalledTimes(1);
  });

  it('survives a GitHub-backfill DB failure (still returns success)', async () => {
    mockCreateFeedbackIssue.mockResolvedValueOnce({
      url: 'https://github.com/davephoenix360/nexstepper/issues/8',
      number: 8
    });
    mockMarkFeedbackSyncedToGitHub.mockRejectedValueOnce(
      new Error('transient DB blip')
    );
    // Expected console.error noise.
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await submitFeedbackAction(VALID_INPUT);

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Even though the backfill threw, we still report success —
      // the user got their message in. The fact that the issue
      // number never made it onto the row is an internal blip.
      expect(result.data.githubSynced).toBe(false);
    }
    errSpy.mockRestore();
  });
});

describe('submitFeedbackAction — persistence failure', () => {
  it('surfaces a user-facing error when the DB insert throws', async () => {
    mockInsertFeedback.mockRejectedValueOnce(new Error('connection lost'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await submitFeedbackAction(VALID_INPUT);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/try again/i);
    }
    // No side effects on a hard DB failure.
    expect(mockCreateFeedbackIssue).not.toHaveBeenCalled();
    expect(mockTrackServer).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
