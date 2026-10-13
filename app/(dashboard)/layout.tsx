import { redirect } from 'next/navigation';

import { getSubscription, getUser } from '@/lib/db/queries';
import { asPlanId } from '@/lib/billing';
import { FeedbackPill } from '@/components/feedback/feedback-pill';
import { DashboardShell } from './_components/dashboard-shell';

/**
 * Dashboard layout (Server Component).
 *
 * Reads the user's subscription server-side and hands the plan
 * discriminator to `<DashboardShell />`. The shell handles all
 * client-only concerns (pathname highlight, mobile sidebar state,
 * banner).
 *
 * **Auth gate (Oct 2026).** Every route under `(dashboard)` is
 * signed-in-only. The page-level RSCs already redirect on
 * unauthenticated visits (e.g. `resumes/[id]/page.tsx` redirects
 * to `/sign-in` when `getUser()` returns null), but a user who
 * hits `/dashboard` directly used to see the chrome (sidebar,
 * user menu) briefly while the page RSC re-rendered the redirect.
 * Gating at the layout level ensures the chrome is also hidden
 * — no flash of unauthed UI. The `getUser()` call is cheap
 * (Better Auth cookie cache hit; one DB read on miss).
 *
 * Also mounts the floating `<FeedbackPill />` outside the shell
 * tree so it stays pinned to the viewport regardless of which
 * dashboard page is showing. The pill is `position: fixed` and
 * self-contained — no shared state with the shell.
 *
 * Doing the plan check here (server) instead of inside the shell
 * (client) means we don't need a `useUserPlan()` round-trip or
 * cookie-based prop drilling — the DB read happens once on the
 * server, the plan rides along with the rest of the layout.
 *
 * Plan: docs/decisions/0007-tier-gating.md (server-authoritative
 * tier gate). Same pattern as `<BillingCard />`.
 */
export default async function DashboardLayout({
  children
}: {
  children: React.ReactNode;
}) {
  // Auth gate FIRST so we never render the dashboard chrome
  // (sidebar + user menu) for an anonymous visitor. Without this
  // gate, an unauthed visitor to `/dashboard` would briefly see
  // the shell while the page RSC re-rendered the redirect.
  const user = await getUser();
  if (!user) {
    redirect('/sign-in');
  }

  const sub = await getSubscription();
  const plan = asPlanId(sub.plan);
  return (
    <DashboardShell plan={plan}>
      {children}
      <FeedbackPill />
    </DashboardShell>
  );
}
