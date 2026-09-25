'use client';

import Link from 'next/link';
import { CircleIcon } from 'lucide-react';

import { ThemeToggle } from '@/components/theme-toggle';

/**
 * Minimal chrome for sign-in / sign-up. No marketing nav (these pages
 * don't need a Features/Pricing bar), but a small header with the brand
 * logo (back to landing) and the theme toggle so users aren't locked
 * into their OS theme while authenticating.
 */
export default function AuthLayout({
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
          <ThemeToggle />
        </div>
      </header>
      {children}
    </section>
  );
}