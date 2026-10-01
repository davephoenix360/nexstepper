'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Sparkles } from 'lucide-react';

import {
  HEADLINE_INTERVAL_MS,
  PARSING_HEADLINES,
  RESUME_TIPS,
  TIP_INTERVAL_MS,
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
    Math.floor(Math.random() * RESUME_TIPS.length)
  );

  useEffect(() => setMounted(true), []);

  // Restart both rotations from a fresh random offset every time the modal
  // opens, so a second import in the same session doesn't replay the exact
  // same headline the user already read.
  useEffect(() => {
    if (!open) return;
    setHeadlineIndex(Math.floor(Math.random() * PARSING_HEADLINES.length));
    setTipIndex(Math.floor(Math.random() * RESUME_TIPS.length));
  }, [open]);

  useEffect(() => {
    if (!open || done) return;
    const headlineTimer = setInterval(() => {
      setHeadlineIndex((i) => (i + 1) % PARSING_HEADLINES.length);
    }, HEADLINE_INTERVAL_MS);
    return () => clearInterval(headlineTimer);
  }, [open, done]);

  useEffect(() => {
    if (!open || done) return;
    const tipTimer = setInterval(() => {
      setTipIndex((i) => (i + 1) % RESUME_TIPS.length);
    }, TIP_INTERVAL_MS);
    return () => clearInterval(tipTimer);
  }, [open, done]);

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

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm no-print"
      role="dialog"
      aria-modal="true"
      aria-live="polite"
      aria-label={done ? doneTitle : 'Building your resume'}
      data-testid="ai-parsing-modal"
      data-done={done ? 'true' : 'false'}
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-xl">
        {/*
          Icon. Spinner while working; a green check that scales and fades in
          on success. Cross-fading the two (rather than swapping) is what
          makes the transition read as one continuous beat instead of a jump.
        */}
        <div className="relative mx-auto mb-6 flex h-16 w-16 items-center justify-center">
          <div
            className={`absolute inset-0 flex items-center justify-center rounded-full bg-primary/10 transition-all duration-500 ${
              done ? 'scale-75 opacity-0' : 'scale-100 opacity-100'
            }`}
          >
            <Sparkles className="h-8 w-8 animate-pulse text-primary" aria-hidden="true" />
          </div>
          <div
            className={`absolute inset-0 flex items-center justify-center rounded-full bg-emerald-100 transition-all duration-500 ${
              done ? 'scale-100 opacity-100' : 'scale-50 opacity-0'
            }`}
          >
            <Check
              className="h-8 w-8 text-emerald-600"
              strokeWidth={3}
              aria-hidden="true"
              data-testid="parsing-success-check"
            />
          </div>
        </div>

        {/* Headline — rotates while working, becomes the success message. */}
        <h2
          className="min-h-[3.5rem] text-xl font-semibold leading-snug tracking-tight sm:text-2xl"
          data-testid="parsing-headline"
        >
          {done ? doneTitle : PARSING_HEADLINES[headlineIndex]}
        </h2>

        {done && (
          <p className="mt-2 text-sm text-muted-foreground" data-testid="parsing-done-message">
            {doneMessage}
          </p>
        )}

        {/* Stage, tip carousel, and ETA all belong to the *working* state.
            Keeping them on screen through the success beat would undercut it
            — the ETA line would still be telling the user to wait. They fade
            out instead of unmounting so the card doesn't jump in height. */}
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

          {/* Tip card */}
          <div
            className="mt-6 rounded-xl border border-border/60 bg-muted/40 p-5 text-left"
            data-testid="parsing-tip"
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {CATEGORY_LABEL[tip.category]}
            </p>
            <p className="mt-2 text-sm leading-relaxed">
              <span aria-hidden="true" className="mr-2">
                {tip.emoji}
              </span>
              {tip.text}
            </p>
          </div>

          {/* Dot indicators */}
          <div className="mt-5 flex justify-center gap-1.5" aria-hidden="true">
            {tips.map((t, i) => (
              <span
                key={`${t.category}-${i}`}
                className={cn(
                  'h-1.5 rounded-full transition-all duration-300',
                  i === tipIndex % tips.length
                    ? 'w-5 bg-primary'
                    : 'w-1.5 bg-muted-foreground/30'
                )}
              />
            ))}
          </div>

          <p className="mt-6 text-xs text-muted-foreground">
            This usually takes 30–60 seconds. You can leave this tab open — we&apos;ll keep
            working.
          </p>
        </div>
      </div>
    </div>,
    document.body
  );
}
