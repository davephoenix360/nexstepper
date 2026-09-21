"use client";

import * as React from 'react';
import { createPortal } from 'react-dom';

import { DynamicTipInline } from '@/lib/inline-issue/dynamic-tip-inline';
import type { DynamicTips } from '@/lib/scoring/tips';
import type { SubCriterionKey } from '@/lib/inline-issue/types';
import { subscribeToInlineIssueTip } from '@/lib/inline-issue/apply-bridge';

/**
 * <InlineIssueTip /> — the editorial side of the inline-issue
 * surface. The scorecard (right rail) and the editor (left
 * column) are sibling Client Components under the same Server
 * Component page; the controller on the scorecard side fires a
 * `nextep:inline-issue:tip` window event when the user clicks a
 * dim bar or "Show me" affordance, and this component subscribes
 * to handle the visual response:
 *
 *   1. Scroll the affected section header into view (smooth).
 *   2. Pulse the header with the indigo accent for 1.5s.
 *   3. Render the dynamic tip in a portal anchored just below
 *      the header (NOT at the bottom of the scorecard — the
 *      user wants the tip "at the point of interest", not after
 *      scrolling past it). Fades out after 8s.
 *
 * Why a portal + absolute positioning instead of injecting into
 * the section's children: the section headers are rendered by 5
 * different templates. Touching every template to add a
 * `<InlineIssueTip />` slot would be invasive and would need to
 * be repeated for any future template. A portal that
 * auto-positions against the header element is one component
 * that works everywhere.
 *
 * The component renders nothing until an event fires, so the
 * SSR + first-paint cost is zero. The fade-out is CSS-driven
 * (globals.css `@keyframes inline-tip-fade-out`) so the
 * component just removes itself from React state at the end of
 * the timer — the visual fade is handled by CSS transitioning
 * opacity before the unmount.
 *
 * Plan: docs/plans/inline-issue-surface.md §"User-visible
 * behavior" (Free + Pro both see the tip; it's the universal
 * half of the surface).
 */

const TIP_VISIBLE_MS = 8000;
const PULSE_MS = 1500;
// Cross-fade: leave the tip on screen for TIP_VISIBLE_MS minus
// this, then fade out for this long.
const TIP_FADE_MS = 400;

interface ActiveState {
  sectionSlug: string;
  sectionTitle: string;
  criterion: SubCriterionKey;
  // Pixel position of the header element at the moment we
  // captured it. Recomputed on every scroll/resize so the tip
  // stays glued to the header as the page scrolls.
  rect: DOMRect | null;
  // Used so a rapid second click on a DIFFERENT dim bar
  // immediately replaces the current tip instead of stacking.
  sequence: number;
}

export interface InlineIssueTipProps {
  /** Dynamic tips map — passed in from the page RSC. */
  dynamicTips: DynamicTips;
}

export function InlineIssueTip({ dynamicTips }: InlineIssueTipProps) {
  const [active, setActive] = React.useState<ActiveState | null>(null);
  const [mounted, setMounted] = React.useState(false);
  // Holds the visible-after-the-fade flag. We unmount the
  // portal AFTER the fade so the user gets a smooth transition.
  const [opacity, setOpacity] = React.useState(1);
  const sequenceRef = React.useRef(0);
  const fadeTimerRef = React.useRef<number | null>(null);
  const unmountTimerRef = React.useRef<number | null>(null);
  const pulseTimerRef = React.useRef<number | null>(null);

  // `mounted` is set on the client only — portals require
  // `document` which doesn't exist during SSR.
  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    return subscribeToInlineIssueTip((event) => {
      const sequence = ++sequenceRef.current;

      // Clear any prior timers — a rapid second click should
      // restart the visual sequence cleanly.
      clearTimer(fadeTimerRef);
      clearTimer(unmountTimerRef);
      clearTimer(pulseTimerRef);

      const header = document.getElementById(
        `section-${event.sectionSlug}`
      );

      // No-op silently when the section header isn't mounted
      // (e.g. the user has collapsed the section in a future
      // view). Free / Pro split still works for everything
      // else; the scorecard's local pulseProps still bumps so
      // any future "tip in scorecard" UI can read it.
      const rect = header ? header.getBoundingClientRect() : null;

      // Scroll first so the header is in view BEFORE we measure
      // for positioning. smooth scroll honors `prefers-reduced-
      // motion` automatically.
      if (header) {
        header.scrollIntoView({ behavior: 'smooth', block: 'start' });
        header.classList.add('issue-pulse');
      }

      // Always show the tip — even if the header lookup failed,
      // we still want the user to see SOMETHING. Falls back to
      // the scorecard-relative position.
      setOpacity(1);
      setActive({
        sectionSlug: event.sectionSlug,
        sectionTitle: event.sectionTitle,
        criterion: event.criterion,
        rect,
        sequence
      });

      pulseTimerRef.current = window.setTimeout(() => {
        header?.classList.remove('issue-pulse');
      }, PULSE_MS);

      // Start the fade TIP_FADE_MS before the total visible
      // window ends so the transition has time to complete.
      fadeTimerRef.current = window.setTimeout(() => {
        setOpacity(0);
      }, TIP_VISIBLE_MS - TIP_FADE_MS);

      unmountTimerRef.current = window.setTimeout(() => {
        setActive((current) =>
          current?.sequence === sequence ? null : current
        );
      }, TIP_VISIBLE_MS);
    });
  }, []);

  // Re-measure on scroll / resize so the tip stays anchored as
  // the page scrolls past the section. We use `requestAnimationFrame`
  // to coalesce scroll events to one reflow per frame.
  React.useEffect(() => {
    if (!active) return;
    let rafId: number | null = null;
    function update() {
      const header = document.getElementById(`section-${active!.sectionSlug}`);
      if (header && active) {
        setActive({ ...active, rect: header.getBoundingClientRect() });
      }
      rafId = null;
    }
    function onScrollOrResize() {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(update);
    }
    window.addEventListener('scroll', onScrollOrResize, { passive: true });
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize);
      window.removeEventListener('resize', onScrollOrResize);
      if (rafId !== null) window.cancelAnimationFrame(rafId);
    };
  }, [active?.sectionSlug, active?.sequence]);

  if (!mounted || !active) return null;

  // Position the tip just below the header. Falls back to the
  // top-left of the viewport when the header is missing
  // (collapsed / removed). `position: fixed` keeps it on screen
  // during scroll, and the scroll/resize effect above keeps
  // the position in sync.
  const style: React.CSSProperties = active.rect
    ? {
        position: 'fixed',
        top: active.rect.bottom + 8,
        left: Math.max(8, active.rect.left),
        maxWidth: Math.min(560, active.rect.width || 560),
        opacity,
        transition: `opacity ${TIP_FADE_MS}ms ease-out`,
        zIndex: 50
      }
    : {
        position: 'fixed',
        top: 80,
        left: 24,
        maxWidth: 420,
        opacity,
        transition: `opacity ${TIP_FADE_MS}ms ease-out`,
        zIndex: 50
      };

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      data-testid={`inline-issue-tip-${active.sectionSlug}`}
      data-sequence={active.sequence}
      style={style}
      className="rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs leading-snug text-indigo-900 shadow-md dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-100"
    >
      <span className="font-semibold">
        {active.sectionTitle} ·{' '}
      </span>
      <DynamicTipInline
        criterion={active.criterion}
        dynamicTips={dynamicTips}
      />
    </div>,
    document.body
  );
}

function clearTimer(ref: React.MutableRefObject<number | null>) {
  if (ref.current !== null) {
    window.clearTimeout(ref.current);
    ref.current = null;
  }
}