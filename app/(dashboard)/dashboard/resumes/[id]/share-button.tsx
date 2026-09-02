'use client';

import { useState, useTransition, useRef, useEffect } from 'react';
import {
  Check,
  Copy,
  Eye,
  Link2,
  Loader2,
  PowerOff,
  RefreshCw,
  Share2
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

import {
  disableShareAction,
  enableShareAction,
  rotateShareTokenAction
} from '../actions';

type ShareStatusView = {
  enabled: boolean;
  viewCount: number;
  lastViewedAt: string | null; // ISO string from server → easier to serialize
  createdAt: string | null;
};

/**
 * Share button + dialog for a resume.
 *
 * Server-rendered parent passes `initialStatus` so the dialog opens
 * with the right state. The dialog then drives all mutations through
 * the three server actions.
 *
 * State machine:
 *   disabled ──[Enable]──> enabled  (server returns the URL)
 *   enabled  ──[Stop]──> disabled   (no URL returned; client clears)
 *   enabled  ──[Rotate]──> enabled  (new URL returned; viewCount preserved)
 *
 * UI rules:
 *   - URL is shown only AFTER a successful enable/rotate. We never
 *     display a stale URL from a previous session.
 *   - "Copy" copies the current URL to the clipboard; flash the
 *     check icon for 1.5s.
 *   - All three actions are owner-only (server enforces ownership).
 *   - The dialog description warns that the URL is public.
 */
export function ShareButton({
  resumeId,
  initialStatus
}: {
  resumeId: string;
  initialStatus: ShareStatusView;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [url, setUrl] = useState<string | null>(null);
  const [viewCount, setViewCount] = useState(initialStatus.viewCount);
  const [createdAt, setCreatedAt] = useState<string | null>(
    initialStatus.createdAt
  );
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset URL state when the dialog opens — show a fresh state
  // (we re-fetch the URL via enable/rotate if the user wants to
  // see the current one). Otherwise the dialog opens with whatever
  // URL was last generated, which can be confusing after rotation.
  // We DO preserve viewCount + createdAt from the server's initialStatus.
  useEffect(() => {
    if (open) {
      setUrl(null);
      setError(null);
    }
  }, [open]);

  function handleEnable() {
    setError(null);
    startTransition(async () => {
      const result = await enableShareAction({ id: resumeId });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setUrl(result.data.url);
      setCreatedAt(result.data.createdAt?.toISOString() ?? null);
    });
  }

  function handleDisable() {
    setError(null);
    startTransition(async () => {
      const result = await disableShareAction({ id: resumeId });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setUrl(null);
      setViewCount((c) => c); // unchanged
      setCreatedAt(null);
    });
  }

  function handleRotate() {
    setError(null);
    startTransition(async () => {
      const result = await rotateShareTokenAction({ id: resumeId });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setUrl(result.data.url);
      setCreatedAt(result.data.createdAt?.toISOString() ?? null);
    });
  }

  async function handleCopy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Fallback: select the input so the user can ⌘C manually.
      setError('Could not copy to clipboard — please copy manually.');
    }
  }

  const isEnabled = Boolean(url);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        aria-label="Share this resume"
      >
        <Share2 className="h-4 w-4" />
        Share
        {initialStatus.enabled && (
          <span
            className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-100 px-1.5 text-[10px] font-semibold text-emerald-700"
            aria-hidden
          >
            on
          </span>
        )}
      </Button>

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Share this resume"
        description="Generate a public link. Anyone with the link can view this resume. You can stop sharing at any time."
      >
        {isEnabled && url ? (
          <EnabledView
            url={url}
            viewCount={viewCount}
            createdAt={createdAt}
            initialViewCount={initialStatus.viewCount}
            initialLastViewedAt={initialStatus.lastViewedAt}
            pending={pending}
            onCopy={handleCopy}
            copied={copied}
            onRotate={handleRotate}
            onDisable={handleDisable}
          />
        ) : (
          <DisabledView
            viewCount={initialStatus.viewCount}
            pending={pending}
            onEnable={handleEnable}
          />
        )}

        {error && (
          <p className="mt-3 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
      </Dialog>
    </>
  );
}

// ─── Sub-views ──────────────────────────────────────────────────────────────

function DisabledView({
  viewCount,
  pending,
  onEnable
}: {
  viewCount: number;
  pending: boolean;
  onEnable: () => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Sharing is currently off. Generate a public link to share this resume with
        recruiters, mentors, or friends — no Nextep account required to view.
      </p>

      {viewCount > 0 && (
        <p className="text-xs text-muted-foreground">
          This resume has been viewed <span className="font-semibold text-foreground">{viewCount}</span>{' '}
          time{viewCount === 1 ? '' : 's'} in the past. Re-enable to start a new
          share window.
        </p>
      )}

      <Button onClick={onEnable} disabled={pending} className="w-full sm:w-auto">
        {pending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Generating link...
          </>
        ) : (
          <>
            <Link2 className="h-4 w-4" />
            Enable sharing
          </>
        )}
      </Button>
    </div>
  );
}

