'use client';

import { useState, useTransition, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  FileText,
  Loader2,
  PaperclipIcon,
  Plus,
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

type Mode = 'scratch' | 'import';
type PasteMode = 'file' | 'paste';

const MAX_BYTES = 10 * 1024 * 1024; // mirror importResumeAction's cap
const ACCEPT = '.pdf,.docx,.txt,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/**
 * Inline form at the top of /dashboard/resumes. Two modes:
 *
 *   1. "Start from scratch" — just a name; the editor opens blank.
 *   2. "Import from file" — name + a PDF / DOCX / plain-text file (or
 *      pasted text). Server Action extracts the text, calls Anthropic
 *      Claude to parse into the ResumeSections shape, and creates the
 *      master with the parsed data already in the first revision.
 *
 * Slice 2 (editor) will swap the redirect target to
 * `/dashboard/resumes/${result.data.id}/edit`. Today both modes redirect
 * to the editor view, which is the same target.
 */
export function CreateMasterResumeForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<Mode>('scratch');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<ImportStage>('idle');

  // Import-mode state
  const [pasteMode, setPasteMode] = useState<PasteMode>('file');
  const [file, setFile] = useState<File | null>(null);
  const [pastedText, setPastedText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset state when the user switches modes.
  useEffect(() => {
    setError(null);
    setStage('idle');
    if (mode === 'scratch') {
      setFile(null);
      setPastedText('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [mode]);

  function handleScratchSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

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

  function handleImportSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

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

    // Honest staged feedback. The file-read stage runs locally; the
    // rest is server-side (extract + AI parse) and we can only show a
    // single label for it because Server Actions don't stream progress.
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
        setError(formatImportError(result.code, result.error));
        return;
      }

      setStage('done');
      router.push(`/dashboard/resumes/${result.data.id}`);
      router.refresh();
    });
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
          <form onSubmit={handleImportSubmit} className="space-y-3">
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
                setFile(f);
              }}
              onClearFile={() => {
                setFile(null);
                if (fileInputRef.current) fileInputRef.current.value = '';
              }}
              onPasteText={(t) => {
                setError(null);
                setPastedText(t);
              }}
              onSwitchInput={(m) => {
                setError(null);
                setPasteMode(m);
              }}
            />

            <PrivacyDisclosure />

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
          </form>
        )}

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

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
      We send the file text to Anthropic Claude to extract structured data.
      The original file is held in memory for this request only — it is not
      stored on our servers.
    </p>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────

type ImportStage = 'idle' | 'reading' | 'parsing' | 'done';

function stageLabel(stage: ImportStage): string {
  switch (stage) {
    case 'idle':
      return 'Importing...';
    case 'reading':
      return 'Reading file...';
    case 'parsing':
      return 'Extracting & analyzing with AI...';
    case 'done':
      return 'Done!';
  }
}

/**
 * Map a discriminated-union error code to a user-friendly message.
 * The action's `error` is included for context (esp. for ai_failure
 * where the SDK message is useful in logs); the code drives the
 * user-facing phrasing.
 */
function formatImportError(code: ImportResumeErrorCode, detail: string): string {
  switch (code) {
    case 'not_signed_in':
      return 'You need to sign in to import a resume.';
    case 'no_name':
      return detail;
    case 'no_file':
      return 'Attach a PDF, DOCX, or text file to import.';
    case 'file_too_large':
      return detail;
    case 'unsupported_type':
      return detail;
    case 'empty_file':
      return 'That file is empty.';
    case 'pdf_parse_failed':
      return "We couldn't read that PDF. If it's a scanned image, try the text-paste option instead.";
    case 'docx_parse_failed':
      return "We couldn't read that DOCX. Try saving as PDF or pasting the text.";
    case 'text_too_short':
      return 'The file did not contain enough readable text. If it is a scanned image or password-protected, paste the text instead.';
    case 'no_api_key':
      return 'Resume import needs a Vercel AI Gateway key. Set AI_GATEWAY_API_KEY in your environment to enable this feature. Get a free key at vercel.com/dashboard → AI Gateway.';
    case 'ai_failure':
      return `The AI could not parse this resume. ${detail}`;
    case 'validation_failed':
      return 'The AI returned data that did not match the expected resume shape. Please try again or paste the text instead.';
    case 'resume_too_short':
      return detail;
    case 'db_failure':
      return 'We could not save the imported resume. Please try again in a moment.';
  }
}
