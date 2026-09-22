/**
 * Pure helper for the suppression notice logic in
 * `useInlineIssueController`. Extracted so it can be unit-tested
 * without React — the controller is a hook with `useState` +
 * `useEffect` that depend on browser globals (window.setTimeout,
 * document.querySelector) which we don't load under vitest.
 *
 * Returns the suppression notice that the scorecard should
 * surface when a dim-bar click did NOT open the AI popover, or
 * `null` when the popover will open normally (no notice needed).
 *
 * The four branches cover:
 *   - Pro + non-empty text + known target  → no suppression.
 *   - Free user                           → "upgrade to Pro".
 *   - Pro + unknown path                  → "couldn't locate".
 *   - Pro + empty bullet text             → "add content first".
 *
 * Each branch maps to one user-facing reason, so the user always
 * sees a concrete message that explains why the AI half didn't
 * run. Without this, the click feels dead ("I pressed the button
 * and nothing happened") even though the pulse + tip still fire.
 */
export type SuppressionNotice = {
  /** User-facing message explaining why the popover didn't open. */
  message: string;
  /**
   * Visual tone:
   *   - `info` for non-actionable states (Free plan → upgrade CTA).
   *   - `warn` for actionable states (empty bullet, unknown path).
   */
  tone: 'info' | 'warn';
};

const FREE_USER_MESSAGE =
  'AI rewrites are a Pro feature. Free users get the scroll + inline tip — upgrade to apply AI suggestions.';

const UNKNOWN_PATH_MESSAGE =
  "Couldn't locate a bullet for this dimension — the resume may not have content here yet.";

const EMPTY_BULLET_MESSAGE =
  'The bullet here is empty — add some content to this section first, then we can rewrite it.';

export type BuildSuppressionNoticeInput = {
  /** Whether the current user is on the Pro plan. */
  isPro: boolean;
  /** The leaf's current text content (may be empty / whitespace). */
  text: string;
  /** Whether `mapPathToSection` produced a target for this leaf. */
  hasTarget: boolean;
};

export function buildSuppressionNotice(
  input: BuildSuppressionNoticeInput
): SuppressionNotice | null {
  // Happy path — popover will open, no suppression message.
  if (
    input.isPro &&
    input.text.trim().length > 0 &&
    input.hasTarget
  ) {
    return null;
  }
  if (!input.isPro) {
    return { message: FREE_USER_MESSAGE, tone: 'info' };
  }
  // Pro user — but either no target or empty text.
  if (!input.hasTarget) {
    return { message: UNKNOWN_PATH_MESSAGE, tone: 'warn' };
  }
  return { message: EMPTY_BULLET_MESSAGE, tone: 'warn' };
}
