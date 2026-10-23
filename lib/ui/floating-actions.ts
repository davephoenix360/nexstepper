/**
 * Geometry for the stack of floating elements in the bottom-right
 * corner of the dashboard.
 *
 * ## Why this is a module and not a pile of Tailwind classes
 *
 * Three elements compete for the same corner:
 *
 *   1. the AI assistant's trigger button — a 56px circle
 *   2. the floating "Feedback" pill — a text pill
 *   3. the assistant's open panel
 *
 * They used to overlap. The trigger sat on top of the pill (z-50 over
 * z-30) and hid most of the "Feedback" label, and the panel covered
 * the pill outright when it was open.
 *
 * The elements live in three different components — the panel and
 * the trigger in `components/chat/`, the pill in
 * `components/feedback/` — and the pill is mounted by the dashboard
 * layout while the other two are mounted by the editor page. So
 * there is no shared parent to reason about their positions, and
 * three sets of hard-coded offsets is exactly how they ended up
 * overlapping in the first place.
 *
 * The fix has two halves:
 *
 *   - The TRIGGER publishes the offset the PILL should use, as a CSS
 *     custom property on the root element. The pill reads it. That
 *     handles the "is the trigger on this page?" question without
 *     coupling the two components in React, and it degrades
 *     gracefully: with no trigger (the Resumes list, say) the pill
 *     falls back to its own low position.
 *
 *   - The PANEL is offset by a constant that clears the pill's band,
 *     so opening the assistant never hides the feedback affordance.
 *
 * All three constants live here so the arithmetic can be tested
 * instead of eyeballed. This is the same lesson as the share-token
 * bug: two copies of a layout rule is how a layout rule drifts.
 */

/** The trigger button's edge length. `h-14 w-14`. */
export const CHAT_TRIGGER_SIZE_PX = 56;

/** The trigger button's distance from the bottom of the viewport. `bottom-6`. */
export const CHAT_TRIGGER_BOTTOM_PX = 24;

/** The trigger button's distance from the right edge. `right-6`. */
export const CHAT_TRIGGER_RIGHT_PX = 24;

/** The shared right edge every floating element lines up to. `right-6`. */
export const FLOATING_RIGHT_PX = 24;

/**
 * The feedback pill's height with its label visible (`px-4 py-2.5`
 * around a `text-sm` line, plus the border). Icon-only on narrow
 * screens, which is shorter — so this is the taller of the two.
 */
export const FEEDBACK_PILL_HEIGHT_PX = 42;

/**
 * Where the pill sits when there is nothing to collide with.
 * `bottom-4` — its original position.
 */
export const FEEDBACK_PILL_FALLBACK_BOTTOM_PX = 16;

/** The clear space left between two stacked floating elements. */
export const FLOATING_STACK_GAP_PX = 16;

/**
 * The top edge of the trigger button's footprint — the line the pill
 * has to clear.
 */
export const CHAT_TRIGGER_TOP_PX =
  CHAT_TRIGGER_BOTTOM_PX + CHAT_TRIGGER_SIZE_PX; // 80px

/**
 * Where the feedback pill goes when the trigger is on the page: just
 * above it, with a gap.
 */
export const FEEDBACK_PILL_WITH_TRIGGER_BOTTOM_PX =
  CHAT_TRIGGER_TOP_PX + FLOATING_STACK_GAP_PX; // 96px

/**
 * The top edge of the pill's footprint in that case — the line the
 * assistant's panel has to clear.
 */
export const FEEDBACK_PILL_WITH_TRIGGER_TOP_PX =
  FEEDBACK_PILL_WITH_TRIGGER_BOTTOM_PX + FEEDBACK_PILL_HEIGHT_PX; // 138px

/**
 * Where the assistant's panel sits, so opening it never covers the
 * feedback pill.
 */
export const CHAT_PANEL_BOTTOM_PX =
  FEEDBACK_PILL_WITH_TRIGGER_TOP_PX + FLOATING_STACK_GAP_PX; // 154px

/**
 * The name of the custom property the trigger publishes for the
 * pill to read.
 */
export const FLOATING_FEEDBACK_BOTTOM_VAR = '--floating-feedback-bottom';
