import { AgentBrandClient } from './agent-brand-client';

/**
 * AI agent brand lab — /dev/design-lab/agent-brand
 *
 * The owner's review surface for the agent's mark and its motion
 * language. Unauthenticated, no PII, no editor state; the route
 * layout publishes `robots: noindex,nofollow`.
 *
 * This is a DEMO page. The mark itself is not a demo — it is the
 * production component (`components/brand/agent-mark.tsx`) and the
 * production motion layer (`app/agent-mark.css`), rendered here so
 * the owner can see every size, state and placement before it ships.
 */
export default function AgentBrandPage() {
  return <AgentBrandClient />;
}
