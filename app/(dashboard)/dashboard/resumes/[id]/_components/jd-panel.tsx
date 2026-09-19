'use client';

import { useState } from 'react';
import Markdown from 'react-markdown';
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
 *   - attached — show title/company/location + the AI-formatted Markdown
 *                body (Plan B) when available, falling back to raw text.
 *   - editing  — inline textarea replaces the preview while the user
 *                pastes a fresh JD.
 *
 * Markdown rendering (Plan B, docs/plans/jd-markdown-format.md):
 *   - When `jobContext.markdown` is non-null we render it with
 *     `react-markdown` (heading / list / paragraph / emphasis).
 *   - When it is null (AI call skipped, failed, or the user attached
 *     a JD before this feature shipped) we fall back to the raw
 *     `description` text in a `<pre>` block. Same content, less
 *     prettiness — the user is never blocked on this feature.
 *   - `skipHtml` strips raw HTML so a prompt-injection payload
 *     (e.g. `<script>alert(1)</script>`) can never render as a
 *     DOM element. The AI is told to emit Markdown only, but
 *     defense-in-depth matters.
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

      {/* Body — formatted Markdown when the AI succeeded, raw text otherwise. */}
      <Body jobContext={jobContext} />

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

/**
 * Body of the attached view — picks the formatted Markdown when the
 * AI call populated `jobContext.markdown`, otherwise falls back to the
 * raw description text. Same content, different presentation.
 *
 * The Markdown pass goes through `react-markdown` with `skipHtml` so
 * any prompt-injection payload (`<script>` etc.) is dropped at parse
 * time. The `components` map threads the right-rail typography tokens
 * through the headings/lists/paragraphs without dragging in a
 * `@tailwindcss/typography` dependency.
 */
function Body({ jobContext }: { jobContext: JobPosting }) {
  if (jobContext.markdown) {
    return (
      <div
        data-testid="jd-panel-markdown"
        className="jd-markdown text-xs leading-relaxed text-muted-foreground"
      >
        <Markdown
          skipHtml
          components={{
            h1: ({ children }) => (
              <h1 className="mt-2 text-sm font-semibold text-foreground">
                {children}
              </h1>
            ),
            h2: ({ children }) => (
              <h2 className="mt-3 text-xs font-semibold uppercase tracking-wide text-foreground">
                {children}
              </h2>
            ),
            h3: ({ children }) => (
              <h3 className="mt-2 text-xs font-semibold text-foreground">
                {children}
              </h3>
            ),
            p: ({ children }) => <p className="mt-1.5">{children}</p>,
            ul: ({ children }) => (
              <ul className="mt-1.5 list-disc space-y-0.5 pl-4">{children}</ul>
            ),
            ol: ({ children }) => (
              <ol className="mt-1.5 list-decimal space-y-0.5 pl-4">
                {children}
              </ol>
            ),
            li: ({ children }) => <li>{children}</li>,
            code: ({ children }) => (
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">
                {children}
              </code>
            ),
            pre: ({ children }) => (
              <pre className="mt-1.5 overflow-x-auto rounded bg-muted p-2 font-mono text-[11px]">
                {children}
              </pre>
            ),
            strong: ({ children }) => (
              <strong className="font-semibold text-foreground">
                {children}
              </strong>
            ),
            em: ({ children }) => (
              <em className="italic">{children}</em>
            ),
            a: ({ children, href }) => (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                {children}
              </a>
            )
          }}
        >
          {jobContext.markdown}
        </Markdown>
      </div>
    );
  }

  if (jobContext.description) {
    return (
      <pre
        data-testid="jd-panel-raw"
        className="max-h-72 overflow-auto whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground"
      >
        {jobContext.description}
      </pre>
    );
  }

  return null;
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