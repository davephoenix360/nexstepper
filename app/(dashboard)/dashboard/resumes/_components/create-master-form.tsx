'use client';

import { useState, useTransition, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  Check,
  ChevronDown,
  FileText,
  Loader2,
  PaperclipIcon,
  Plus,
  RefreshCw,
  Sparkles,
  Upload,
  X
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

import { createMasterResumeAction, importResumeAction, type ImportResumeErrorCode } from '../actions';
import { EditorTabs } from './editor-tabs';
import { AiParsingModal } from '@/components/resumes/ai-parsing-modal';

type Mode = 'scratch' | 'import';
type PasteMode = 'file' | 'paste';

const MAX_BYTES = 10 * 1024 * 1024; // mirror importResumeAction's cap
const ACCEPT = '.pdf,.docx,.txt,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/**
 * Inline form at the top of /dashboard/resumes. Two modes:
 *
 *   1. "Start from scratch" — just a name; the editor opens blank.
 *   2. "Import from file" — name + a PDF / DOCX / plain-text file (or
 *      pasted text). Server Action extracts the text, calls the AI
 *      Gateway (Mistral Nemo primary, with fallbacks) to parse into
 *      the ResumeSections shape, and creates the master with the
 *      parsed data already in the first revision.
 *
 * Phase 1e — UX hardening after the Sep 28 latency audit:
 *   - Pre-submit ETA hint ("this usually takes 30-60s").
 *   - Step indicator while pending (Reading → Analyzing → Saving).
 *   - Error card with AlertCircle + friendly text + Try again button
 *     + "What happened?" disclosure for the raw technical detail.
 *   - Page-level maxDuration = 300s on the Server Action so Vercel
 *     doesn't kill it at the default 10/15s.
 *
 * Plan: docs/plans/import-ux-and-timeouts.md
 */
export function CreateMasterResumeForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<Mode>('scratch');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<ImportResumeErrorCode | null>(null);
  const [technical, setTechnical] = useState<string | null>(null);
  const [stage, setStage] = useState<ImportStage>('idle');
  /**
   * Id of the resume the last import just created. Held in state (rather than
   * navigating inline) so the parsing modal can play its success beat before
   * the route changes.
   */
  const [createdResumeId, setCreatedResumeId] = useState<string | null>(null);
  const importFormRef = useRef<HTMLFormElement>(null);

  // Import-mode state
  const [pasteMode, setPasteMode] = useState<PasteMode>('file');
  const [file, setFile] = useState<File | null>(null);
  const [pastedText, setPastedText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset state when the user switches modes.
  useEffect(() => {
    setError(null);
    setErrorCode(null);
    setTechnical(null);
    setStage('idle');
    setCreatedResumeId(null);
    if (mode === 'scratch') {
      setFile(null);
      setPastedText('');
    }
    // Always clear the underlying <input type="file"> value so the
    // user can re-pick the same file after toggling modes (the input
    // element doesn't fire onChange when the value is unchanged).
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [mode]);

  function handleScratchSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setErrorCode(null);
    setTechnical(null);

    const trimmed = name.trim();
    if (!trimmed) {
      setError('Name is required');
      return;
    }

    startTransition(async () => {
      const result = await createMasterResumeAction({ name: trimmed });
      if (!result.ok) {
        setError(
          result.fieldErrors?.name?.[0] ?? result.error ?? 'Could not create resume'
        );
        return;
      }
      router.push(`/dashboard/resumes/${result.data.id}`);
      router.refresh();
    });
  }

  function handleImportSubmit(e?: React.FormEvent<HTMLFormElement>) {
    e?.preventDefault();
    setError(null);
    setErrorCode(null);
    setTechnical(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Name is required');
      return;
    }

    // Resolve the input source: file upload OR pasted text.
    let payload: File | null = null;
    if (pasteMode === 'file') {
      if (!file) {
        setError('Pick a PDF / DOCX / text file to import');
        return;
      }
      if (file.size > MAX_BYTES) {
        setError(
          `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB; max ${MAX_BYTES / 1024 / 1024} MB).`
        );
        return;
      }
      payload = file;
    } else {
      const text = pastedText.trim();
      if (text.length < 100) {
        setError(
          'Paste a longer resume (at least a few lines — the parser needs enough context).'
        );
        return;
      }
      // Convert the pasted text into a File so the action can stay
      // format-agnostic. .txt extension makes inferFileType happy.
      payload = new File([text], `${trimmedName}.txt`, { type: 'text/plain' });
    }

    // Two honest staged steps visible to the user (file-read runs
    // locally, the rest is a single server-side hop because Server
    // Actions don't stream progress). "Saving" stage is reserved for
    // the future post-AI DB write step; today stages are reading →
    // parsing → done.
    setStage('reading');
    startTransition(async () => {
      // Tiny client-side tick so the "Reading file" label paints
      // before we hop to the server. File.arrayBuffer() itself is
      // instant for in-memory browser files.
      await new Promise((r) => setTimeout(r, 50));
      setStage('parsing');

      const formData = new FormData();
      formData.set('name', trimmedName);
      formData.set('file', payload);

      const result = await importResumeAction(formData);

      if (!result.ok) {
        setStage('idle');
        setErrorCode(result.code);
        // For ai_failure, the action now returns a clean message;
        // `result.technical` carries the raw SDK string for the
        // "What happened?" disclosure. For other codes, the technical
        // detail is the same as the user-facing message.
        setError(result.error);
        setTechnical(result.technical ?? null);
        return;
      }

      // Flip to the modal's success beat and let IT own the timing.
      // Navigating here would unmount the modal on the same tick the work
      // landed, so the spinner→checkmark transition would never be seen —
      // which is exactly the abrupt close this replaces.
      setStage('done');
      setCreatedResumeId(result.data.id);
    });
  }

  /**
   * Try-again handler for the error card. We re-trigger the existing
   * form submit (via `formRef.current?.requestSubmit()`) so the same
   * validation + state-clearing logic runs; we don't have to
   * duplicate handleImportSubmit's payload-resolution code here.
   */
  function handleRetry() {
    setError(null);
    setErrorCode(null);
    setTechnical(null);
    setStage('idle');
    importFormRef.current?.requestSubmit();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create a master resume</CardTitle>
        <CardDescription>
          Your master is the source of truth. Tailored variants branch off it for specific roles.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <EditorTabs
          tabs={[
            { id: 'scratch', label: 'Start from scratch' },
            { id: 'import', label: 'Import from file' }
          ]}
          activeTab={mode}
          onChange={(id) => setMode(id as Mode)}
        />

        {mode === 'scratch' ? (
          <form onSubmit={handleScratchSubmit} className="flex items-end gap-3">
            <div className="flex flex-col gap-1.5 flex-1">
              <Label htmlFor="resume-name-scratch">Resume name</Label>
              <Input
                id="resume-name-scratch"
                name="name"
                type="text"
                placeholder="e.g. Staff Engineer — General"
                maxLength={100}
                required
                disabled={pending}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={pending}>
              <Plus className="h-4 w-4" />
              {pending ? 'Creating...' : 'Create'}
            </Button>
          </form>
        ) : (
          <form
            ref={importFormRef}
            onSubmit={handleImportSubmit}
            className="space-y-3"
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="resume-name-import">Resume name</Label>
              <Input
                id="resume-name-import"
                name="name"
                type="text"
                placeholder="e.g. Staff Engineer — General"
                maxLength={100}
                required
                disabled={pending}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <ImportInput
              pasteMode={pasteMode}
              file={file}
              pastedText={pastedText}
              disabled={pending}
              fileInputRef={fileInputRef}
              onPickFile={(f) => {
                setError(null);
                setErrorCode(null);
                setTechnical(null);
                setFile(f);
              }}
              onClearFile={() => setFile(null)}
              onPasteText={(t) => {
                setError(null);
                setErrorCode(null);
                setTechnical(null);
                setPastedText(t);
              }}
              onSwitchInput={(m) => {
                setError(null);
                setErrorCode(null);
                setTechnical(null);
                setPasteMode(m);
              }}
            />

            <PrivacyDisclosure />

            {/*
              Pre-submit ETA hint. We render this BEFORE the submit
              button so the user sees it once when they land on the
              Import tab and isn't surprised by a 60-90s spinner.
              Once the action starts, the step indicator takes over
              the "how's it going?" role.
            */}
            <p
              className="flex items-center gap-1.5 text-xs text-muted-foreground"
              data-testid="import-eta-hint"
            >
              <Loader2 className="h-3 w-3 shrink-0 opacity-0" aria-hidden />
              <span>
                This usually takes 30–90 seconds — your file is processed
                server-side, not in your browser.
              </span>
            </p>

            <Button
              type="submit"
              disabled={pending}
              className="w-full sm:w-auto"
            >
              {pending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {stageLabel(stage)}
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Import &amp; create
                </>
              )}
            </Button>

            {pending && <ImportStepIndicator stage={stage} />}

            {/*
              Full-screen parsing modal.

              Replaces the inline spinner as the primary "we're working on
              it" signal: the import runs 30–90s, and on a long form the
              inline indicator is easy to scroll away from. The modal can't
              be dismissed (the Server Action isn't cancellable) and its
              rotating tip carousel turns the wait into a teaching moment.

              Visibility is driven by `stage`, not by `pending`: the success
              beat has to stay up for ~1.5s AFTER the transition settles, so
              the checkmark animation is actually visible before we navigate.
            */}
            <AiParsingModal
              open={
                mode === 'import' &&
                (stage === 'reading' ||
                  stage === 'parsing' ||
                  stage === 'saving' ||
                  stage === 'done')
              }
              stageLabel={stageLabel(stage)}
              done={stage === 'done'}
              doneTitle="Your resume is ready to view 🎉"
              doneMessage="Everything came through nicely — taking you there now…"
              onDismiss={
                createdResumeId
                  ? () => {
                      router.push(`/dashboard/resumes/${createdResumeId}`);
                      router.refresh();
                    }
                  : undefined
              }
            />
          </form>
        )}

        {error && (
          <ImportErrorCard
            code={errorCode}
            message={error}
            technical={technical}
            onRetry={handleRetry}
          />
        )}
      </CardContent>
    </Card>
  );
}

