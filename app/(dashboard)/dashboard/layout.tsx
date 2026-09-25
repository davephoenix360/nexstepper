'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme-toggle';
import { UserMenu } from '@/components/user-menu';
import { Home, Settings, Shield, Menu, FileText, CircleIcon } from 'lucide-react';

export default function DashboardLayout({
  children
}: {
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
      <div className="no-print lg:hidden flex items-center justify-between bg-background border-b border-border p-4">
        <Link
          href="/"
          className="flex items-center gap-2 text-base font-semibold tracking-tight text-foreground"
        >
          <CircleIcon className="size-5 text-primary" />
          Nextepper
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
          className={`no-print w-64 bg-background lg:bg-muted border-r border-border lg:block ${
            isSidebarOpen ? 'block' : 'hidden'
          } lg:relative absolute inset-y-0 left-0 z-40 transform transition-transform duration-300 ease-in-out lg:translate-x-0 ${
            isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <nav className="h-full overflow-y-auto p-4 flex flex-col">
            <Link
              href="/"
              className="flex items-center gap-2 mb-6 text-base font-semibold tracking-tight text-foreground"
            >
              <CircleIcon className="size-6 text-primary" />
              Nexstepper
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