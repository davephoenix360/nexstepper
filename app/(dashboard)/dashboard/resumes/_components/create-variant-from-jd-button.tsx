'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Briefcase, Loader2, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
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

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setError(null);
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const trimmed = jdText.trim();
    if (trimmed.length < 50) {
      setError('Paste at least 50 characters so the AI can parse it.');
      return;
    }

    startTransition(async () => {
      const result = await createVariantFromJdAction({
        masterId,
        jdText: trimmed
      });

      if (!result.ok) {
        setError(
          result.fieldErrors?.jdText?.[0] ?? result.error ?? 'Could not create variant'
        );
        return;
      }

      setOpen(false);
      setJdText('');
      router.push(`/dashboard/resumes/${result.data.id}`);
      router.refresh();
    });
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
        <form onSubmit={handleSubmit} className="space-y-4">
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
              className="font-mono text-xs"
              data-testid={`jd-input-${masterId}`}
            />
            <p className="text-xs text-muted-foreground">
              Minimum 50 characters. The text is sent to Vercel AI
              Gateway to parse title/company/keywords once — not stored
              on a third-party server beyond the call.
            </p>
          </div>

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
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
    </>
  );
}