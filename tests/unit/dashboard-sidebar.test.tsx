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
  it('uses sticky + self-start + viewport-bounded height so it stays on screen', () => {
    // Render with `plan="free"` so the optional ProLaunchingSoonBanner
    // also mounts (the banner is part of the wrapper's height math).
    const html = renderToStaticMarkup(
      withTheme(
        <DashboardShell plan="free">
          <div>stub children</div>
        </DashboardShell>
      )
    );

    // Extract the <aside> opening tag.
    const asideMatch = html.match(/<aside\b[^>]*>/);
    expect(asideMatch).not.toBeNull();
    const asideTag = asideMatch![0];

    // All three of these were added together in the Oct 2026 fix.
    // Removing any one of them re-introduces the bug — either the
    // sidebar scrolls with the page (no sticky) or it stretches
    // to match the main column (no self-start) or it doesn't fit
    // on small screens (no viewport-bounded height).
    expect(asideTag).toMatch(/\bsticky\b/);
    expect(asideTag).toMatch(/\btop-0\b/);
    expect(asideTag).toMatch(/\bself-start\b/);

    // Height is bounded by the viewport. We accept either
    // `h-screen` (Tailwind shorthand for `h: 100vh`) or
    // `h-[calc(100vh-...)]` / `h-[calc(100dvh-...)]` — both keep
    // the sidebar in-bounds. The semantic property we care about
    // is "the height uses a viewport unit, not the main column's
    // intrinsic content height".
    expect(asideTag).toMatch(/(h-screen|h-\[calc\(100d?vh)/);
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
    // The wrapper is the immediate parent of `<aside>` and `<main>`.
    // It's a <div>, and the only <div> we render at the dashboard
    // level is the wrapper. We assert it doesn't carry an
    // `overflow-hidden` or `overflow-y-auto` class.
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
