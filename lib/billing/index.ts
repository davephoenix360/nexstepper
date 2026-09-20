/**
 * Public surface for the billing module.
 *
 * Server-side: `requirePro()` is the trust boundary.
 * Client-side: `usePlanFromProps()` and `useIsPro()` are cosmetic hints.
 * Shared: `isProEffective()`, `statusLabel()`, the `PlanId`/`PlanStatus`
 * types, and `ProRequiredError`.
 *
 * Server actions that gate on Pro import `requirePro` directly from
 * `'@/lib/billing'` (which resolves to this file). Client components
 * import `usePlanFromProps` / `useIsPro`. UI helpers (`statusLabel`)
 * are safe in either context.
 */

export {
  ProRequiredError,
  asPlanId,
  asPlanStatus,
  isProEffective,
  statusLabel,
  PRO_EFFECTIVE_STATUSES
} from './types';

export type {
  BillingCardProps,
  PlanId,
  PlanStatus
} from './types';

export { requirePro } from './require-pro';

export { usePlanFromProps, useIsPro } from './use-user-plan';
