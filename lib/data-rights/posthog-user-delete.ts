import 'server-only';

import { posthogServer } from '@/lib/posthog/server';

/**
 * PostHog-side helper for the GDPR Art. 17 purge flow.
 *
 * PostHog's documented GDPR endpoint is to capture a `$delete_user`
 * event with the user's `distinct_id`. PostHog then:
 *   - Sets `$user_deleted` to true on every event tied to that ID
 *   - Removes the user's properties from the person profile
 *   - Stops processing further events for that ID
 *
 * See: https://posthog.com/docs/privacy/gdpr
 *
 * NOTE: PostHog retains the underlying event rows for the retention
 * period configured on the project (default 1 year). The user's
 * properties are scrubbed; the events themselves are not deleted
 * unless you've also configured periodic deletion. We call out the
 * property-scrub vs. event-delete distinction in the Privacy Policy.
 *
 * Idempotent: re-calling does not error. PostHog just confirms the
 * user is already flagged.
 */

export type PosthogPurgeResult = {
  ok: boolean;
  processorsNotified: boolean;
  reason?: string;
};

export function scrubPosthogUser(distinctId: string): PosthogPurgeResult {
  if (!posthogServer) {
    // Dev / unconfigured — nothing to do, nothing failed.
    return { ok: true, processorsNotified: false };
  }

  try {
    posthogServer.capture({
      distinctId,
      event: '$delete_user',
      properties: {
        // PostHog treats any properties you set here as the "delete
        // confirmation payload". Empty = the user is gone, no further
        // attributes to preserve.
      }
    });
    // Flush immediately — the purge action is short-lived and we
    // don't want the analytics queue to drop this event on shutdown.
    void posthogServer.flush();
    return { ok: true, processorsNotified: true };
  } catch (err) {
    return {
      ok: false,
      processorsNotified: false,
      reason: (err as Error).message
    };
  }
}