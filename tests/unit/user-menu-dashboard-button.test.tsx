/**
 * UserMenu — the Dashboard button lives OUTSIDE the avatar menu.
 *
 * ## Why this exists
 *
 * On the marketing header the Dashboard link was buried two clicks
 * deep, inside the avatar's dropdown. For a signed-in visitor the
 * dashboard is the one thing they came for — so the founder moved it
 * out, to a real button immediately to the LEFT of the user icon.
 *
 * Two things have to hold, and both are asserted here:
 *
 *  1. the button renders BESIDE the avatar (before it in the DOM),
 *     not inside the dropdown; and
 *  2. the dropdown does not repeat the link — one link, one place.
 *
 * With the button off (the dashboard sidebar) the dropdown keeps its
 * Dashboard entry exactly as before.
 */

import * as React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const mockUseSession = vi.fn();
vi.mock('@/lib/auth-client', () => ({
  authClient: { useSession: () => mockUseSession() }
}));

// The primitives are stubbed with PROPS PASSTHROUGH so the markers
// this test asserts on (`data-testid`) survive into the markup.
vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    asChild,
    ...rest
  }: {
    children: React.ReactNode;
    asChild?: boolean;
    [k: string]: unknown;
  }) =>
    React.createElement(
      'button',
      { ...rest, 'data-as-child': asChild ? 'true' : undefined },
      children
    )
}));
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  DropdownMenuContent: ({
    children,
    ...rest
  }: {
    children: React.ReactNode;
    [k: string]: unknown;
  }) =>
    React.createElement('div', { ...rest, 'data-testid': 'dropdown-content' }, children),
  DropdownMenuItem: ({
    children,
    ...rest
  }: {
    children: React.ReactNode;
    [k: string]: unknown;
  }) => React.createElement('div', rest, children),
  DropdownMenuTrigger: ({
    children,
    ...rest
  }: {
    children: React.ReactNode;
    [k: string]: unknown;
  }) =>
    React.createElement(
      'div',
      { ...rest, 'data-testid': 'dropdown-trigger' },
      children
    )
}));
vi.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'avatar' }, children),
  AvatarFallback: ({ children }: { children: React.ReactNode }) =>
    React.createElement('span', null, children)
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() })
}));

import { UserMenu } from '@/components/user-menu';

beforeEach(() => {
  vi.clearAllMocks();
  mockUseSession.mockReturnValue({
    data: { user: { id: 'user-1', name: 'Alex Dev', email: 'a@b.com' } }
  });
});

/**
 * The markup from the dropdown onwards.
 *
 * The dropdown is the LAST thing the component renders, so everything
 * from its marker to the end of the document is the menu (plus the
 * wrapper's closing tags).
 */
function dropdownOf(html: string): string {
  const start = html.indexOf('data-testid="dropdown-content"');
  expect(start).toBeGreaterThan(-1);
  return html.slice(start);
}

describe('UserMenu — with the standalone Dashboard button', () => {
  it('renders a Dashboard button linking to /dashboard', () => {
    const html = renderToStaticMarkup(<UserMenu showDashboardButton />);

    expect(html).toContain('data-testid="dashboard-button"');
    expect(html).toContain('href="/dashboard"');
    expect(html).toContain('Dashboard');
  });

  it('puts the button to the LEFT of the user icon, outside the dropdown', () => {
    const html = renderToStaticMarkup(<UserMenu showDashboardButton />);

    const buttonAt = html.indexOf('data-testid="dashboard-button"');
    const triggerAt = html.indexOf('data-testid="dropdown-trigger"');
    const dropdownAt = html.indexOf('data-testid="dropdown-content"');

    expect(buttonAt).toBeGreaterThan(-1);
    expect(buttonAt).toBeLessThan(triggerAt);
    expect(buttonAt).toBeLessThan(dropdownAt);
  });

  it('does not repeat the Dashboard link inside the dropdown', () => {
    const html = renderToStaticMarkup(<UserMenu showDashboardButton />);
    const dropdown = dropdownOf(html);

    expect(dropdown).not.toContain('href="/dashboard"');
    // The rest of the menu is untouched.
    expect(dropdown).toContain('Send feedback');
    expect(dropdown).toContain('Sign out');
  });
});

describe('UserMenu — without the standalone button (dashboard sidebar)', () => {
  it('keeps the Dashboard entry in the dropdown', () => {
    const html = renderToStaticMarkup(<UserMenu />);

    expect(html).not.toContain('data-testid="dashboard-button"');
    expect(dropdownOf(html)).toContain('href="/dashboard"');
  });
});

describe('UserMenu — unauthed', () => {
  it('renders the sign-in / get-started CTAs and no Dashboard button', () => {
    mockUseSession.mockReturnValue({ data: null });

    const html = renderToStaticMarkup(<UserMenu showDashboardButton />);

    expect(html).toContain('Sign in');
    expect(html).toContain('Get Started');
    expect(html).not.toContain('data-testid="dashboard-button"');
  });
});