// ─── Import error card ─────────────────────────────────────────────────────

/**
 * Renders a user-facing error after an import failure. Shows a friendly
 * headline + body, a Try again button that re-submits the form without
 * requiring the user to re-pick the file, and an optional "What
 * happened?" disclosure for the raw SDK error string (useful for
 * support requests + keeps dev-facing info out of the main message).
 *
 * Plan: docs/plans/import-ux-and-timeouts.md §"User-visible behavior"
 */
function ImportErrorCard({
  message,
  technical,
  onRetry
}: {
  code: ImportResumeErrorCode | null;
  message: string;
  technical: string | null;
  onRetry: () => void;
}) {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div
      role="alert"
      data-testid="import-error-card"
      className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 space-y-3"
    >
      <div className="flex items-start gap-3">
        <AlertCircle
          aria-hidden
          className="h-5 w-5 shrink-0 text-destructive"
        />
        <div className="flex-1 space-y-1">
          <p className="text-sm font-medium text-destructive">
            We couldn\u2019t import your resume
          </p>
          <p className="text-sm text-foreground/80">{message}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 pl-8">
        <Button
          type="button"
          size="sm"
          variant="default"
          onClick={onRetry}
          data-testid="import-error-retry"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Try again
        </Button>
        {technical && technical !== message && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setShowDetails((v) => !v)}
            aria-expanded={showDetails}
            aria-controls="import-error-details"
            data-testid="import-error-details-toggle"
          >
            What happened?
            <ChevronDown
              aria-hidden
              className={cn(
                'h-3.5 w-3.5 transition-transform',
                showDetails && 'rotate-180'
              )}
            />
          </Button>
        )}
      </div>

      {technical && technical !== message && showDetails && (
        <pre
          id="import-error-details"
          data-testid="import-error-details"
          className="overflow-x-auto whitespace-pre-wrap rounded border border-destructive/20 bg-background/50 p-2 pl-8 text-xs text-muted-foreground"
        >
          {technical}
        </pre>
      )}
    </div>
  );
}

