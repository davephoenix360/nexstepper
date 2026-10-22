'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Briefcase, Loader2, RefreshCw, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { AiParsingModal } from '@/components/resumes/ai-parsing-modal';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

import { createVariantFromJdAction } from '../actions';

/**
 * The variant-first UX's "headline CTA" (plan:
 * docs/plans/variant-first-ux.md §"Slice 3"): a single click that
 * creates a variant AND attaches the job description in one step.
 *
 * The user flow:
 *   1. Click "Tailor with a job description" on a master card.
 *   2. Dialog opens with a single textarea for the JD.
 *   3. Submit -> Server Action creates the variant (deep copy of
 *      master) with the JD stored on `data.jobContext`.
 *   4. Redirect to the new variant's editor where the right rail
 *      (Slice 2) already shows the JD preview + ATS scorecard
 *      stub.
 *
 * This sits NEXT TO the simple `CreateVariantButton` (deep copy
 * with no JD). The JD-based one is the primary CTA per the plan;
 * the no-JD one is a fallback for users who just want a blank
 * variant to fill in later.
 *
 * Phase 1f — try again affordance (plan:
 * docs/plans/ai-retry-hardening.md). Same shape as the import-resume
 * error card: AlertCircle + friendly text + Try again button that
 * re-submits with the existing form state. Even though the visible
 * error path here is mostly transient DB failures (the action
 * silently swallows the AI failures on the parsing side), having
 * the same UX pattern across both import flows keeps the muscle
 * memory consistent.
 */
