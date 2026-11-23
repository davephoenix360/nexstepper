'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LayoutDashboard, LogOut, MessageSquare } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { authClient } from '@/lib/auth-client';

/**
 * Avatar + dropdown shown in the top-right of authed route surfaces.
 *
 * Renders sign-in / get-started buttons for unauthed visitors, and a
 * dropdown (Dashboard link + Send feedback + sign out) for authed ones.
 *
 * ## `showDashboardButton`
 *
 * On the marketing header, "Dashboard" is the ONE action a signed-in
 * visitor wants — and it was buried two clicks deep, behind the
 * avatar. The founder moved it out: the button now sits directly to
 * the LEFT of the user icon, where it is one click and plainly
 * visible. When that button is on, the dropdown does not repeat the
 * link.
 *
 * With the button off (the dashboard sidebar, where there is no other
 * way in) the dropdown keeps its Dashboard entry exactly as before.
 *
 * Surface-agnostic: used by both the marketing and dashboard layouts.
 */
export function UserMenu({
  showDashboardButton = false
}: {
  showDashboardButton?: boolean;
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { data: session } = authClient.useSession();
  const router = useRouter();

  async function handleSignOut() {
    await authClient.signOut();
    router.push('/');
    router.refresh();
  }

  const displayName = session?.user?.name || session?.user?.email || '';
  const initials = displayName
    .split(/\s+|@/)
    .map((s) => s[0] ?? '')
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  if (!session?.user) {
    return (
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/sign-in">Sign in</Link>
        </Button>
        <Button asChild size="sm" className="rounded-full">
          <Link href="/sign-up">Get Started</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {showDashboardButton ? (
        <Button
          asChild
          variant="ghost"
          size="sm"
          data-testid="dashboard-button"
        >
          <Link href="/dashboard">
            <LayoutDashboard className="h-4 w-4" />
            Dashboard
          </Link>
        </Button>
      ) : null}
      <DropdownMenu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
        <DropdownMenuTrigger>
          <Avatar className="cursor-pointer size-9">
            <AvatarFallback>{initials || '?'}</AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="flex flex-col gap-1">
          {/* The Dashboard entry moves OUT of the dropdown when the
              standalone button is shown — one link, one place. */}
          {!showDashboardButton ? (
            <DropdownMenuItem className="cursor-pointer">
              <Link href="/dashboard" className="flex w-full items-center">
                <LayoutDashboard className="mr-2 h-4 w-4" />
                <span>Dashboard</span>
              </Link>
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem className="cursor-pointer">
            <Link href="/feedback" className="flex w-full items-center">
              <MessageSquare className="mr-2 h-4 w-4" />
              <span>Send feedback</span>
            </Link>
          </DropdownMenuItem>
          <button
            type="button"
            onClick={handleSignOut}
            className="flex w-full text-left"
          >
            <DropdownMenuItem className="w-full flex-1 cursor-pointer">
              <LogOut className="mr-2 h-4 w-4" />
              <span>Sign out</span>
            </DropdownMenuItem>
          </button>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}