// ─── Import step indicator ─────────────────────────────────────────────────

/**
 * Three-step progress indicator rendered below the submit button while
 * the import is in flight. Each step lights up as the action advances;
 * completed steps get a checkmark. The user gets a visible sense of
 * progress instead of staring at a single spinner for 60-90s, which
 * is what was driving the 499 abandonment in the Sep 28 audit.
 *
 * Plan: docs/plans/import-ux-and-timeouts.md
 */
function ImportStepIndicator({ stage }: { stage: ImportStage }) {
  const steps: { id: ImportStage; label: string }[] = [
    { id: 'reading', label: 'Reading file' },
    { id: 'parsing', label: 'Analyzing with AI' },
    { id: 'saving', label: 'Saving' }
  ];

  const currentIndex = STAGE_ORDER[stage];
  // `parsing` is the only "active" stage the form currently sets —
  // treat it as step 2. If we ever add an explicit "saving" stage in
  // the future, this mapping just works.
  const effectiveIndex = stage === 'parsing' ? 1 : currentIndex;

  return (
    <ol
      className="flex items-center gap-3 text-xs"
      aria-label="Import progress"
      data-testid="import-step-indicator"
    >
      {steps.map((s, idx) => {
        const done = idx < effectiveIndex;
        const active = idx === effectiveIndex;
        return (
          <li
            key={s.id}
            className={cn(
              'flex items-center gap-1.5',
              done && 'text-muted-foreground',
              active && 'text-foreground font-medium',
              !done && !active && 'text-muted-foreground/50'
            )}
            data-state={active ? 'active' : done ? 'done' : 'pending'}
          >
            <span
              className={cn(
                'flex h-4 w-4 items-center justify-center rounded-full border',
                done && 'border-primary/40 bg-primary/10 text-primary',
                active && 'border-primary bg-primary text-primary-foreground',
                !done && !active && 'border-muted-foreground/30'
              )}
            >
              {done ? (
                <Check className="h-2.5 w-2.5" strokeWidth={3} />
              ) : active ? (
                <Loader2 className="h-2.5 w-2.5 animate-spin" />
              ) : (
                <span className="h-1 w-1 rounded-full bg-current" />
              )}
            </span>
            {s.label}
          </li>
        );
      })}
    </ol>
  );
}

