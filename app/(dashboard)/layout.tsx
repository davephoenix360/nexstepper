import { getSubscription } from '@/lib/db/queries';
import { asPlanId } from '@/lib/billing';
import { DashboardShell } from './_components/dashboard-shell';

/**
 * Dashboard layout (Server Component).
 *
 * Reads the user's subscription server-side and hands the plan
 * discriminator to `<DashboardShell />`. The shell handles all
 * client-only concerns (pathname highlight, mobile sidebar state,
 * banner).
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
  const sub = await getSubscription();
  const plan = asPlanId(sub.plan);
  return <DashboardShell plan={plan}>{children}</DashboardShell>;
}
