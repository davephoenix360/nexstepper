import Link from 'next/link';
import { Circle } from 'lucide-react';

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
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/" className="inline-flex items-center gap-2">
            <Circle className="size-5 text-primary" />
            <span className="text-base font-semibold tracking-tight">
              Nextep
            </span>
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
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">{children}</main>
      <footer className="mx-auto max-w-3xl px-4 pb-12 text-xs text-muted-foreground sm:px-6">
        <p>
          Questions? Email{' '}
          <a
            href="mailto:privacy@nextep.app"
            className="underline underline-offset-0"
          >
            privacy@nextep.app
          </a>
          .
        </p>
        <p className="mt-2">
          © {new Date().getFullYear()} Nextep. Generated from open legal
          templates; not reviewed by counsel.
        </p>
      </footer>
    </div>
  );
}