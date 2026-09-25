'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CircleIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme-toggle';
import { UserMenu } from '@/components/user-menu';

/**
 * Marketing nav links — Features / How it works / Pricing.
 *
 * Anchor links (#features, #how-it-works) only resolve on the landing page;
 * on the pricing page they fall back to "/" + the hash, which Next.js
 * navigates to the home + scrolls.
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

/**
 * The (marketing) route group — landing page and pricing. Wraps every
 * page in the brand chrome: logo, nav links, theme toggle, user menu.
 *
 * Stays a client component because MarketingNavLinks reads the current
 * pathname to compute the anchor-link prefix.
 */
export default function MarketingLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col min-h-screen">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link
            href="/"
            className="flex items-center gap-2 text-base font-semibold tracking-tight text-foreground"
          >
            <CircleIcon className="size-6 text-primary" />
            Nexstepper
          </Link>
          <MarketingNavLinks />
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <Suspense fallback={<div className="h-9 w-32" />}>
              <UserMenu />
            </Suspense>
          </div>
        </div>
      </header>
      {children}
    </section>
  );
}