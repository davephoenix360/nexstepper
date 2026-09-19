'use client';

import { useState } from 'react';
import {
  Briefcase,
  ChevronRight,
  ExternalLink,
  MapPin,
  PencilLine,
  X
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { JobPosting } from '@/lib/resume-schema';

import { setVariantJobContextAction } from './jd-actions';

/**
 * Collapsible right-rail JD panel on the variant editor.
 *
 * Slice 2 of the variant-first UX (plan: docs/plans/variant-first-ux.md).
 *
 * Three states:
 *   - empty    — the variant has no jobContext yet. Show a CTA to paste
 *                a JD (parses via the existing /api/parse-jd route in
 *                the next slice).
 *   - attached — show title/company/location + the first 6–10 lines
 *                of the description as a preview.
 *   - editing  — inline textarea replaces the preview while the user
 *                pastes a fresh JD.
 *
 * The component is intentionally "view-only" today: the textarea
 * state stays local and the Save button posts the raw text to the
 * server action. Markdown rendering (Plan B) and the structured parse
 * (Plan C's scorecard) come later — this slice ships the slot, not
 * the AI behind it.
 *
 * Persistence: `setVariantJobContextAction` accepts the raw JD text
 * and the optional parsed `JobPosting` (left null in this slice; the
 * server stores the raw text in `resumeRevisions.data.jobContext`
 * per `jobPostingSchema` — see `lib/resume-schema/job-posting.ts`).
 */
export function JdPanel({
  resumeId,
  jobContext
}: {
  resumeId: string;
  jobContext: JobPosting | null;
}) {
  const [open, setOpen] = useState(true);
  const [editing, setEditing] = useState(jobContext === null);
  const [draft, setDraft] = useState(jobContext?.description ?? '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasJd = jobContext !== null && !editing;
  const showEmpty = jobContext === null && !editing;

  async function handleSave() {
    const trimmed = draft.trim();
    if (trimmed.length < 50) {
      setError('Paste at least 50 characters so the AI can parse it.');
      return;
    }
    setError(null);
    setPending(true);
    try {
      const result = await setVariantJobContextAction({
        resumeId,
        jdText: trimmed
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setEditing(false);
    } finally {
      setPending(false);
    }
  }

  return (
    <aside
      aria-label="Job description"
      data-testid="jd-panel"
      className={cn(
        'rounded-lg border bg-card transition-[width,padding]',
        open ? 'p-4' : 'p-2'
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setOpen((v) => !v)}
          className="-ml-2 h-7 px-2 text-xs font-medium text-muted-foreground"
          aria-expanded={open}
          aria-controls="jd-panel-body"
          data-testid="jd-panel-toggle"
        >
          <ChevronRight
            className={cn(
              'mr-0.5 h-3.5 w-3.5 transition-transform',
              open && 'rotate-90'
            )}
          />
          {open ? 'Job description' : 'JD'}
        </Button>
        {open && hasJd && !editing && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setEditing(true)}
            aria-label="Edit job description"
          >
            <PencilLine className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {open && (
        <div id="jd-panel-body" className="space-y-3">
          {hasJd ? (
            <AttachedView
              jobContext={jobContext}
              onClear={() => {
                setEditing(true);
                setDraft('');
              }}
            />
          ) : showEmpty ? (
            <EmptyView />
          ) : (
            <EditingView
              draft={draft}
              pending={pending}
              error={error}
              onChange={setDraft}
              onSave={handleSave}
              onCancel={
                jobContext
                  ? () => {
                      setEditing(false);
                      setDraft(jobContext.description ?? '');
                      setError(null);
                    }
                  : undefined
              }
            />
          )}
        </div>
      )}
    </aside>
  );
}

// ─── Sub-views ──────────────────────────────────────────────────────────────

function AttachedView({
  jobContext,
  onClear
}: {
  jobContext: JobPosting;
  onClear: () => void;
}) {
  return (
    <div className="space-y-3" data-testid="jd-panel-attached">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Targeting
        </p>
        <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold">
          <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
          {jobContext.title || 'Untitled role'}
        </p>
        {(jobContext.company || jobContext.location) && (
          <p className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
            {jobContext.company && <span>{jobContext.company}</span>}
            {jobContext.location && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {jobContext.location}
              </span>
            )}
          </p>
        )}
        {jobContext.url && (
          <a
            href={jobContext.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline"
          >
            <ExternalLink className="h-3 w-3" />
            Original posting
          </a>
        )}
      </div>

      {jobContext.description && (
        <p className="line-clamp-6 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
          {jobContext.description}
        </p>
      )}

      {jobContext.keywords.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {jobContext.keywords.slice(0, 8).map((kw) => (
            <Badge
              key={kw}
              variant="secondary"
              className="px-1.5 py-0 text-[10px]"
            >
              {kw}
            </Badge>
          ))}
        </div>
      )}

      <Button
        variant="ghost"
        size="sm"
        className="-ml-2 text-xs text-muted-foreground"
        onClick={onClear}
      >
        <X className="mr-1 h-3 w-3" />
        Replace JD
      </Button>
    </div>
  );
}

function EmptyView() {
  return (
    <div className="space-y-2 text-sm" data-testid="jd-panel-empty">
      <p className="font-medium">No job attached</p>
      <p className="text-xs text-muted-foreground">
        Paste a JD below — it gives the AI Optimize tool and (soon)
        the ATS scorecard something to score against.
      </p>
    </div>
  );
}

function EditingView({
  draft,
  pending,
  error,
  onChange,
  onSave,
  onCancel
}: {
  draft: string;
  pending: boolean;
  error: string | null;
  onChange: (v: string) => void;
  onSave: () => void;
  onCancel?: () => void;
}) {
  return (
    <div className="space-y-2">
      <Textarea
        value={draft}
        onChange={(e) => onChange(e.target.value)}
        rows={10}
        placeholder="Paste the full job description here."
        disabled={pending}
        className="font-mono text-xs"
        data-testid="jd-panel-textarea"
      />
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          onClick={onSave}
          disabled={pending}
          data-testid="jd-panel-save"
        >
          {pending ? 'Saving…' : 'Save JD'}
        </Button>
        {onCancel && (
          <Button
            size="sm"
            variant="ghost"
            onClick={onCancel}
            disabled={pending}
          >
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}