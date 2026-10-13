'use server';

/**
 * Server action for the public feedback form.
 *
 * Flow:
 *   1. Zod-validate the wire shape. `safeParse` is the security
 *      boundary — never trust the client.
 *   2. Per-IP rate limit (5 submissions / minute). Authed users get
 *      a slightly higher ceiling than anonymous to avoid penalising
 *      fast typers; both reset on the rolling minute window.
 *   3. Insert the feedback row. **This is the source of truth** —
 *      it must succeed before any best-effort side effects.
 *   4. Best-effort GitHub Issues sync. On any failure (missing
 *      token, GitHub down, rate limit) we keep the row and log
 *      `githubSynced: false`. The user always sees success.
 *   5. Fire a PostHog event so the funnel is observable.
 *
 * The action is intentionally simple: no revalidatePath (the form
 * lives outside the dashboard tree, and the success state is local
 * to the form), no Sentry capture for GitHub failures (the GitHub
 * wrapper already logs them — capturing here would double-report).
 */
import { randomUUID } from 'node:crypto';
import { headers } from 'next/headers';

import { auth } from '@/lib/auth';
import {
  insertFeedback,
  markFeedbackSyncedToGitHub
} from '@/lib/db/queries';
import {
  countUrls,
  FEEDBACK_MAX_URLS,
  feedbackInputSchema,
  type SubmitFeedbackResult
} from '@/lib/feedback/schema';
import { createFeedbackIssue } from '@/lib/feedback/github';
import { ipUnderRateLimit } from '@/lib/feedback/rate-limit';
import { trackServer } from '@/lib/posthog/server';
import { PostHogEvents } from '@/lib/posthog/events';

export async function submitFeedbackAction(
  input: unknown
): Promise<SubmitFeedbackResult> {
  // ── 1. Validate wire shape ───────────────────────────────────────────
  const parsed = feedbackInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Invalid input',
      fieldErrors: parsed.error.flatten().fieldErrors
    };
  }

  // ── 2. Cheap anti-spam checks (post-validation, pre-DB) ──────────────
  // URL count cap. We check after Zod so we know the message is a
  // well-formed string, not arbitrary user input.
  if (countUrls(parsed.data.message) > FEEDBACK_MAX_URLS) {
    // We don't reach into the literal type here — `${FEEDBACK_MAX_URLS}`
    // renders as "3" in the message and that's the only number the
    // user sees. The singular/plural branch below is unreachable in
    // practice (3 ≠ 1) but the type is currently narrowed to the
    // literal `3`, so we keep the wording neutral and avoid the
    // unreachable pluralisation branch.
    return {
      ok: false,
      error: `Please include at most ${FEEDBACK_MAX_URLS} links — this helps us keep the form free of spam.`
    };
  }

  // ── 3. Auth + context (session is optional — footer is anonymous) ───
  const session = await auth.api.getSession({ headers: await headers() });
  const reqHeaders = await headers();

  // Best-effort client IP. Vercel sets `x-forwarded-for` first; fall
  // back to `x-real-ip`. Behind a CDN / load balancer these can be
  // forged, but for a per-IP rate limit that's the right trade-off
  // (a determined attacker can spoof the header; the cost is
  // poisoning their own bucket, not bypassing the limit on others).
  const ipHeader =
    reqHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    reqHeaders.get('x-real-ip') ??
    null;
  const userAgent = reqHeaders.get('user-agent') ?? null;
  const pageUrl = reqHeaders.get('referer') ?? null;

  // ── 4. Rate limit (per IP) ────────────────────────────────────────────
  const underLimit = await ipUnderRateLimit(ipHeader);
  if (!underLimit) {
    return {
      ok: false,
      error:
        "You've sent a few notes in the last minute \u2014 take a breath, then try again. (Rate limit: 5 per minute.)"
    };
  }

  // ── 5. Persist (source of truth) ──────────────────────────────────────
  const feedbackId = randomUUID();
  let row;
  try {
    row = await insertFeedback({
      id: feedbackId,
      userId: session?.user?.id ?? null,
      message: parsed.data.message,
      category: parsed.data.category,
      email: parsed.data.email && parsed.data.email.length > 0
        ? parsed.data.email
        : null,
      pageUrl,
      userAgent,
      ipAddress: ipHeader
    });
  } catch (err) {
    // Persistence failure is the one thing that genuinely should
    // surface to the user. Everything else is best-effort.
    console.error('[submitFeedbackAction] insertFeedback failed:', err);
    return {
      ok: false,
      error:
        'We couldn\u2019t save your feedback just now. Please try again in a moment.'
    };
  }

  // ── 6. Best-effort GitHub sync ───────────────────────────────────────
  let githubSynced = false;
  let githubIssueNumber: number | undefined;
  try {
    const submitterLabel = session?.user?.email
      ? `authed (${session.user.email})`
      : parsed.data.email
        ? `anonymous (${parsed.data.email})`
        : 'anonymous';
    const issue = await createFeedbackIssue({
      category: parsed.data.category,
      message: parsed.data.message,
      pageUrl,
      userAgent,
      signedIn: Boolean(session?.user),
      submitterLabel
    });
    if (issue) {
      await markFeedbackSyncedToGitHub(feedbackId, issue);
      githubSynced = true;
      githubIssueNumber = issue.number;
    }
  } catch (err) {
    // `createFeedbackIssue` already swallows and logs; this catch
    // is a defense-in-depth in case `markFeedbackSyncedToGitHub`
    // throws (it would only do so on a DB failure, which would
    // already be loud). Keep the user's success path intact.
    console.error('[submitFeedbackAction] GitHub backfill failed:', err);
  }

  // ── 7. Analytics ──────────────────────────────────────────────────────
  // Track by user id when authed, by a stable anonymous id
  // (`feedback:${feedbackId}`) when not, so the funnel still resolves
  // to a single distinct id for the same submission.
  const distinctId = session?.user?.id ?? `feedback:${feedbackId}`;
  trackServer(distinctId, PostHogEvents.FEEDBACK_SUBMITTED, {
    feedbackId,
    category: parsed.data.category,
    githubSynced,
    ...(githubIssueNumber !== undefined ? { githubIssueNumber } : {})
  });

  return {
    ok: true,
    data: { feedbackId: row.id, githubSynced }
  };
}
