/**
 * Best-effort sync of feedback submissions to GitHub Issues.
 *
 * Design:
 *   - The `feedback` table is the source of truth (Postgres row is
 *     written first, always succeeds). GitHub is a one-way
 *     notification fan-out: we create an issue per submission so it
 *     lands in the repo's existing triage flow.
 *   - This module never throws. Every GitHub-side failure is
 *     converted to `null`; the caller logs the row as
 *     `githubSynced: false` and moves on. Losing the issue is
 *     recoverable from the Postgres row.
 *   - If `GITHUB_ISSUES_TOKEN` is unset, this is a no-op. The form
 *     keeps working; the operator just doesn't see the issue in
 *     GitHub. The Postgres row is still the durable record.
 *   - The wrapper is Octokit-typed but accepts an injected `client`
 *     so tests can pass a stub without monkey-patching `Octokit`.
 */
import { Octokit } from 'octokit';

import type { FeedbackCategory } from './schema';

/** Returns true when the env is fully configured for the sync. */
export function githubIssuesConfigured(): boolean {
  return Boolean(
    process.env.GITHUB_ISSUES_TOKEN &&
      process.env.GITHUB_REPO_OWNER &&
      process.env.GITHUB_REPO_NAME
  );
}

export interface CreateGitHubIssueInput {
  category: FeedbackCategory;
  message: string;
  /** Page the user was on when they submitted (for triage context). */
  pageUrl?: string | null;
  /** User agent (for the issue footer). */
  userAgent?: string | null;
  /** Whether the submitter was signed in. */
  signedIn: boolean;
  /** Display label for the submitter — email if they gave one, else user id, else "anonymous". */
  submitterLabel: string;
}

export interface CreateGitHubIssueResult {
  url: string;
  number: number;
}

/**
 * Minimal Octokit surface we use. Letting tests inject a stub is
 * cheaper than `vi.mock('octokit')` and keeps the test free of
 * network calls.
 */
export interface OctokitLike {
  rest: {
    issues: {
      create: (args: {
        owner: string;
        repo: string;
        title: string;
        body: string;
        labels: string[];
      }) => Promise<{ data: { html_url: string; number: number } }>;
    };
  };
}

let cachedClient: OctokitLike | null = null;
function getClient(): OctokitLike {
  if (cachedClient) return cachedClient;
  cachedClient = new Octokit({ auth: process.env.GITHUB_ISSUES_TOKEN });
  return cachedClient;
}

/**
 * Build a stable, low-noise issue title:
 *   `[bug] Resumes page submit button unclickable`
 * The category is lowercase + bracketed, then the first ~60 chars of
 * the message (single-line, trailing ellipsis). Long enough to scan
 * in the GitHub inbox, short enough to never overflow the issue list.
 */
export function buildIssueTitle(
  category: FeedbackCategory,
  message: string
): string {
  const oneLine = message.replace(/\s+/g, ' ').trim();
  const truncated =
    oneLine.length > 60 ? `${oneLine.slice(0, 57)}\u2026` : oneLine;
  return `[${category}] ${truncated || '(empty message)'}`;
}

/**
 * Build the issue body. Markdown, with a clear separator between
 * the user-supplied content and the auto-attached metadata block, so
 * the triage reading flow is "user text up top, then context below".
 */
export function buildIssueBody(input: CreateGitHubIssueInput): string {
  const metaLines: string[] = [
    `- **Category:** ${input.category}`,
    `- **Submitter:** ${input.submitterLabel}`,
    `- **Signed in:** ${input.signedIn ? 'yes' : 'no'}`,
    input.pageUrl ? `- **Page:** ${input.pageUrl}` : null,
    input.userAgent ? `- **User agent:** ${input.userAgent}` : null
  ].filter((line): line is string => Boolean(line));

  return [
    '## User feedback',
    '',
    input.message.trim(),
    '',
    '---',
    '',
    '_Auto-attached metadata:_',
    '',
    metaLines.join('\n')
  ].join('\n');
}

/**
 * Create a GitHub Issue for a feedback row. Returns `null` on any
 * failure (missing env, network error, API error) — the caller treats
 * the feedback as "saved, not synced" and moves on.
 *
 * Exported `client` parameter is for tests; production callers omit
 * it and the lazy-init env-backed client is used.
 */
export async function createFeedbackIssue(
  input: CreateGitHubIssueInput,
  client: OctokitLike | null = null
): Promise<CreateGitHubIssueResult | null> {
  const owner = process.env.GITHUB_REPO_OWNER;
  const repo = process.env.GITHUB_REPO_NAME;
  if (!owner || !repo) return null;

  const gh = client ?? getClient();

  try {
    const res = await gh.rest.issues.create({
      owner,
      repo,
      title: buildIssueTitle(input.category, input.message),
      body: buildIssueBody(input),
      // Two labels are present on every issue. Triage adds more.
      // `user-feedback` is the bucket; `category` makes filtering easy.
      labels: ['user-feedback', input.category]
    });
    return { url: res.data.html_url, number: res.data.number };
  } catch (err) {
    // Swallow + log. The Postgres row is the durable record; the
    // operator can still see the feedback there even when the issue
    // never reached GitHub.
    console.error('[feedback] GitHub issue creation failed:', err);
    return null;
  }
}
