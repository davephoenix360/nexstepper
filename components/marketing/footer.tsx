import Link from 'next/link';
import { Circle } from 'lucide-react';

/**
 * MarketingFooter — slim footer with logo, nav columns, and copyright.
 */
export function MarketingFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t bg-background py-12">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Link href="/" className="inline-flex items-center gap-2">
              <Circle className="size-5 text-primary" />
              <span className="text-base font-semibold tracking-tight">
                Nextep
              </span>
            </Link>
            <p className="mt-3 max-w-xs text-sm text-muted-foreground">
              AI-assisted resumes for people who&apos;d rather be interviewing
              than formatting.
            </p>
          </div>

          <FooterColumn
            title="Product"
            links={[
              { href: '/#features', label: 'Features' },
              { href: '/pricing', label: 'Pricing' },
              { href: '/sign-up', label: 'Sign up' }
            ]}
          />

          <FooterColumn
            title="Resources"
            links={[
              { href: '/#how-it-works', label: 'How it works' },
              { href: '/#faq', label: 'FAQ' }
            ]}
          />

          <FooterColumn
            title="Legal"
            links={[
              { href: '/privacy', label: 'Privacy' },
              { href: '/terms', label: 'Terms' },
              { href: '/cookies', label: 'Cookies' }
            ]}
          />
        </div>

        <div className="mt-10 flex flex-col items-start justify-between gap-3 border-t pt-6 sm:flex-row sm:items-center">
          <p className="text-xs text-muted-foreground">
            &copy; {year} Nextep. All rights reserved.
          </p>
          <p className="text-xs text-muted-foreground">
            Built with Next.js, Better Auth, Drizzle, and a lot of coffee.
          </p>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  links
}: {
  title: string;
  links: Array<{ href: string; label: string }>;
}) {
  return (
    <div>
      <h4 className="text-sm font-semibold text-foreground">{title}</h4>
      <ul className="mt-3 space-y-2">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}