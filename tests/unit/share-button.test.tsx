import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

/**
 * ShareButton regression guard.
 *
 * ## The bug
 *
 * The dialog decided which view to render with `const isEnabled =
 * Boolean(url)` — CLIENT-ONLY state. The URL only enters that state as
 * the return value of an enable/rotate action in the current session,
 * so on any later visit `url` was null and the dialog fell through to
 * the "Sharing is currently off" copy — while the trigger button next
 * to it correctly rendered its green "on" badge, because that reads the
 * server prop. The user saw a control claiming sharing was off sitting
 * beside a badge claiming it was on, and clicking "Enable" again
 * silently invalidated a link they had already sent to someone.
 *
 * The link itself cannot be restored: `enableShareAction` stores only a
 * SHA-256 hash in `resumes.share_token_hash`
 * (`app/(dashboard)/dashboard/resumes/actions.ts`), by design, so a DB
 * leak cannot hand out live resume URLs. The fix is therefore to render
 * the true enabled/disabled state and be explicit that the link is not
 * retrievable — not to try to re-show it.
 *
 * Two layers, because they catch different things:
 *   - RENDER tests drive the actual component and assert on the markup
 *     a user would see. These are the ones that would have caught the
 *     bug as a user experiences it.
 *   - SOURCE tests pin the invariants that a static render can't reach
 *     (the reopen effect, the copy guard).
 *
 * The Dialog is mocked to render children unconditionally because the
 * runner is `environment: 'node'` with no jsdom, so Radix's portal
 * cannot be opened. That also happens to be what lets us assert on the
 * body at all.
 */

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dialog">{children}</div>
  ),
}));

vi.mock('@/app/(dashboard)/dashboard/resumes/actions', () => ({
  enableShareAction: vi.fn(),
  disableShareAction: vi.fn(),
  rotateShareTokenAction: vi.fn(),
}));

// Imported after the mocks so the module graph picks them up.
const { ShareButton } = await import('@/components/share/share-button');

const LAST_VIEWED = '2026-10-01T12:00:00.000Z';
const CREATED = '2026-09-01T09:00:00.000Z';

function render(status: {
  enabled: boolean;
  viewCount: number;
  lastViewedAt: string | null;
  createdAt: string | null;
}) {
  return renderToStaticMarkup(
    <ShareButton resumeId="resume-1" initialStatus={status} />
  );
}

/** A resume that has been shared before, then the user navigated away. */
const LIVE_SHARE = {
  enabled: true,
  viewCount: 3,
  lastViewedAt: LAST_VIEWED,
  createdAt: CREATED,
};

const NEVER_SHARED = {
  enabled: false,
  viewCount: 0,
  lastViewedAt: null,
  createdAt: null,
};

// ── Render layer: what the user actually sees ────────────────────────────────

describe('ShareButton renders true state on revisit', () => {
  it('does NOT say sharing is off when the server says it is on', () => {
    // THE regression. This exact string is what the user reported.
    const html = render(LIVE_SHARE);
    expect(html).not.toContain('Sharing is currently off');
    expect(html).not.toContain('Enable sharing');
  });

  it('says sharing is on when the server says it is on', () => {
    expect(render(LIVE_SHARE)).toContain('Sharing is on');
  });

  it('explains why the link cannot be shown again', () => {
    const html = render(LIVE_SHARE);
    expect(html).toContain('one-way hash');
    expect(html).toContain('Keep your own copy');
  });

  it('warns that regenerating kills the link already shared', () => {
    expect(render(LIVE_SHARE)).toContain('already shared');
  });

  it('surfaces the view count the user came back for', () => {
    // The user explicitly expected "the number of people that have
    // visited it" to still be there.
    const html = render(LIVE_SHARE);
    expect(html).toContain('Views');
    expect(html).toMatch(/>3</);
  });

  it('surfaces when it was last viewed and since when it is shared', () => {
    const html = render(LIVE_SHARE);
    expect(html).toContain('Last viewed');
    expect(html).toContain('Sharing since');
    expect(html).not.toContain('Never');
  });

  it('still offers both recovery actions', () => {
    const html = render(LIVE_SHARE);
    expect(html).toContain('Generate new link');
    expect(html).toContain('Stop sharing');
  });

  it('shows the enable copy when sharing has genuinely never been on', () => {
    // Guards the other direction: the fix must not make every state
    // look enabled.
    const html = render(NEVER_SHARED);
    expect(html).toContain('Sharing is currently off');
    expect(html).toContain('Enable sharing');
  });

  it('does not claim an active link for a never-shared resume', () => {
    expect(render(NEVER_SHARED)).not.toContain('Sharing is on');
  });

  it('keeps the on-badge consistent with the dialog body', () => {
    // The contradiction the user saw: "on" beside "off".
    const html = render(LIVE_SHARE);
    expect(html).toContain('Share');
    expect(html).not.toMatch(/Sharing is currently off/);
  });

  it('renders no share URL input on revisit', () => {
    // Nothing to show is correct — the token is not stored — but we must
    // not render an empty box pretending a link exists.
    expect(render(LIVE_SHARE)).not.toContain('share-url-input');
  });
});

// ── Source layer: invariants a static render can't reach ─────────────────────

describe('ShareButton source invariants', () => {
  // Read lazily so the import above stays the single source of truth.
  const src = async () =>
    (await import('node:fs')).readFileSync(
      (await import('node:path')).resolve(
        process.cwd(),
        'components/share/share-button.tsx'
      ),
      'utf8'
    );

  it('does NOT derive the enabled view from the presence of a URL', async () => {
    expect(await src()).not.toMatch(/const isEnabled\s*=\s*Boolean\(url\)/);
    expect(await src()).not.toMatch(/isEnabled\s*&&\s*url/);
  });

  it('clears the URL on reopen but leaves `enabled` untouched', async () => {
    const s = await src();
    const effect = s.slice(
      s.indexOf('useEffect(() => {'),
      s.indexOf('function handleEnable')
    );
    expect(effect).toMatch(/setUrl\(null\)/);
    expect(effect).not.toMatch(/setEnabled\(/);
  });

  it('guards clipboard copy against a null URL', async () => {
    const s = await src();
    const copy = s.slice(
      s.indexOf('async function handleCopy'),
      s.indexOf('// Server truth')
    );
    expect(copy).toMatch(/if \(!url\) return;/);
  });

  it('carries no stale Nextep-era brand strings', async () => {
    // Both were left behind by the 2026-09-25 Nextep -> Nexstepper rename.
    expect(await src()).not.toMatch(/Nextep(?![p])/);
  });
});