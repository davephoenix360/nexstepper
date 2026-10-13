'use client';

/**
 * The feedback form. Used by:
 *   - `/feedback` (standalone page, full-page layout)
 *   - The dashboard floating "Feedback" pill (in a Dialog)
 *
 * Both call sites are client-side; the server boundary is the
 * `submitFeedbackAction` Server Action the form invokes on submit.
 *
 * Why a single shared component: copy/UX changes ripple to both
 * surfaces automatically. The Dialog vs. full-page presentation is
 * the caller's concern; this component just renders the form.
 */
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { CheckCircle2, MessageSquare } from 'lucide-react';

import { submitFeedbackAction } from '@/app/actions/feedback';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_CATEGORY_LABELS,
  FEEDBACK_EMAIL_MAX,
  FEEDBACK_MESSAGE_MAX,
  FEEDBACK_MESSAGE_MIN,
  type FeedbackCategory
} from '@/lib/feedback/schema';

export interface FeedbackFormProps {
  /**
   * When true (used inside a Dialog), the form auto-closes on
   * successful submit. The Dialog wrapper subscribes to this by
   * listening for the success state via `onSubmitted` instead — see
   * the dialog component for the wiring. Defaults to false.
   */
  variant?: 'page' | 'dialog';
  /** Called once when the form has been successfully submitted. */
  onSubmitted?: () => void;
}

export function FeedbackForm({
  variant = 'page',
  onSubmitted
}: FeedbackFormProps) {
  const [message, setMessage] = useState('');
  const [category, setCategory] = useState<FeedbackCategory>('idea');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<
    Record<string, string[]> | undefined
  >(undefined);
  const [submitted, setSubmitted] = useState(false);
  const [githubSynced, setGithubSynced] = useState(false);
  const [isPending, startTransition] = useTransition();

  const charCount = message.length;
  const charCountClass = cn(
    'text-xs',
    charCount > FEEDBACK_MESSAGE_MAX
      ? 'text-destructive'
      : charCount > FEEDBACK_MESSAGE_MAX * 0.9
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-muted-foreground'
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors(undefined);

    startTransition(async () => {
      const result = await submitFeedbackAction({
        message: message.trim(),
        category,
        email: email.trim()
      });
      if (!result.ok) {
        setError(result.error);
        setFieldErrors(result.fieldErrors);
        return;
      }
      setGithubSynced(result.data.githubSynced);
      setSubmitted(true);
      onSubmitted?.();
    });
  }

  // ── Success state ────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div
        className="flex flex-col items-center gap-3 py-6 text-center"
        data-testid="feedback-success"
      >
        <CheckCircle2 className="size-10 text-emerald-600" aria-hidden="true" />
        <h2 className="text-lg font-semibold tracking-tight">Thanks — got it.</h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          We read every note personally.{' '}
          {githubSynced
            ? 'It just landed as a tracked issue in our queue, so you\u2019ll see it move the moment we triage it.'
            : "We\u2019ve saved it and will pick it up from the dashboard \u2014 the GitHub sync is offline for this submission, but nothing\u2019s lost on our end."}
        </p>
        {variant === 'page' ? (
          <Button asChild variant="outline" className="mt-2">
            <Link href="/">Back to home</Link>
          </Button>
        ) : null}
      </div>
    );
  }

  // ── Form ─────────────────────────────────────────────────────────────
  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-5"
      data-testid="feedback-form"
      noValidate
    >
      <div className="space-y-2">
        <Label htmlFor="feedback-category">What kind of feedback?</Label>
        <RadioGroup
          id="feedback-category"
          value={category}
          onValueChange={(v) => setCategory(v as FeedbackCategory)}
          className="grid gap-2 sm:grid-cols-3"
        >
          {FEEDBACK_CATEGORIES.map((value) => (
            <Label
              key={value}
              htmlFor={`feedback-cat-${value}`}
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded-md border bg-background px-3 py-2.5 text-sm transition-colors',
                'hover:bg-accent/40',
                category === value &&
                  'border-foreground/40 bg-accent/60 ring-1 ring-foreground/20'
              )}
            >
              <RadioGroupItem
                id={`feedback-cat-${value}`}
                value={value}
                data-testid={`feedback-cat-${value}`}
              />
              <span>{FEEDBACK_CATEGORY_LABELS[value]}</span>
            </Label>
          ))}
        </RadioGroup>
        {fieldErrors?.category && (
          <p className="text-xs text-destructive" role="alert">
            {fieldErrors.category.join(' ')}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <Label htmlFor="feedback-message">What’s on your mind?</Label>
          <span className={charCountClass} aria-live="polite">
            {charCount.toLocaleString()} / {FEEDBACK_MESSAGE_MAX.toLocaleString()}
          </span>
        </div>
        <Textarea
          id="feedback-message"
          required
          minLength={FEEDBACK_MESSAGE_MIN}
          maxLength={FEEDBACK_MESSAGE_MAX}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={6}
          placeholder={
            variant === 'dialog'
              ? 'Tell us what\u2019s going on, what you were trying to do, and what you expected.'
              : 'A bug, a missing feature, a question, a kind word \u2014 whatever\u2019s on your mind. The more specific you can be, the faster we can act on it.'
          }
          aria-describedby="feedback-message-help"
          data-testid="feedback-message"
        />
        <p
          id="feedback-message-help"
          className="text-xs text-muted-foreground"
        >
          {FEEDBACK_MESSAGE_MIN}\u2013{FEEDBACK_MESSAGE_MAX.toLocaleString()}{' '}
          characters. Submissions become a public GitHub issue, so please
          don’t include anything you wouldn’t want linked to your
          account.
        </p>
        {fieldErrors?.message && (
          <p className="text-xs text-destructive" role="alert">
            {fieldErrors.message.join(' ')}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="feedback-email">
          Reply-to email{' '}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Input
          id="feedback-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          maxLength={FEEDBACK_EMAIL_MAX}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          data-testid="feedback-email"
        />
        <p className="text-xs text-muted-foreground">
          Only used if we need to follow up. Never shared.
        </p>
        {fieldErrors?.email && (
          <p className="text-xs text-destructive" role="alert">
            {fieldErrors.email.join(' ')}
          </p>
        )}
      </div>

      {error && (
        <div
          role="alert"
          data-testid="feedback-error"
          className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-1">
        <Button
          type="submit"
          disabled={
            isPending ||
            message.trim().length < FEEDBACK_MESSAGE_MIN ||
            charCount > FEEDBACK_MESSAGE_MAX
          }
          data-testid="feedback-submit"
        >
          <MessageSquare className="mr-1.5 size-4" aria-hidden="true" />
          {isPending ? 'Sending\u2026' : 'Send feedback'}
        </Button>
      </div>
    </form>
  );
}
