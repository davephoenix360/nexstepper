import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

/**
 * ShareButton regression guards.
 *
 * Post-Phase-2.5b the share token is derived from `(resumeId,
 * SHARE_LINK_SECRET)` on every server, so:
 *
 *   - "Sharing is on" is always paired with a retrievable URL —
 *     no more "we kept a one-way hash, so we can't show it to you"
 *     fallback copy.
 *   - Re-enable is idempotent (same URL every time), so there is
 *     no "Generate new link" button any more.
 *
 * Two layers, because they catch different things:
 *
 *   - RENDER tests drive the actual component and assert on the
 *     markup a user would see.
 *   - SOURCE tests pin invariants a static render can't reach
 *     (no leftover rotate imports, no "Boolean(url)" view
 *     selection, the existing copy-guard).
 *
 * The Dialog is mocked to render children unconditionally because
 * the runner is `environment: 'node'` with no jsdom, so Radix's
 * portal cannot be opened. That also happens to be what lets us
 * assert on the body at all.
 */

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dialog">{children}</div>
  )
}));

vi.mock('@/app/(dashboard)/dashboard/resumes/actions', () => ({
  enableShareAction: vi.fn(),
  disableShareAction: vi.fn(),
  getShareUrlAction: vi.fn()
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
  createdAt: CREATED
};

const NEVER_SHARED = {
  enabled: false,
  viewCount: 0,
  lastViewedAt: null,
  createdAt: null
};

// ── Render layer: what the user actually sees ────────────────────────────────

describe('ShareButton renders true state on revisit', () => {
  it('does NOT say sharing is off when the server says it is on', () => {
    // THE original regression. Reintroducing the "use Boolean(url)
    // as the view selector" bug would fall through here to the
    // disabled copy on a hard-render before the effect runs.
    const html = render(LIVE_SHARE);
    expect(html).not.toContain('Sharing is currently off');
    expect(html).not.toContain('Enable sharing');
  });

  it('says sharing is on when the server says it is on', () => {
    // The enabled view is in charge. "Stop sharing" is rendered;
    // "Enable sharing" is not. The reverse-direction check is
    // the one below.
    expect(render(LIVE_SHARE)).toContain('Stop sharing');
  });

  it('renders the recovery-link stat block', () => {
    // The user came back to see "the number of people that have
    // visited it". Pinned here so a refactor that drops the
    // block surfaces as a UI regression immediately.
    const html = render(LIVE_SHARE);
    expect(html).toContain('Views');
    expect(html).toContain('Last viewed');
    expect(html).toContain('Sharing since');
    expect(html).not.toContain('Never');
    expect(html).toMatch(/>3</);
  });

  it('does NOT carry the pre-redesign "we lost the link" copy', () => {
    // The previous build explained a missing URL as "this link
    // was created before encrypted storage, so all we kept was a
    // one-way hash of it". The deterministic design removes the
    // concept entirely; re-introducing it is a regression.
    const html = render(LIVE_SHARE);
    expect(html).not.toContain('one-way hash');
    expect(html).not.toContain('encrypted storage');
    expect(html).not.toContain('all we kept was');
  });

  it('does NOT offer a "Generate new link" button', () => {
    // Rotation is gone: the token is a derivation, the URL is
    // a property of the resume id. No button, no action.
    expect(render(LIVE_SHARE)).not.toContain('Generate new link');
    expect(render(LIVE_SHARE)).not.toContain('Rotate');
  });

  it('keeps the on-badge consistent with the dialog body', () => {
    // The contradiction the user historically saw: "on" beside
    // "off".
    const html = render(LIVE_SHARE);
    expect(html).toContain('Share');
    expect(html).not.toMatch(/Sharing is currently off/);
  });

  it('shows the enable copy when sharing has genuinely never been on', () => {
    const html = render(NEVER_SHARED);
    expect(html).toContain('Sharing is currently off');
    expect(html).toContain('Enable sharing');
  });

  it('does not claim an active link for a never-shared resume', () => {
    expect(render(NEVER_SHARED)).not.toContain('Stop sharing');
  });

  it('does not render the URL input on a static render of an enabled-but-not-yet-fetched row', () => {
    // The URL is fetched in an effect, which doesn't run in
    // `renderToStaticMarkup`. The user-visible state must be the
    // "loading" placeholder rather than a broken empty input or
    // a flash of the disabled copy.
    const html = render(LIVE_SHARE);
    expect(html).not.toContain('share-url-input');
    expect(html).toContain('share-url-loading');
  });
});

// ── Source layer: invariants a static render can't reach ─────────────────────

describe('ShareButton source invariants', () => {
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

  it('does NOT import rotateShareTokenAction', async () => {
    // The action was deleted with the rotation feature. A future
    // contributor who reaches for it surfaces this as a fail,
    // not as a runtime "is not a function" stack trace.
    expect(await src()).not.toMatch(/rotateShareTokenAction/);
  });

  it('does NOT import any token-crypto helpers', async () => {
    // The encryption-at-rest code path is gone with the
    // ciphertext column. Catching a leftover import here makes
    // it obvious that the redesign was reverted.
    expect(await src()).not.toMatch(/token-crypto/);
  });

  it('does NOT show the pre-redesign "stop sharing kills the previous link" warning', async () => {
    expect(await src()).not.toMatch(/all we kept was a one-way hash/);
  });

  it('guards clipboard copy against a null URL', async () => {
    const s = await src();
    const copyStart = s.indexOf('async function handleCopy');
    // Skip past the function header to where the body lives.
    const copy = s.slice(copyStart);
    expect(copy).toMatch(/if \(!url\) return;/);
  });

  it('carries no stale Nextep-era brand strings', async () => {
    // Both were left behind by the 2026-09-25 Nextep -> Nexstepper rename.
    expect(await src()).not.toMatch(/Nextep(?![p])/);
  });
});
