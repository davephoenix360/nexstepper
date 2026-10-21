import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import { getResumeByShareToken, recordShareView } from '@/lib/db/queries';
import { getTemplate } from '@/components/resume-templates';
import { trackServer } from '@/lib/posthog/server';
import { PostHogEvents } from '@/lib/posthog/events';

/**
 * Public, read-only resume view.
 *
 * Lives OUTSIDE the `(dashboard)` route group so it's not gated by
 * the dashboard layout. No auth — the token in the URL is the
 * capability.
 *
 * The lookup:
 *   1. Validate token shape (deterministic tokens are exactly 22
 *      chars, base64url; reject anything else before hitting the DB).
 *   2. Query `resumes` by `share_token = ?` WHERE shareEnabled = true.
 *      The token IS the lookup key — no second hash step. This is
 *      safe because what we store is an HMAC, not a secret: an
 *      attacker without `SHARE_LINK_SECRET` cannot reproduce tokens
 *      from the column.
 *   3. If no row → 404 (don't leak which half was wrong).
 *   4. Validate the JSONB revision data (defense in depth).
 *   5. Render via the same template registry the editor uses.
 *   6. Fire-and-forget: increment view counter.
 *
 * SEO: <meta name="robots" content="noindex, nofollow"> via the
 * `metadata` export. PII should never be indexed.
 *
 * Auth wall: `notFound()` for the disabled / wrong-token case. We
 * deliberately don't show a "this link is no longer active" page —
 * that's a signal to the wrong-token guesser that they got the
 * right row but it's disabled, vs. a totally unknown token. 404
 * for both keeps the behavior identical.
 */
type RouteParams = { token: string };

export async function generateMetadata({
  params
}: {
  params: Promise<RouteParams>;
}): Promise<Metadata> {
  // Don't even look at the DB for metadata — every shareable page
  // returns the same generic title, and the data isn't fetched
  // until the page render (which is the only point we look up the
  // token). Avoiding the lookup here saves a DB round-trip for
  // crawlers and the rate-limit window.
  return {
    title: 'Resume',
    robots: {
      index: false,
      follow: false,
      nocache: true,
      googleBot: { index: false, follow: false }
    }
  };
}

export default async function SharedResumePage({
  params
}: {
  params: Promise<RouteParams>;
}) {
  const { token } = await params;

  // Cheap input guard: `deriveShareToken` produces exactly 22 chars
  // (16 bytes base64url-encoded). A 1KB string is obviously wrong
  // and would just waste a DB round-trip. The shape check is also a
  // pre-migration safety net — old URLs that held 64-char SHA-256
  // hex digests fail here before they hit a query plan.
  if (!token || token.length !== 22 || !/^[A-Za-z0-9_-]+$/.test(token)) {
    notFound();
  }

  const result = await getResumeByShareToken(token);
  if (!result) notFound();

  // Render via the same template registry the editor uses — single
  // source of truth for what a "rendered resume" looks like.
  const template = getTemplate(result.data.template);
  const Template = template.Component;

  // Fire-and-forget view increment. We don't await — the render
  // shouldn't be blocked on the counter write, and the function
  // already swallows its own errors.
  void recordShareView(result.resume.id);

  // Same fire-and-forget pattern for the analytics event. No distinctId
  // — the viewer is anonymous (no auth on the public share route). PostHog
  // will fall back to its session/anonymous id; the analytics property bag
  // is keyed by the OWNER's resume id so we can attribute views to the
  // publisher, not the visitor.
  void trackServer(result.resume.userId, PostHogEvents.SHARE_LINK_VIEWED, {
    ownerResumeId: result.resume.id
  });

  return (
    <div className="min-h-screen bg-zinc-100 py-8 print:bg-white print:py-0">
      <div className="mx-auto max-w-[8.5in] px-4 print:max-w-none print:px-0">
        <Template data={result.data} />
      </div>
    </div>
  );
}