const STAGE_ORDER: Record<ImportStage, number> = {
  idle: -1,
  reading: 0,
  parsing: 1,
  saving: 2,
  done: 3
};

// ─── Import input (file OR paste) ──────────────────────────────────────────

function ImportInput({
  pasteMode,
  file,
  pastedText,
  disabled,
  fileInputRef,
  onPickFile,
  onClearFile,
  onPasteText,
  onSwitchInput
}: {
  pasteMode: PasteMode;
  file: File | null;
  pastedText: string;
  disabled: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onPickFile: (f: File) => void;
  onClearFile: () => void;
  onPasteText: (t: string) => void;
  onSwitchInput: (m: PasteMode) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="inline-flex h-8 items-center rounded-md bg-muted p-0.5 text-xs text-muted-foreground">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onSwitchInput('file')}
          data-state={pasteMode === 'file' ? 'active' : 'inactive'}
          className={cn(
            'inline-flex items-center gap-1.5 rounded px-2.5 py-1 font-medium transition-all',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            'data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm',
            'disabled:opacity-50'
          )}
        >
          <Upload className="h-3 w-3" />
          Upload file
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onSwitchInput('paste')}
          data-state={pasteMode === 'paste' ? 'active' : 'inactive'}
          className={cn(
            'inline-flex items-center gap-1.5 rounded px-2.5 py-1 font-medium transition-all',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            'data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm',
            'disabled:opacity-50'
          )}
        >
          <PaperclipIcon className="h-3 w-3" />
          Paste text
        </button>
      </div>

      {pasteMode === 'file' ? (
        <div>
          {file ? (
            <div className="flex items-center gap-3 rounded-md border bg-muted/40 px-3 py-2">
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(file.size / 1024).toFixed(1)} KB
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={disabled}
                onClick={onClearFile}
                aria-label="Remove file"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <label
              className={cn(
                'flex cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed bg-muted/30 px-4 py-6 text-center',
                'hover:bg-muted/50 transition-colors',
                disabled && 'pointer-events-none opacity-60'
              )}
            >
              <Upload className="h-5 w-5 text-muted-foreground" />
              <p className="text-sm font-medium">
                Click to upload or drag a file here
              </p>
              <p className="text-xs text-muted-foreground">
                PDF, DOCX, or plain text — up to 10 MB
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPT}
                disabled={disabled}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onPickFile(f);
                }}
                className="sr-only"
                data-testid="resume-import-file-input"
              />
            </label>
          )}
        </div>
      ) : (
        <Textarea
          value={pastedText}
          onChange={(e) => onPasteText(e.target.value)}
          disabled={disabled}
          placeholder="Paste your resume text here…"
          rows={8}
          className="font-mono text-sm"
        />
      )}
    </div>
  );
}

// ─── Privacy disclosure ─────────────────────────────────────────────────────

function PrivacyDisclosure() {
  return (
    <p className="text-xs text-muted-foreground">
      We send the file text to the AI to extract structured data.
      The original file is held in memory for this request only — it is not
      stored on our servers.
    </p>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────

type ImportStage = 'idle' | 'reading' | 'parsing' | 'saving' | 'done';

function stageLabel(stage: ImportStage): string {
  switch (stage) {
    case 'idle':
      return 'Importing...';
    case 'reading':
      return 'Reading file...';
    case 'parsing':
      return 'Analyzing with AI...';
    case 'saving':
      return 'Saving...';
    case 'done':
      return 'Done!';
  }
}