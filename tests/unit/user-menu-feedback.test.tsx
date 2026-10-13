/**
 * UserMenu — the authed dropdown gains a "Send feedback" item
 * pointing at /feedback. Pinning the link and the icon keeps the
 * affordance discoverable after a future refactor.
 */

import * as React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

// Mock the auth-client hook BEFORE importing the component.
const mockUseSession = vi.fn();
vi.mock('@/lib/auth-client', () => ({
  authClient: { useSession: () => mockUseSession() }
}));

// Stub the UI primitives so the test doesn't pull the full
// Radix-based component graph (which is happy with a real DOM but
// chokes on the static renderer). We only care about the visible
// "Send feedback" + href, so each primitive is a transparent pass-
// through that renders its children.
vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    asChild: _asChild,
    ...rest
  }: {
    children: React.ReactNode;
    asChild?: boolean;
    [k: string]: unknown;
  }) => React.createElement('button', rest, children)
}));
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  DropdownMenuItem: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children)
}));
vi.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  AvatarFallback: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children)
}));

// next/navigation's useRouter is only used inside handlers, never at
// render time. The mock isn't strictly required for these tests,
// but it avoids any future "this hook is not mocked" warnings.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() })
}));

import { UserMenu } from '@/components/user-menu';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('UserMenu — authed dropdown', () => {
  it('renders a "Send feedback" link to /feedback', () => {
    mockUseSession.mockReturnValue({
      data: { user: { id: 'user-1', name: 'Alex Dev', email: 'a@b.com' } }
    });

    const html = renderToStaticMarkup(<UserMenu />);

    expect(html).toContain('Send feedback');
    expect(html).toContain('href="/feedback"');
  });

  it('still renders the existing Dashboard and Sign out entries', () => {
    mockUseSession.mockReturnValue({
      data: { user: { id: 'user-1', name: 'Alex', email: 'a@b.com' } }
    });

    const html = renderToStaticMarkup(<UserMenu />);

    expect(html).toContain('Dashboard');
    expect(html).toContain('Sign out');
  });
});

describe('UserMenu — unauthed', () => {
  it('renders the sign-in / get-started CTAs (no feedback link)', () => {
    mockUseSession.mockReturnValue({ data: null });

    const html = renderToStaticMarkup(<UserMenu />);

    expect(html).toContain('Sign in');
    expect(html).toContain('Get Started');
    expect(html).not.toContain('Send feedback');
  });
});
