/**
 * The floating elements in the dashboard's bottom-right corner must
 * not overlap.
 *
 * ## The bug
 *
 * The AI assistant's trigger button (a 56px circle at `bottom-6
 * right-6`) and the floating "Feedback" pill (`bottom-4 right-4`) were
 * both fixed to the same corner. They overlapped, and the trigger
 * (z-50) sat on top of the pill (z-30) — so the pill's "Feedback"
 * label was half-hidden behind the assistant's button. The assistant's
 * open panel (z-50, and much wider) covered the pill outright.
 *
 * ## What these tests pin
 *
 * The geometry now lives in `lib/ui/floating-actions.ts`, so the
 * relationship between the three elements is arithmetic we can
 * assert on rather than a picture we have to squint at. The
 * anti-overlap invariant is the real subject of this file: the
 * trigger's top edge is below the pill's bottom edge, and the panel's
 * bottom edge is above the pill's top edge.
 *
 * The DOM assertions then check that each component actually USES
 * those constants — otherwise the module would be a very well
 * documented file that nothing reads.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  CHAT_PANEL_BOTTOM_PX,
  CHAT_TRIGGER_BOTTOM_PX,
  CHAT_TRIGGER_SIZE_PX,
  CHAT_TRIGGER_TOP_PX,
  FEEDBACK_PILL_FALLBACK_BOTTOM_PX,
  FEEDBACK_PILL_HEIGHT_PX,
  FEEDBACK_PILL_WITH_TRIGGER_BOTTOM_PX,
  FEEDBACK_PILL_WITH_TRIGGER_TOP_PX,
  FLOATING_FEEDBACK_BOTTOM_VAR,
  FLOATING_STACK_GAP_PX
} from '@/lib/ui/floating-actions';

const read = (p: string) =>
  readFileSync(resolve(process.cwd(), p), 'utf-8');

describe('floating action geometry', () => {
  it('puts the feedback pill clear of the assistant trigger', () => {
    // The trigger's top edge.
    const triggerTop = CHAT_TRIGGER_BOTTOM_PX + CHAT_TRIGGER_SIZE_PX;
    // The pill's bottom edge, with the trigger on the page.
    const pillBottom = FEEDBACK_PILL_WITH_TRIGGER_BOTTOM_PX;

    // THE invariant. If this fails, the two buttons overlap again.
    expect(pillBottom).toBeGreaterThanOrEqual(triggerTop);
  });

  it('leaves a visible gap between the trigger and the pill', () => {
    const triggerTop = CHAT_TRIGGER_BOTTOM_PX + CHAT_TRIGGER_SIZE_PX;
    expect(
      FEEDBACK_PILL_WITH_TRIGGER_BOTTOM_PX - triggerTop
    ).toBe(FLOATING_STACK_GAP_PX);
  });

  it('puts the assistant panel clear of the feedback pill', () => {
    // THE other invariant. The panel is z-50 and 544px wide, so if
    // it overlaps the pill's band the pill simply disappears.
    expect(CHAT_PANEL_BOTTOM_PX).toBeGreaterThanOrEqual(
      FEEDBACK_PILL_WITH_TRIGGER_TOP_PX
    );
  });

  it('keeps the pill low when there is no trigger on the page', () => {
    // The fallback is what the Resumes list (no assistant button)
    // gets, and it must not float in the middle of the corner.
    expect(FEEDBACK_PILL_FALLBACK_BOTTOM_PX).toBeLessThan(
      CHAT_TRIGGER_BOTTOM_PX
    );
  });

  it('derives every offset from the shared constants', () => {
    expect(CHAT_TRIGGER_TOP_PX).toBe(80);
    expect(FEEDBACK_PILL_WITH_TRIGGER_BOTTOM_PX).toBe(96);
    expect(FEEDBACK_PILL_WITH_TRIGGER_TOP_PX).toBe(
      FEEDBACK_PILL_WITH_TRIGGER_BOTTOM_PX + FEEDBACK_PILL_HEIGHT_PX
    );
    expect(CHAT_PANEL_BOTTOM_PX).toBe(154);
  });
});

describe('the components use the shared geometry', () => {
  it('the trigger publishes the offset the pill reads', () => {
    const bubble = read('components/chat/chat-bubble.tsx');
    expect(bubble).toContain('FLOATING_FEEDBACK_BOTTOM_VAR');
    expect(bubble).toContain('FEEDBACK_PILL_WITH_TRIGGER_BOTTOM_PX');
    // It must clean up after itself, or the pill would stay high on
    // pages that have no trigger.
    expect(bubble).toContain('removeProperty');
  });

  it('the pill reads the published offset, with a low fallback', () => {
    const pill = read('components/feedback/feedback-pill.tsx');
    expect(pill).toContain('FLOATING_FEEDBACK_BOTTOM_VAR');
    expect(pill).toContain('FEEDBACK_PILL_FALLBACK_BOTTOM_PX');
  });

  it('the panel sits at the offset that clears the pill', () => {
    const win = read('components/chat/chat-window.tsx');
    expect(win).toContain('CHAT_PANEL_BOTTOM_PX');
  });
});
