'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme-toggle';
import { UserMenu } from '@/components/user-menu';
import { Home, Settings, Shield, Menu, FileText } from 'lucide-react';
import { Logo } from '@/components/brand/logo';

import { ProLaunchingSoonBanner } from '@/components/billing/pro-launching-soon-cta';
import type { PlanId } from '@/lib/billing';

/**
 * Dashboard shell — the chrome around every dashboard page (sidebar
 * + mobile top bar + top banner for Free users). Split out from
 * `app/(dashboard)/layout.tsx` so the layout itself can stay a
 * Server Component and read the user's subscription directly.
 *
 * The `<ProLaunchingSoonBanner />` is rendered above the page
 * content for Free users so they see "Pro is coming" without
 * having to navigate to /dashboard/general. When Pro goes live
 * this conditional becomes a no-op (all users are Pro).
 */
export function DashboardShell({
  plan,
  children
}: {
  plan: PlanId;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Phase 1: Resumes added. Account + Security settings remain Phase 0.
  const navItems = [
    { href: '/dashboard', icon: Home, label: 'Overview' },
    { href: '/dashboard/resumes', icon: FileText, label: 'Resumes' },
    { href: '/dashboard/general', icon: Settings, label: 'Account' },
    { href: '/dashboard/security', icon: Shield, label: 'Security' }
  ];

  return (
    <div className="flex flex-col min-h-screen w-full">
      {plan === 'free' ? <ProLaunchingSoonBanner /> : null}

      <div className="no-print lg:hidden flex items-center justify-between bg-background border-b border-border p-4">
        <Link
          href="/"
          className="flex items-center"
        >
          <Logo variant="horizontal" height={24} />
        </Link>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Button
            className="-mr-3"
            variant="ghost"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          >
            <Menu className="h-6 w-6" />
            <span className="sr-only">Toggle sidebar</span>
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden h-full">
        <aside
          // `no-print` here was already in place; the Phase 1g
          // (plan: docs/plans/print-default-opt-in.md) audit
          // confirmed both the sidebar AND the mobile top bar
          // (the line above) have the class. The Pro launching
          // banner (the line above that) now also has it as
          // defense-in-depth — the original PDF-leak bug was
          // the banner missing this class.
          className={`no-print w-64 bg-background lg:bg-muted border-r border-border lg:block ${
            isSidebarOpen ? 'block' : 'hidden'
          } lg:relative absolute inset-y-0 left-0 z-40 transform transition-transform duration-300 ease-in-out lg:translate-x-0 ${
            isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <nav className="h-full overflow-y-auto p-4 flex flex-col">
            <Link href="/" className="mb-6 block">
              <Logo variant="horizontal" height={26} />
            </Link>
            {navItems.map((item) => (
              <Link key={item.href} href={item.href} passHref>
                <Button
                  variant={pathname === item.href ? 'secondary' : 'ghost'}
                  className={`shadow-none my-1 w-full justify-start ${
                    pathname === item.href ? 'bg-accent text-accent-foreground' : ''
                  }`}
                  onClick={() => setIsSidebarOpen(false)}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Button>
              </Link>
            ))}
            <div className="mt-auto pt-4 border-t border-border space-y-2">
              <ThemeToggle />
              <Suspense fallback={<div className="h-9 w-full" />}>
                <UserMenu />
              </Suspense>
            </div>
          </nav>
        </aside>

        <main className="flex-1 overflow-y-auto p-0 lg:p-4">{children}</main>
      </div>
    </div>
  );
}
