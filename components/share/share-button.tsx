'use client';

import { useState, useTransition, useEffect } from 'react';
import { Check, Copy, Eye, Link2, Loader2, PowerOff, Share2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

import {
  disableShareAction,
  enableShareAction,
  getShareUrlAction
} from '@/app/(dashboard)/dashboard/resumes/actions';

type ShareStatusView = {
  enabled: boolean;
  viewCount: number;
  lastViewedAt: string | null; // ISO string from server → easier to serialize
  createdAt: string | null;
};

/**
 * Share button + dialog for a resume.
 *
 * Post-Phase-2.5b the share token is deterministic — a pure
 * function of the resume id plus the server's `SHARE_LINK_SECRET`.
 * That makes the dialog a much simpler piece of UI than it used to
 * be:
 *
 *   disabled ──[Enable]──> enabled     (same URL each time)
 *   enabled  ──[Stop]──> disabled      (URL forgotten on close)
 *   enabled  ──[open]──> enabled       (URL fetched on demand;
 *                                       always succeeds)
 *
 * Why "fetched on demand" still exists when the URL is recoverable:
 * the client's dialog holds the URL in a piece of React state, and
 * dropping the URL when the dialog closes is a small privacy win
 * (no leaking it through a DOM serialization or screenshot).
 *
 * UI rules:
 *   - `enabled` is seeded from the server (`initialStatus.enabled`)
 *     and is the single source of truth for which view renders.
 *   - The URL is fetched from the server on dialog open so the
 *     first render of `EnabledView` already has it. There is no
 *     "sharing is on but we can't show your link" state any more —
 *     the token is derivable end-to-end.
 *   - "Copy" copies the current URL to the clipboard; flash the
 *     check icon for 1.5s.
 *   - Both actions are owner-only (server enforces ownership).
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
  const [enabled, setEnabled] = useState(initialStatus.enabled);
  const [url, setUrl] = useState<string | null>(null);
  const [viewCount, setViewCount] = useState(initialStatus.viewCount);
  const [createdAt, setCreatedAt] = useState<string | null>(
    initialStatus.createdAt
  );
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // On open, recover the owner's link from the server. The action
  // derives the token from `(resumeId, SHARE_LINK_SECRET)`; this is
  // what makes "sharing is on" an actionable state rather than a
  // dangling one, and it always succeeds — there is no
  // `unavailable` failure mode any more.
  useEffect(() => {
    if (!open) return;

    setError(null);

    if (!enabled) {
      setUrl(null);
      return;
    }

    let cancelled = false;
    startTransition(async () => {
      const result = await getShareUrlAction({ id: resumeId });
      if (cancelled) return;
      if (result.ok) {
        setUrl(result.data.url);
        return;
      }
      setUrl(null);
      setError(result.error);
    });

    return () => {
      cancelled = true;
    };
  }, [open, enabled, resumeId]);

  function handleEnable() {
    setError(null);
    startTransition(async () => {
      const result = await enableShareAction({ id: resumeId });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setEnabled(true);
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
      setEnabled(false);
      setUrl(null);
      setViewCount((c) => c); // unchanged
      setCreatedAt(null);
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

  // Server truth, not `Boolean(url)`: sharing can be live with no URL in
  // hand, and rendering the "sharing is off" copy in that state is what
  // made the dialog contradict the "on" badge on its own trigger button.
  const showEnabledView = enabled;

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
        {showEnabledView ? (
          <EnabledView
            url={url}
            viewCount={viewCount}
            createdAt={createdAt}
            initialViewCount={initialStatus.viewCount}
            initialLastViewedAt={initialStatus.lastViewedAt}
            pending={pending}
            onCopy={handleCopy}
            copied={copied}
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
        recruiters, mentors, or friends — no Nexstepper account required to view.
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
  onDisable
}: {
  url: string | null;
  viewCount: number;
  createdAt: string | null;
  initialViewCount: number;
  initialLastViewedAt: string | null;
  pending: boolean;
  onCopy: () => void;
  copied: boolean;
  onDisable: () => void;
}) {
  return (
    <div className="space-y-4">
      {url ? (
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
          <p className="text-[11px] text-muted-foreground">
            Keep your own copy — stop sharing to remove the link.
          </p>
        </div>
      ) : (
        <div
          data-testid="share-url-loading"
          className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground"
        >
          <Loader2 className="mr-2 inline h-3 w-3 animate-spin" />
          Loading your link…
        </div>
      )}

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
        the resume, nothing else — no edit links, no Nexstepper branding.
      </p>

      <div className="flex flex-wrap items-center gap-2 border-t pt-3">
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