function EnabledView({
  url,
  viewCount,
  createdAt,
  initialViewCount,
  initialLastViewedAt,
  pending,
  onCopy,
  copied,
  onRotate,
  onDisable
}: {
  url: string;
  viewCount: number;
  createdAt: string | null;
  initialViewCount: number;
  initialLastViewedAt: string | null;
  pending: boolean;
  onCopy: () => void;
  copied: boolean;
  onRotate: () => void;
  onDisable: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="share-url">Public link</Label>
        <div className="flex items-stretch gap-2">
          <input
            id="share-url"
            type="text"
            readOnly
            value={url}
            onFocus={(e) => e.currentTarget.select()}
            className={cn(
              'flex-1 rounded-md border bg-muted/40 px-3 py-2 font-mono text-xs',
              'focus:outline-none focus:ring-2 focus:ring-indigo-300/50'
            )}
            data-testid="share-url-input"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={onCopy}
            disabled={pending}
            aria-label={copied ? 'Copied' : 'Copy link to clipboard'}
          >
            {copied ? (
              <Check className="h-4 w-4 text-emerald-600" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 rounded-md border bg-muted/30 p-3 text-xs">
        <div>
          <p className="text-muted-foreground">Views</p>
          <p className="mt-0.5 text-base font-semibold tabular-nums">
            {viewCount}
            {viewCount > initialViewCount && (
              <span className="ml-1 text-[10px] font-normal text-emerald-600">
                (+{viewCount - initialViewCount} this session)
              </span>
            )}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">Last viewed</p>
          <p className="mt-0.5 text-sm">
            {formatRelativeTime(initialLastViewedAt)}
          </p>
        </div>
        <div className="col-span-2">
          <p className="text-muted-foreground">Sharing since</p>
          <p className="mt-0.5 text-sm">
            {createdAt
              ? new Date(createdAt).toLocaleString()
              : 'Unknown'}
          </p>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        <Eye className="mr-1 inline h-3 w-3" />
        The page is{' '}
        <code className="rounded bg-muted px-1">noindex</code> and viewers see
        the resume, nothing else — no edit links, no Nextep branding.
      </p>

      <div className="flex flex-wrap items-center gap-2 border-t pt-3">
        <Button
          variant="outline"
          size="sm"
          onClick={onRotate}
          disabled={pending}
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Generate new link
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onDisable}
          disabled={pending}
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <PowerOff className="h-4 w-4" />
          Stop sharing
        </Button>
      </div>
    </div>
  );
}

function Label({
  htmlFor,
  children
}: {
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="text-xs font-medium text-muted-foreground"
    >
      {children}
    </label>
  );
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return 'Never';
  const date = new Date(iso);
  const now = Date.now();
  const diffMs = now - date.getTime();
  const sec = Math.floor(diffMs / 1000);
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);
  if (sec < 60) return 'Just now';
  if (min < 60) return `${min} min ago`;
  if (hr < 24) return `${hr} hr ago`;
  if (day < 7) return `${day} day${day === 1 ? '' : 's'} ago`;
  return date.toLocaleDateString();
}
