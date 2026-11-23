/**
 * Tiny pub/sub bridge for the inline-issue tip surface.
 *
 * The scorecard (right rail) and the editor (left column) are sibling
 * Client Components under the same Server Component page. They each own
 * their own state, including their own RHF form. A dim-bar click in the
 * scorecard must make the editor scroll to the measured leaf, pulse its
 * section header and render the tip at the point of interest — without
 * lifting the form up to the page level (which would force the page to
 * be a Client Component, defeating the RSC architecture).
 *
 * The bridge is a typed `CustomEvent` on `window`. Its payload carries
 * only routing hints (section slug, section title, criterion): the
 * editor owns the dynamic tip map and renders the rich JSX itself.
 *
 * The old Apply half of this bridge carried AI rewrites from a Pro-only
 * popover into the editor's form. That surface is retired: flagged
 * bullets now hand off to Scout through `ChatHandoffProvider`, and
 * Scout edits through the normal `editResume` tool result path.
 *
 * Plan: docs/plans/inline-bullet-issues-to-scout.md.
 */

export type InlineIssueTipEvent = {
  /** Section slug (kebab-case) used to find the DOM anchor. */
  sectionSlug: string;
  /** Pretty section title for the tip's bold prefix. */
  sectionTitle: string;
  /** Sub-criterion the user clicked — drives the tip content. */
  criterion: import('./types').SubCriterionKey;
};

export const INLINE_ISSUE_TIP_EVENT = 'nexstepper:inline-issue:tip';

/**
 * Publish a Tip event. Called by the scorecard's controller when the
 * user clicks a dim bar or a "Show me" affordance. No-op on the server
 * — `window` is undefined during SSR.
 */
export function dispatchInlineIssueTip(event: InlineIssueTipEvent): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<InlineIssueTipEvent>(INLINE_ISSUE_TIP_EVENT, {
      detail: event
    })
  );
}

/**
 * Subscribe to Tip events. Returns an unsubscribe function suitable for
 * use in a `useEffect` cleanup. Called by the editor on mount.
 */
export function subscribeToInlineIssueTip(
  handler: (event: InlineIssueTipEvent) => void
): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const listener = (e: Event) => {
    const ce = e as CustomEvent<InlineIssueTipEvent>;
    handler(ce.detail);
  };
  window.addEventListener(INLINE_ISSUE_TIP_EVENT, listener);
  return () => window.removeEventListener(INLINE_ISSUE_TIP_EVENT, listener);
}
