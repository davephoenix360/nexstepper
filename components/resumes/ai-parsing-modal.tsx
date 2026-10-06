'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Sparkles } from 'lucide-react';

import {
  HEADLINE_INTERVAL_MS,
  PARSING_HEADLINES,
  RESUME_TIPS,
  tipDurationMs,
  type ResumeTipCategory
} from '@/lib/resume-tips';
import { cn } from '@/lib/utils';

interface AiParsingModalProps {
  /** Whether the work is actually in flight. */
  open: boolean;
  /** Current stage, rendered as a small step pill. */
  stageLabel: string;
  /**
   * Flip to true once the work lands so the modal can play its success beat
   * (spinner → checkmark → "ready to view") before dismissing.
   *
   * The parent owns the truth; the modal owns the choreography. It auto-dismisses
   * shortly after this flips, so a caller that flips it never has to unmount
   * the modal by hand.
   */
  done?: boolean;
  /** Headline shown in the success beat. */
  doneTitle?: string;
  /** Sub-line shown in the success beat. */
  doneMessage?: string;
  /**
   * Restrict the tip carousel to one category. A JD parse is better served by
   * "how to read a job description" advice than by resume-craft tips.
   */
  tipFilter?: ResumeTipCategory;
  /**
   * Called ~1.5s after `done` flips, so the caller can clear its own `open`
   * state. Optional — without it the modal just stays on the success beat.
   */
  onDismiss?: () => void;
}

/**
 * How long the success beat stays up before the modal dismisses. Long enough
 * to register, short enough that it doesn't feel like a second wait — the
 * user has already been waiting 30–90s.
 */
const SUCCESS_HOLD_MS = 1_500;

const CATEGORY_LABEL: Record<ResumeTipCategory, string> = {
  resume: 'Resume tip',
  'cover-letter': 'Cover letter tip',
  nexstepper: 'Using Nexstepper'
};

/**
 * Full-screen loading modal shown while an AI resume import runs.
 *
 * Why a modal rather than an inline indicator: the import takes 30–90s, and
 * on a long form the inline spinner is easy to lose track of while scrolling.
 * A modal cannot be scrolled away from, and the tip carousel turns the wait
 * into a teaching moment — the user learns what a master resume is and how
 * variants work while their first import is being parsed.
 *
 * Rendered through a portal to `document.body` so the dashboard's sticky /
 * transformed ancestors can't trap it inside their bounding box — the same
 * reason `ChatBubble` portals its floating UI.
 *
 * Intentionally NOT dismissible: the underlying action is a Server Action
 * that cannot be cancelled, so a close button would only let the user stare
 * at a frozen form. On failure the parent closes the modal and renders the
 * error card instead.
 *
 * Tip rotation (v2, Oct 2026): the previous build used a single fixed
 * `TIP_INTERVAL_MS = 6_000` constant. That meant a 30-word tip flashed by
 * faster than a comfortable read, and a 12-word tip sat on screen longer
 * than needed. v2 calls `tipDurationMs(tip.text)` to compute a per-tip
 * display duration from the tip's word count at NN/G's 3-WPS carousel
 * standard — see `resume-tips.ts` for the research citations.
 *
 * Visual (v2): dropped the trailing emojis from the rotating headlines
 * ("Sprinkling stardust…", "Like a boss…") and stripped the heavy
 * `bg-muted/40` card around the tip in favour of a thin left-border
 * accent + more whitespace. The carousel indicator is now a thin
 * progress bar that fills over each tip's computed duration rather
 * than static dots — gives the user a visible "how long until the
 * next tip" cue without showing a clock.
 */
