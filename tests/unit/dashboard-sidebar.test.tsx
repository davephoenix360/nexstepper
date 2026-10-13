/**
 * DashboardShell — the chrome around every dashboard page. We
 * pin the sidebar's positioning so a future "let's make this
 * easier" refactor doesn't accidentally re-introduce the bug
 * where the sidebar stretched to the height of the longest
 * dashboard page (the editor on a 10-section resume), forcing
 * the user to scroll the WHOLE page to reach the user menu.
 *
 * Renders to static markup. The user is authed here so the
 * `authed` branch of `<UserMenu />` fires (it conditionally
 * renders the dropdown vs. the sign-in CTAs).
 */

import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

// Mock the user menu (so the test doesn't need Better Auth or
// radix-ui to be fully wired). We only need the sidebar's
// positioning classes to be present in the rendered HTML.
vi.mock('@/components/user-menu', () => ({
  UserMenu: () =>
    React.createElement('div', { 'data-testid': 'user-menu-stub' })
}));

// Stub the next/link component so it doesn't try to render <a>
// tags with hrefs that hit the router.
vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard'
}));

import { ThemeProvider } from '@/components/theme-provider';
import { DashboardShell } from '@/app/(dashboard)/_components/dashboard-shell';

// ThemeToggle inside the sidebar uses `useTheme`, which requires
// a ThemeProvider ancestor. Wrap renders in a minimal provider
// (no props beyond children) so the sidebar mounts without throwing.
function withTheme(children: React.ReactNode) {
  return <ThemeProvider>{children}</ThemeProvider>;
}

describe('DashboardShell — sidebar positioning', () => {
  it('uses sticky on desktop and absolute on mobile (different breakpoints)', () => {
    // The aside needs to be `position: absolute` on mobile (for
    // the slide-in transform overlay) and `position: sticky` on
    // desktop (so it stays visible while the document scrolls).
    // These are TWO different `position` values, scoped to
    // different breakpoints — the className must reflect both.
    //
    // Round 2's bug: I had `sticky` (base) and `lg:relative` (lg+).
    // Tailwind 4 emits `lg:relative` AFTER the base `sticky` in
    // the generated CSS, so on desktop `lg:relative` won the
    // cascade — the aside was actually `position: relative`,
    // scrolled with the page. Pinned only by the className
    // string, which was a lie. Round 3 uses `lg:sticky` instead.
    const html = renderToStaticMarkup(
      withTheme(
        <DashboardShell plan="free">
          <div>stub children</div>
        </DashboardShell>
      )
    );

    const asideMatch = html.match(/<aside\b[^>]*>/);
    expect(asideMatch).not.toBeNull();
    const asideTag = asideMatch![0];

    // `lg:sticky` (NOT plain `sticky`) — scoped to lg+ only so it
    // doesn't fight with the mobile `absolute`.
    expect(asideTag).toMatch(/\blg:sticky\b/);
    // Mobile slide-in needs `position: absolute`.
    expect(asideTag).toMatch(/\babsolute\b/);
    // Both breakpoints need `top-0` (sticky pins to viewport top;
    // absolute positions at body top, which on mobile IS the
    // viewport top because the banner is above).
    expect(asideTag).toMatch(/\btop-0\b/);
    // `self-start` prevents cross-axis stretch.
    expect(asideTag).toMatch(/\bself-start\b/);

    // Defensive: the old `lg:relative` is gone. If a future
    // contributor re-adds it, Tailwind will emit it in the
    // @media (min-width: lg) block AFTER `lg:sticky`, and the
    // relative position will win on desktop. The aside will
    // scroll with the page again. Pinning its absence so the
    // regression is caught at the test layer, not in a
    // screenshot review.
    expect(asideTag).not.toMatch(/\blg:relative\b/);
  });

  it('uses a viewport-bounded height so the sidebar never overshoots the screen', () => {
    const html = renderToStaticMarkup(
      withTheme(
        <DashboardShell plan="free">
          <div>stub</div>
        </DashboardShell>
      )
    );
    const asideMatch = html.match(/<aside\b[^>]*>/);
    expect(asideMatch![0]).toMatch(/(h-screen|h-\[calc\(100d?vh)/);
  });

  it('does not create a scroll context that would defeat the sticky behaviour', () => {
    // The inner flex wrapper must NOT have `overflow-hidden` or
    // `overflow-y-auto`, because that would make the inner flex
    // (not the body) the sticky context, and the inner flex
    // doesn't scroll — sticky would silently no-op. The body's
    // scroll must drive the sticky positioning.
    const html = renderToStaticMarkup(
      withTheme(
        <DashboardShell plan="free">
          <div>stub</div>
        </DashboardShell>
      )
    );
    const wrapperMatch = html.match(/<div\s+class="([^"]+)">[\s\S]*?<aside\b/);
    expect(wrapperMatch).not.toBeNull();
    const wrapperClasses = wrapperMatch![1];
    expect(wrapperClasses).not.toMatch(/\boverflow-hidden\b/);
    expect(wrapperClasses).not.toMatch(/\boverflow-y-auto\b/);
  });

  it('keeps `no-print` on the sidebar so PDFs stay clean', () => {
    const html = renderToStaticMarkup(
      withTheme(
        <DashboardShell plan="pro">
          <div>stub</div>
        </DashboardShell>
      )
    );
    const asideMatch = html.match(/<aside\b[^>]*>/);
    expect(asideMatch![0]).toContain('no-print');
  });
});
