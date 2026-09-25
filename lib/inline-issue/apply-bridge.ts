/**
 * Tiny pub/sub bridge for the inline-issue surface.
 *
 * The scorecard (right rail) and the editor (left column) are
 * sibling Client Components under the same Server Component page.
 * They each own their own React state, including their own RHF
 * form. The inline-issue surface needs the scorecard's "Apply"
 * click to mutate the EDITOR's form — without lifting the form
 * up to the page level (which would force the page to be a
 * Client Component, defeating the RSC architecture).
 *
 * The bridge is a one-shot typed CustomEvent on `window`. The
 * editor subscribes via `subscribeToInlineIssueApply()`; the
 * scorecard publishes via `dispatchInlineIssueApply()`. The
 * payload is intentionally minimal — just the path + the text —
 * so the editor can call its own `form.setValue(path, text)`
 * without round-tripping through any other state.
 *
 * Why a window event and not a React Context: a Context would
 * require the editor + scorecard to share a provider, which
 * means lifting state to the page (and converting the page to a
 * Client Component). The window event keeps the architecture
 * intact — both components stay independently mountable.
 *
 * Why not a server action round-trip: Apply needs to be
 * instant. Round-tripping through a server action would add
 * latency, network cost, and the risk of stale form state when
 * the editor's local form has drifted from the server snapshot.
 *
 * Plan: docs/plans/inline-issue-surface.md §"Architecture" (the
 * editor is intentionally NOT turned into a server-driven form;
 * the popover writes through the local RHF form via this bridge).
 */

export type InlineIssueApplyEvent = {
  /** ResumeData.form path the rewrite targets. */
  path: string;
  /** New text the AI produced. */
  text: string;
};

export const INLINE_ISSUE_APPLY_EVENT =
  'nexstepper:inline-issue:apply';

/**
 * Tip-event payload — fired by the scorecard when the user
 * clicks a dim bar or a "Show me" affordance. The editor
 * subscribes via `subscribeToInlineIssueTip()` and renders an
 * inline tip portal anchored to the affected section header.
 *
 * The payload carries ONLY the routing hints (slug + title +
 * criterion). The dynamic tip text is computed in the editor
 * from the criterion + the `dynamicTips` map passed in as a
 * prop — keeping the bridge payload small and the editor free
 * to refresh its tips without re-firing the bridge.
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
 * Publish an Apply event. Called by the scorecard's
 * `useInlineIssueController` when the user picks a rewrite.
 *
 * No-op on the server — `window` is undefined during SSR. The
 * popover is a client-only component so this only ever runs
 * after hydration.
 */
export function dispatchInlineIssueApply(event: InlineIssueApplyEvent): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<InlineIssueApplyEvent>(INLINE_ISSUE_APPLY_EVENT, {
      detail: event
    })
  );
}

/**
 * Publish a Tip event. Called by the scorecard's
 * `useInlineIssueController` when the user clicks a dim bar.
 * The editor subscribes and renders the inline tip.
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
 * Subscribe to Apply events. Returns an unsubscribe function
 * suitable for use in a `useEffect` cleanup.
 *
 * Called by the editor (`components/editable/editable-resume.tsx`)
 * on mount. The editor's handler is responsible for:
 *   1. Calling `form.setValue(path, text, { shouldDirty: true })`
 *      so the EditableText nodes re-render with the new content.
 *   2. Calling `form.handleSubmit(handleSave)()` so the change
 *      persists — same path as the Save button.
 *   3. Calling `recomputeScoreAction()` so the scorecard bars
 *      refresh with the new text. (Optional — the user can
 *      click Recompute manually if they prefer.)
 *
 * The bridge keeps all three concerns on the editor side, which
 * already owns the RHF form + the save action.
 */
export function subscribeToInlineIssueApply(
  handler: (event: InlineIssueApplyEvent) => void
): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const listener = (e: Event) => {
    const ce = e as CustomEvent<InlineIssueApplyEvent>;
    handler(ce.detail);
  };
  window.addEventListener(INLINE_ISSUE_APPLY_EVENT, listener);
  return () => window.removeEventListener(INLINE_ISSUE_APPLY_EVENT, listener);
}

/**
 * Subscribe to Tip events. Returns an unsubscribe function
 * suitable for use in a `useEffect` cleanup.
 *
 * Called by the editor (`components/editable/editable-resume.tsx`)
 * on mount. The editor's handler is responsible for scrolling to
 * + pulsing the affected section header AND rendering the
 * inline tip portal anchored just below it.
 *
 * The editor owns the dynamic-tips map (passed in as a prop),
 * so the handler can resolve the criterion to a rich JSX tip
 * without round-tripping back through the scorecard.
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