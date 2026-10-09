import Link from 'next/link';

import { Logo } from '@/components/brand/logo';

/**
 * Layout for the legal pages (`/privacy`, `/terms`, `/cookies`).
 *
 * Deliberately minimalist — no nav rail, no marketing CTAs. The pages
 * need to read like a legal document, not a landing page. We only
 * include the header + footer so the user can navigate away if they
 * landed here by mistake.
 */
export default function LegalLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="inline-flex items-center">
            <Logo variant="horizontal" height={30} priority />
          </Link>
          <nav className="flex gap-4 text-sm text-muted-foreground">
            <Link href="/privacy" className="hover:text-foreground">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-foreground">
              Terms
            </Link>
            <Link href="/cookies" className="hover:text-foreground">
              Cookies
            </Link>
          </nav>
        </div>
      </header>
      {/*
        Full-bleed, NOT max-w-3xl.

        This <main> used to cap at 768px, which silently defeated the
        two-column `PolicyShell` inside it: the sidebar + prose grid
        was squeezed into 672px, so the article rendered ~408px wide
        with dead space on both sides regardless of the measure it
        asked for. Widening it here is what actually gives the shell
        room to breathe. `PolicyShell` owns its own max-width and
        padding from here on.
      */}
      <main className="w-full">{children}</main>
      <footer className="mx-auto max-w-6xl px-6 pb-14 text-xs text-muted-foreground">
        <p>
          Questions? Email{' '}
          <a
            href="mailto:privacy@nexstepper.com"
            className="underline underline-offset-0"
          >
            privacy@nexstepper.com
          </a>
          .
        </p>
        <p className="mt-2">
          © {new Date().getFullYear()} Nexstepper. Generated from open legal
          templates; not reviewed by counsel.
        </p>
      </footer>
    </div>
  );
}