export function CreateVariantFromJdButton({
  masterId,
  masterName
}: {
  masterId: string;
  masterName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [jdText, setJdText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  /**
   * Parsing-modal state. `stage` drives the shared `<AiParsingModal />`
   * (working → success), and `createdVariantId` is held so the modal can
   * play its success beat before we navigate away.
   */
  const [stage, setStage] = useState<'idle' | 'working' | 'done'>('idle');
  const [createdVariantId, setCreatedVariantId] = useState<string | null>(null);
  /**
   * True from the moment the user submits until the parsing modal has
   * handed off to the new variant.
   *
   * This exists because the form `<Dialog>` is a NATIVE `<dialog>`
   * element opened with `showModal()`, which puts it in the browser's
   * TOP LAYER. Top-layer elements paint above everything else regardless
   * of z-index, so while the dialog is open the parsing modal is
   * invisible no matter how high its z-index is.
   *
   * The fix is to CLOSE the form dialog once the variant exists, so the
   * parsing modal becomes the only thing on screen. But closing it
   * fires the dialog's `close` event → `onOpenChange(false)`, which
   * used to reset the stage and kill the success beat mid-flight. This
   * ref makes that reset conditional, so the two can no longer race.
   */
  const modalInFlight = useRef(false);

  function handleOpenChange(next: boolean) {
    if (pending) return; // don't bail mid-submit
    setOpen(next);
    if (!next) {
      setError(null);
      // Only reset the parsing modal if it isn't mid-flight — closing
      // the form dialog is now part of the happy path.
      if (!modalInFlight.current) {
        setStage('idle');
        setCreatedVariantId(null);
      }
    }
  }

  function handleSubmit(e?: React.FormEvent<HTMLFormElement>) {
    e?.preventDefault();
    setError(null);

    const trimmed = jdText.trim();
    if (trimmed.length < 50) {
      setError('Paste at least 50 characters so the AI can parse it.');
      return;
    }

    // Raise the modal before the round-trip so the user gets the working
    // beat (headline + tips) for the whole parse, not just the last second.
    modalInFlight.current = true;
    setStage('working');
    // Close the form dialog NOW, not after the action resolves.
    //
    // A native <dialog> opened with showModal() sits in the browser's
    // top layer and paints over everything, so while it is open the
    // full-screen parsing modal is invisible no matter its z-index.
    // Leaving it open for the ~20s parse left the user watching a small
    // "Creating variant…" button instead of the progress view the code
    // was written to give them.
    //
    // On failure the dialog is reopened below with the error and the
    // text they pasted still intact.
    setOpen(false);

    startTransition(async () => {
      const result = await createVariantFromJdAction({
        masterId,
        jdText: trimmed
      });

      if (!result.ok) {
        setError(
          result.fieldErrors?.jdText?.[0] ?? result.error ?? 'Could not create variant'
        );
        setStage('idle');
        modalInFlight.current = false;
        // Bring the form back so the error is somewhere the user can see
        // it and can retry.
        setOpen(true);
        return;
      }

      setJdText('');
      // Hold the parsing modal's success beat, which owns the timing and
      // then navigates. `done` (NOT 'working') is what triggers the
      // auto-dismiss and therefore the navigation — setting 'working'
      // here left the modal on the loading beat forever and the user
      // was never taken to their new variant.
      setCreatedVariantId(result.data.id);
      setStage('done');
    });
  }

  /**
   * Try-again handler. We re-trigger the existing form submit
   (via `formRef.current?.requestSubmit()`) so the same
   * validation + state-clearing logic runs; we don't have to
   * duplicate handleSubmit's payload-resolution code here.
   */
  function handleRetry() {
    setError(null);
    formRef.current?.requestSubmit();
  }

  const canSubmit = jdText.trim().length >= 50 && !pending;

  return (
    <>
      <Button
        type="button"
        size="sm"
        onClick={() => setOpen(true)}
        data-testid={`tailor-with-jd-${masterId}`}
      >
        <Sparkles className="mr-1.5 h-3.5 w-3.5" />
        Tailor with a JD
      </Button>

      <Dialog
        open={open}
        onOpenChange={handleOpenChange}
        title="Tailor this resume for a specific role"
        description={`Creates a new variant branched from "${masterName}" with your JD attached. The right-rail panel + Optimize tool will score against it.`}
      >
        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`jd-${masterId}`} className="flex items-center gap-1.5">
              <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
              Job description
            </Label>
            <Textarea
              id={`jd-${masterId}`}
              value={jdText}
              onChange={(e) => setJdText(e.target.value)}
              placeholder="Paste the full job description here. Include the role title, requirements, and any context — the AI parses this for the scorecard."
              rows={10}
              disabled={pending}
              required
              minLength={50}
              maxLength={20_000}
              // Cap height at 50vh + internal scroll so a giant JD
              // can't push the modal past the viewport. The base
              // `<Textarea>` uses `field-sizing-content` (auto-grows
              // with content) which is fine inline but wrong inside
              // a modal — `max-h` + `overflow-y-auto` overrides
              // that, keeping the textarea scrollable in place
              // while the Cancel / Create-variant buttons stay
              // visible below.
              className="max-h-[50vh] min-h-0 overflow-y-auto font-mono text-xs"
              data-testid={`jd-input-${masterId}`}
            />
            <p className="text-xs text-muted-foreground">
              Minimum 50 characters. The text is sent to Vercel AI
              Gateway to parse title/company/keywords once — not stored
              on a third-party server beyond the call.
            </p>
          </div>

          {error && (
            <div
              role="alert"
              data-testid="jd-error-card"
              className="flex flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm"
            >
              <div className="flex items-start gap-2">
                <AlertCircle
                  aria-hidden
                  className="h-4 w-4 shrink-0 text-destructive"
                />
                <div className="flex-1 space-y-1">
                  <p className="font-medium text-destructive">
                    We couldn&rsquo;t create this variant
                  </p>
                  <p className="text-foreground/80">{error}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 pl-6">
                <Button
                  type="button"
                  size="sm"
                  variant="default"
                  onClick={handleRetry}
                  data-testid="jd-error-retry"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Try again
                </Button>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 border-t pt-3">
            <Button type="submit" disabled={!canSubmit}>
              {pending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating variant…
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Create variant
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => handleOpenChange(false)}
              disabled={pending}
            >
              Cancel
            </Button>
          </div>
        </form>
      </Dialog>

      {/*
        Same modal, same tips carousel as the resume import — a JD parse is
        the same 30–90s wait and deserves the same treatment. The tips are
        NOT filtered: while a JD is being parsed the most useful thing to
        tell someone is how Nexstepper thinks about tailoring (master vs
        variant is the concept they are acting on right now).

        It portals over the Dialog, so the Dialog stays mounted underneath
        purely as a form container and the user never sees two stacked
        panels.
      */}
      <AiParsingModal
        open={stage !== 'idle'}
        stageLabel={
          stage === 'done'
            ? 'Done'
            : 'Reading the job description and reviewing your resume…'
        }
        done={stage === 'done'}
        doneTitle="Your tailored variant is ready 🎉"
        doneMessage="We matched it against your master, scored it, and reviewed it against the role — taking you there now…"
        onDismiss={
          createdVariantId
            ? () => {
                modalInFlight.current = false;
                setOpen(false);
                setStage('idle');
                setCreatedVariantId(null);
                router.push(`/dashboard/resumes/${createdVariantId}?autotailor=1`);
                router.refresh();
              }
            : undefined
        }
      />
    </>
  );
}