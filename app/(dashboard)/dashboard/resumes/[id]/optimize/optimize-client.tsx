'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  RotateCw,
  Sparkles
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

import {
  applyOptimizeSummaryAction,
  runOptimizeSummaryAction
} from '../optimize-actions';

type Stage =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'done'; original: string; optimized: string }
  | { kind: 'error'; message: string };

/**
 * The interactive part of the Optimize tool.
 *
 * Stages:
 *   idle     — user is filling in the JD
 *   running  — the AI is rewriting (show staged progress)
 *   done     — original + optimized are visible side-by-side
 *   error    — show the AI failure message; offer retry
 *
 * On accept: save the optimized summary as a new revision and
 *   redirect back to the editor.
 * On dismiss: drop the optimized text; the user can edit again.
 */
export function OptimizeSummaryClient({
  resumeId,
  currentSummary
}: {
  resumeId: string;
  currentSummary: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [stage, setStage] = useState<Stage>({ kind: 'idle' });
  const [jdText, setJdText] = useState('');
  const [applying, setApplying] = useState(false);

  function handleRun() {
    if (!jdText.trim()) return;

    setStage({ kind: 'running' });
    startTransition(async () => {
      const result = await runOptimizeSummaryAction({
        resumeId,
        jdText
      });

      if (!result.ok) {
        setStage({ kind: 'error', message: result.error });
        return;
      }
      setStage({
        kind: 'done',
        original: result.original,
        optimized: result.optimized
      });
    });
  }

  async function handleAccept() {
    if (stage.kind !== 'done') return;
    setApplying(true);

    const result = await applyOptimizeSummaryAction({
      resumeId,
      optimizedSummary: stage.optimized
    });

    setApplying(false);

    if (!result.ok) {
      setStage({ kind: 'error', message: result.error });
      return;
    }
    router.push(`/dashboard/resumes/${resumeId}`);
    router.refresh();
  }

  function handleRetry() {
    setStage({ kind: 'idle' });
  }

  function handleDismiss() {
    setStage({ kind: 'idle' });
    setJdText('');
  }

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-3">
        <Link href={`/dashboard/resumes/${resumeId}`}>
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Back to editor
        </Link>
      </Button>

      <section className="rounded-lg border bg-card p-5">
        <h2 className="text-sm font-medium text-muted-foreground">
          Current summary
        </h2>
        <p
          className={cn(
            'mt-2 whitespace-pre-wrap text-sm leading-relaxed',
            !currentSummary && 'italic text-muted-foreground'
          )}
        >
          {currentSummary ||
            '(no summary yet — the optimizer will write a fresh one)'}
        </p>
      </section>

      {stage.kind === 'done' ? (
        <ResultView
          original={stage.original}
          optimized={stage.optimized}
          applying={applying}
          onAccept={handleAccept}
          onDismiss={handleDismiss}
        />
      ) : (
        <FormView
          jdText={jdText}
          onJdChange={setJdText}
          running={pending && stage.kind === 'running'}
          errorMessage={stage.kind === 'error' ? stage.message : null}
          onSubmit={handleRun}
          onRetry={handleRetry}
        />
      )}
    </div>
  );
}

function FormView({
  jdText,
  onJdChange,
  running,
  errorMessage,
  onSubmit,
  onRetry
}: {
  jdText: string;
  onJdChange: (s: string) => void;
  running: boolean;
  errorMessage: string | null;
  onSubmit: () => void;
  onRetry: () => void;
}) {
  const canSubmit = jdText.trim().length >= 200 && !running;
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="jd">Job description</Label>
        <Textarea
          id="jd"
          name="jd"
          rows={12}
          value={jdText}
          onChange={(e) => onJdChange(e.target.value)}
          placeholder="Paste the full job description here. Include the company name, the role title, and the requirements — the more context, the better the rewrite."
          disabled={running}
          required
          minLength={200}
          maxLength={20_000}
          className="font-mono text-sm"
        />
        <p className="text-xs text-muted-foreground">
          Minimum 200 characters. Your text is sent to the AI provider
          via Vercel AI Gateway and is not stored.
        </p>
      </div>

      {errorMessage && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <p className="flex-1">{errorMessage}</p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRetry}
            className="h-7 px-2"
          >
            <RotateCw className="mr-1 h-3 w-3" />
            Try again
          </Button>
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={!canSubmit}>
          {running ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Optimizing…
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" />
              Optimize summary
            </>
          )}
        </Button>
        <span className="text-xs text-muted-foreground">
          Typically takes 3–8 seconds.
        </span>
      </div>
    </form>
  );
}

function ResultView({
  original,
  optimized,
  applying,
  onAccept,
  onDismiss
}: {
  original: string;
  optimized: string;
  applying: boolean;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  return (
    <section className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <SideBySide label="Current" body={original} />
        <SideBySide
          label="Optimized"
          body={optimized}
          highlight
          badge="AI suggestion"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t pt-4">
        <Button onClick={onAccept} disabled={applying}>
          {applying ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving…
            </>
          ) : (
            <>
              <Check className="mr-2 h-4 w-4" />
              Accept &amp; save
            </>
          )}
        </Button>
        <Button variant="ghost" onClick={onDismiss} disabled={applying}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Dismiss
        </Button>
        <span className="ml-auto text-xs text-muted-foreground">
          Accepting creates a new revision — your current summary
          stays in revision history.
        </span>
      </div>
    </section>
  );
}

function SideBySide({
  label,
  body,
  highlight,
  badge
}: {
  label: string;
  body: string;
  highlight?: boolean;
  badge?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-lg border bg-card p-5',
        highlight && 'border-emerald-200 bg-emerald-50/40'
      )}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">
          {label}
        </h3>
        {badge && (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
            {badge}
          </span>
        )}
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">
        {body || (
          <span className="italic text-muted-foreground">(empty)</span>
        )}
      </p>
    </div>
  );
}