export function AiParsingModal({
  open,
  stageLabel,
  done = false,
  doneTitle = 'Your resume is ready to view',
  doneMessage = 'Everything parsed nicely. Taking you there now…',
  tipFilter,
  onDismiss
}: AiParsingModalProps) {
  const [mounted, setMounted] = useState(false);
  const tips = useMemo(
    () => (tipFilter ? RESUME_TIPS.filter((t) => t.category === tipFilter) : RESUME_TIPS),
    [tipFilter]
  );
  const [headlineIndex, setHeadlineIndex] = useState(() =>
    Math.floor(Math.random() * PARSING_HEADLINES.length)
  );
  const [tipIndex, setTipIndex] = useState(() =>
    Math.floor(Math.random() * tips.length)
  );
  /**
   * Drives the thin progress bar under the tip. Reset to 0 every time
   * `tipIndex` changes; the per-tip `setTimeout` below ticks it up.
   * We animate it with a CSS class rather than `requestAnimationFrame`
   * so the render loop is the standard React one (no jitter, no
   * floating-point drift).
   */
  const [progressKey, setProgressKey] = useState(0);

  useEffect(() => setMounted(true), []);

  // Restart both rotations from a fresh random offset every time the modal
  // opens, so a second import in the same session doesn't replay the exact
  // same headline the user already read.
  useEffect(() => {
    if (!open) return;
    setHeadlineIndex(Math.floor(Math.random() * PARSING_HEADLINES.length));
    setTipIndex(Math.floor(Math.random() * tips.length));
    setProgressKey((k) => k + 1);
  }, [open, tips]);

  useEffect(() => {
    if (!open || done) return;
    const headlineTimer = setInterval(() => {
      setHeadlineIndex((i) => (i + 1) % PARSING_HEADLINES.length);
    }, HEADLINE_INTERVAL_MS);
    return () => clearInterval(headlineTimer);
  }, [open, done]);

  // Per-tip duration. We schedule the NEXT tip with that tip's own duration
  // (so a long tip stays longer, a short one rotates faster). On every
  // change of `tipIndex`, we re-key the progress bar so it resets to 0%
  // and animates back up over the new tip's display time.
  const tipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!open || done) return;
    const currentTip = tips[tipIndex % tips.length];
    const ms = tipDurationMs(currentTip.text);
    tipTimerRef.current = setTimeout(() => {
      setTipIndex((i) => (i + 1) % tips.length);
    }, ms);
    return () => {
      if (tipTimerRef.current) {
        clearTimeout(tipTimerRef.current);
        tipTimerRef.current = null;
      }
    };
  }, [open, done, tipIndex, tips]);

  // Auto-dismiss shortly after success, so the user gets a beat to register
  // "it's done" before we navigate. The parent navigates on its own; this
  // only controls the modal's own lifetime.
  useEffect(() => {
    if (!open || !done) return;
    const t = setTimeout(() => onDismiss?.(), SUCCESS_HOLD_MS);
    return () => clearTimeout(t);
  }, [open, done, onDismiss]);

  const tip = useMemo(() => tips[tipIndex % tips.length], [tips, tipIndex]);

  // Prevent the page behind the modal from scrolling while it's open.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!mounted || !open) return null;

  // For the progress bar: the CSS animation length tracks each tip's
  // individual display duration. We key it on `progressKey` (incremented
  // every time the tip changes) so React unmounts the old animation and
  // starts a fresh one — without the key, the bar would just stay full
  // from the previous tip's leftover animation.
  const tipDisplayMs = tipDurationMs(tip.text);

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-background/70 p-4 backdrop-blur-md no-print"
      role="dialog"
      aria-modal="true"
      aria-live="polite"
      aria-label={done ? doneTitle : 'Building your resume'}
      data-testid="ai-parsing-modal"
      data-done={done ? 'true' : 'false'}
    >
      <div className="w-full max-w-md rounded-2xl border border-border/60 bg-card px-8 py-10 text-center shadow-sm">
        {/*
          Icon. Spinner while working; a green check that scales and fades in
          on success. Cross-fading the two (rather than swapping) is what
          makes the transition read as one continuous beat instead of a jump.
        */}
        <div className="relative mx-auto mb-7 flex h-14 w-14 items-center justify-center">
          <div
            className={`absolute inset-0 flex items-center justify-center rounded-full bg-primary/10 transition-all duration-500 ${
              done ? 'scale-75 opacity-0' : 'scale-100 opacity-100'
            }`}
          >
            <Sparkles className="h-7 w-7 animate-pulse text-primary" aria-hidden="true" />
          </div>
          <div
            className={`absolute inset-0 flex items-center justify-center rounded-full bg-emerald-100 transition-all duration-500 ${
              done ? 'scale-100 opacity-100' : 'scale-50 opacity-0'
            }`}
          >
            <Check
              className="h-7 w-7 text-emerald-600"
              strokeWidth={3}
              aria-hidden="true"
              data-testid="parsing-success-check"
            />
          </div>
        </div>

        {/* Headline — rotates while working, becomes the success message.
            Calmer typography (no emoji, no playful adjectives) per v2. */}
        <h2
          className="min-h-[3.25rem] text-[20px] font-medium leading-snug tracking-tight text-foreground sm:text-[22px]"
          data-testid="parsing-headline"
        >
          {done ? doneTitle : PARSING_HEADLINES[headlineIndex]}
        </h2>

        {done && (
          <p className="mt-2 text-sm text-muted-foreground" data-testid="parsing-done-message">
            {doneMessage}
          </p>
        )}

        {/* Stage, tip carousel, and progress bar all belong to the *working*
            state. Keeping them on screen through the success beat would
            undercut it — the progress bar would still be ticking. They
            fade out instead of unmounting so the card doesn't jump in
            height. */}
        <div
          className={cn(
            'transition-opacity duration-500',
            done ? 'pointer-events-none opacity-0' : 'opacity-100'
          )}
        >
          {/* Current stage */}
          <p className="mt-2 text-sm text-muted-foreground" data-testid="parsing-stage">
            {stageLabel}
          </p>

          {/*
            Tip card. v2: thin left-border accent instead of the heavy
            full-border box + `bg-muted/40` background. Generous padding
            and a slightly larger body give the tip room to breathe —
            reads more like an editorial pull-quote than a settings panel.
          */}
          <div
            className="mt-7 rounded-md border-l-2 border-primary/40 bg-transparent pl-4 py-3 pr-2 text-left"
            data-testid="parsing-tip"
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
              {CATEGORY_LABEL[tip.category]}
            </p>
            <p className="mt-2 text-[15px] leading-relaxed text-foreground/90">
              <span aria-hidden="true" className="mr-2 text-base">
                {tip.emoji}
              </span>
              {tip.text}
            </p>
          </div>

          {/*
            Progress indicator — a single thin line that fills left-to-right
            over the current tip's display duration. Replaces the dot row
            (which was static and didn't tell the user anything new). The
            `key={progressKey}` is what actually animates: React unmounts
            the old <div> and mounts a fresh one with the new animation,
            so the bar always starts at 0% when the tip changes. The
            inline `style` overrides Tailwind's animation-duration with
            the per-tip duration.
          */}
          <div
            key={progressKey}
            className="mt-6 h-px w-full overflow-hidden rounded-full bg-border/60"
            aria-hidden="true"
          >
            <div
              className="h-full w-full origin-left bg-foreground/30"
              data-testid="parsing-tip-progress"
              style={{
                animation: `ai-parsing-progress ${tipDisplayMs}ms linear forwards`
              }}
            />
          </div>

          <p className="mt-6 text-xs text-muted-foreground/70">
            This usually takes 30–60 seconds. You can leave this tab open — we&apos;ll keep
            working.
          </p>
        </div>
      </div>

      {/*
        Inline keyframes for the progress bar. Tailwind v4 ships an
        `animate-*` utility for many things but not a single-shot fill
        that takes an arbitrary duration, so we inject the @keyframes
        here at the portal root. `transform-origin: left` + `scaleX(0→1)`
        is GPU-composited and avoids layout thrash.
      */}
      <style>{`
        @keyframes ai-parsing-progress {
          from { transform: scaleX(0); }
          to   { transform: scaleX(1); }
        }
      `}</style>
    </div>,
    document.body
  );
}