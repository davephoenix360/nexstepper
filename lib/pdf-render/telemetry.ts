/**
 * PDF render telemetry.
 *
 * One PostHog event per render, fired from the orchestrator's finally
 * block so we always log (success OR failure). Properties cover:
 *
 *   - userId + resumeId  → product analytics, per-user rollups
 *   - templateId         → which templates drive the most renders
 *   - resultStatus       → success vs each error code
 *   - cacheHit           → cache effectiveness (the metric that tells
 *                          us if the hash strategy is working)
 *   - durationMs         → SLA monitoring, p95 trends
 *   - pdfBytes           → capacity + storage cost tracking
 *   - errorCode          → when status='error', which upstream class
 *
 * Why PostHog and not a DB write for now:
 *   - Phase 3 will need a `pdf_renders` table for billing/quota. That's
 *     the source of truth for "did this user exceed their Pro plan".
 *   - For now, PostHog is enough for the capacity-planning dashboard
 *     ("are we approaching 18k renders/mo?") and product analytics
 *     ("which templates do users render most?"). It also requires no
 *     schema migration.
 *
 * The stub provider path in tests sets POSTHOG_KEY="" so trackServer
 * is a no-op — telemetry calls are safe in the test suite.
 */

import 'server-only';

import { trackServer } from '@/lib/posthog/server';

/** Properties attached to every pdf_rendered event. */
export type PdfRenderEvent = {
  userId: string;
  resumeId: string;
  templateId: string;
  resultStatus: 'success' | 'error';
  cacheHit: boolean;
  durationMs: number;
  pdfBytes?: number;
  errorCode?: string;
};

/** Fire-and-forget. Never throws — telemetry must not break the render. */
export function logPdfRender(event: PdfRenderEvent): void {
  try {
    trackServer(event.userId, 'pdf_rendered', {
      resumeId: event.resumeId,
      templateId: event.templateId,
      resultStatus: event.resultStatus,
      cacheHit: event.cacheHit,
      durationMs: event.durationMs,
      // Drop undefined so PostHog dashboards don't get a column of nulls.
      ...(event.pdfBytes !== undefined ? { pdfBytes: event.pdfBytes } : {}),
      ...(event.errorCode !== undefined ? { errorCode: event.errorCode } : {})
    });
  } catch (err) {
    // Last-ditch guard: PostHog being broken must never surface as a
    // render failure. Log to the server console for visibility.
    console.warn(
      '[pdf-render] telemetry emit failed:',
      err instanceof Error ? err.message : err
    );
  }
}
