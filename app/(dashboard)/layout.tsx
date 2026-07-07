/**
 * The (dashboard) route group — home of the authenticated app surface.
 *
 * Each route inside has its own chrome (e.g. the sidebar layout at
 * dashboard/layout.tsx). This layout intentionally adds nothing — kept
 * as a thin server-component wrapper so the group boundary is explicit
 * and easy to extend later (e.g. a global "you have unread X" banner
 * above the sidebar, or dashboard-wide error boundaries).
 */
export default function DashboardGroupLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}