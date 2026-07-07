'use client';

import Link from 'next/link';
import { useState, Suspense } from 'react';
import { usePathname } from 'next/navigation';
import { CircleIcon, LayoutDashboard, LogOut } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';

function UserMenu() {
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
    <DropdownMenu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
      <DropdownMenuTrigger>
        <Avatar className="cursor-pointer size-9">
          <AvatarFallback>{initials || '?'}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="flex flex-col gap-1">
        <DropdownMenuItem className="cursor-pointer">
          <Link href="/dashboard" className="flex w-full items-center">
            <LayoutDashboard className="mr-2 h-4 w-4" />
            <span>Dashboard</span>
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
  );
}

/**
 * Marketing nav — used across the public site (landing, pricing) and as
 * the top of the dashboard. For signed-out visitors it shows the marketing
 * nav (Features / Pricing / Sign in / Get Started). For signed-in users it
 * collapses into the avatar dropdown with a Dashboard link.
 *
 * Anchor links (#features, #how-it-works) only resolve on the landing page;
 * on other pages they fall back to "/" + the hash, which Next.js navigates
 * to the home + scrolls.
 */
function MarketingNavLinks() {
  const pathname = usePathname();
  const homePrefix = pathname === '/' ? '' : '/';
  return (
    <nav className="hidden items-center gap-1 md:flex">
      <Button asChild variant="ghost" size="sm">
        <Link href={`${homePrefix}#features`}>Features</Link>
      </Button>
      <Button asChild variant="ghost" size="sm">
        <Link href={`${homePrefix}#how-it-works`}>How it works</Link>
      </Button>
      <Button asChild variant="ghost" size="sm">
        <Link href="/pricing">Pricing</Link>
      </Button>
    </nav>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <section className="flex flex-col min-h-screen">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link
            href="/"
            className="flex items-center gap-2 text-base font-semibold tracking-tight text-foreground"
          >
            <CircleIcon className="size-6 text-primary" />
            Nextep
          </Link>
          <MarketingNavLinks />
          <Suspense fallback={<div className="h-9 w-32" />}>
            <UserMenu />
          </Suspense>
        </div>
      </header>
      {children}
    </section>
  );
}