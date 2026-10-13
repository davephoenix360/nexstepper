/**
 * Tests for `lib/feedback/github.ts`.
 *
 * The wrapper is intentionally forgiving: every failure mode becomes
 * `null` so the form keeps working when the GitHub side is broken.
 * These cases pin that contract so a future "let me make this
 * stricter" change has to consciously break the test.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildIssueBody,
  buildIssueTitle,
  createFeedbackIssue,
  githubIssuesConfigured
} from '@/lib/feedback/github';
import type { OctokitLike } from '@/lib/feedback/github';

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.GITHUB_ISSUES_TOKEN = 'test-token';
  process.env.GITHUB_REPO_OWNER = 'davephoenix360';
  process.env.GITHUB_REPO_NAME = 'nexstepper';
});

afterEach(() => {
  // Restore everything we touched — including keys we deleted.
  process.env = { ...ORIGINAL_ENV };
});

describe('githubIssuesConfigured', () => {
  it('is true when all three env vars are set', () => {
    expect(githubIssuesConfigured()).toBe(true);
  });

  it('is false when the token is missing', () => {
    delete process.env.GITHUB_ISSUES_TOKEN;
    expect(githubIssuesConfigured()).toBe(false);
  });

  it('is false when the owner is missing', () => {
    delete process.env.GITHUB_REPO_OWNER;
    expect(githubIssuesConfigured()).toBe(false);
  });

  it('is false when the repo is missing', () => {
    delete process.env.GITHUB_REPO_NAME;
    expect(githubIssuesConfigured()).toBe(false);
  });
});

describe('buildIssueTitle', () => {
  it('prefixes the category and embeds the message', () => {
    expect(buildIssueTitle('bug', 'The submit button is broken'))
      .toBe('[bug] The submit button is broken');
  });

  it('truncates a long message with an ellipsis', () => {
    const long = 'a'.repeat(100);
    const title = buildIssueTitle('idea', long);
    // '[idea] ' (7) + slice(57) + '…' (1) = 65
    expect(title.length).toBe(65);
    expect(title).toMatch(/^\[idea\] a{57}\u2026$/);
  });

  it('collapses internal whitespace to single spaces', () => {
    expect(buildIssueTitle('other', 'line1\nline2\tline3'))
      .toBe('[other] line1 line2 line3');
  });

  it('uses a placeholder when the message is empty', () => {
    expect(buildIssueTitle('bug', '   ')).toBe('[bug] (empty message)');
  });
});

describe('buildIssueBody', () => {
  it('puts the user message up top, auto-metadata below the separator', () => {
    const body = buildIssueBody({
      category: 'idea',
      message: 'Please add dark mode.',
      signedIn: true,
      submitterLabel: 'authed (me@example.com)',
      pageUrl: 'https://www.nexstepper.com/pricing',
      userAgent: 'Mozilla/5.0'
    });
    expect(body).toContain('## User feedback');
    expect(body).toContain('Please add dark mode.');
    expect(body).toContain('---');
    expect(body).toContain('**Category:** idea');
    expect(body).toContain('**Submitter:** authed (me@example.com)');
    expect(body).toContain('**Signed in:** yes');
    expect(body).toContain('**Page:** https://www.nexstepper.com/pricing');
    expect(body).toContain('**User agent:** Mozilla/5.0');
  });

  it('omits the page line when pageUrl is null/undefined', () => {
    const body = buildIssueBody({
      category: 'bug',
      message: 'broken',
      signedIn: false,
      submitterLabel: 'anonymous'
    });
    expect(body).not.toContain('**Page:**');
  });

  it('marks the submitter as anonymous when not signed in', () => {
    const body = buildIssueBody({
      category: 'bug',
      message: 'broken',
      signedIn: false,
      submitterLabel: 'anonymous'
    });
    expect(body).toContain('**Signed in:** no');
  });
});

describe('createFeedbackIssue', () => {
  it('returns null when env is not fully configured', async () => {
    // Oct 2026 CI fix: deleting the token used to leave
    // `process.env.GITHUB_REPO_OWNER` and `GITHUB_REPO_NAME` set,
    // so the old `if (!owner || !repo) return null` gate did
    // NOT fire. The function then constructed a real
    // `new Octokit({ auth: undefined })` and made a live
    // unauthenticated API call — which either 401s fast (with
    // network) or hangs and times out in CI/restricted networks.
    // The fix gates on `githubIssuesConfigured()` so all three
    // env vars are required; the function returns null BEFORE
    // any Octokit instantiation. No stub client needed; no
    // network call attempted.
    delete process.env.GITHUB_ISSUES_TOKEN;
    const result = await createFeedbackIssue({
      category: 'idea',
      message: 'hello',
      signedIn: true,
      submitterLabel: 'authed (me@example.com)'
    });
    expect(result).toBeNull();
  });

  it('returns null when the OWNER is missing (not just the token)', async () => {
    // Belt-and-braces — the original gate only checked owner/repo.
    // The new gate checks all three. Pin each missing-var case
    // so a future "let me optimize the check" change has to
    // re-decide the contract.
    delete process.env.GITHUB_REPO_OWNER;
    const result = await createFeedbackIssue({
      category: 'idea',
      message: 'hello',
      signedIn: false,
      submitterLabel: 'anonymous'
    });
    expect(result).toBeNull();
  });

  it('returns null when the REPO is missing (not just the token)', async () => {
    delete process.env.GITHUB_REPO_NAME;
    const result = await createFeedbackIssue({
      category: 'idea',
      message: 'hello',
      signedIn: false,
      submitterLabel: 'anonymous'
    });
    expect(result).toBeNull();
  });

  it('returns { url, number } on a successful Octokit call', async () => {
    const stub: OctokitLike = {
      rest: {
        issues: {
          create: vi.fn(async () => ({
            data: {
              html_url: 'https://github.com/davephoenix360/nexstepper/issues/42',
              number: 42
            }
          }))
        }
      }
    };

    const result = await createFeedbackIssue(
      {
        category: 'bug',
        message: 'Submit button is broken on the editor toolbar.',
        pageUrl: 'https://www.nexstepper.com/dashboard/resumes/abc',
        userAgent: 'jest',
        signedIn: true,
        submitterLabel: 'authed (me@example.com)'
      },
      stub
    );

    expect(result).toEqual({
      url: 'https://github.com/davephoenix360/nexstepper/issues/42',
      number: 42
    });
    expect(stub.rest.issues.create).toHaveBeenCalledTimes(1);
    const call = (stub.rest.issues.create as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(call.owner).toBe('davephoenix360');
    expect(call.repo).toBe('nexstepper');
    expect(call.title).toMatch(/^\[bug\] /);
    expect(call.labels).toEqual(['user-feedback', 'bug']);
    expect(call.body).toContain('Submit button is broken on the editor toolbar.');
  });

  it('swallows Octokit errors and returns null (caller keeps the row)', async () => {
    const stub: OctokitLike = {
      rest: {
        issues: {
          create: vi.fn(async () => {
            throw new Error('API rate limit exceeded');
          })
        }
      }
    };
    // Suppress the expected console.error noise so test output stays clean.
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await createFeedbackIssue(
      {
        category: 'other',
        message: 'noisy',
        signedIn: false,
        submitterLabel: 'anonymous'
      },
      stub
    );

    expect(result).toBeNull();
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
