import './globals.css';
import type { Metadata, Viewport } from 'next';
import { Manrope } from 'next/font/google';
import { getUser } from '@/lib/db/queries';
import { PostHogProvider } from '@/components/posthog-provider';
import { ThemeProvider } from '@/components/theme-provider';

export const metadata: Metadata = {
  title: 'Nextep — AI-assisted resume builder',
  description:
    'Master-resume → tailored variants, ATS-style scoring, peer reviews, and real-time collaboration.'
};

export const viewport: Viewport = {
  maximumScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0f' }
  ]
};

const manrope = Manrope({ subsets: ['latin'] });

/**
 * Inline no-FOUC script — runs before paint to apply the right theme class.
 * Reads localStorage('nextep-theme'), falls back to prefers-color-scheme.
 *
 * The script is intentionally tiny (no deps) and uses try/catch because
 * localStorage may be unavailable in private browsing / sandboxed iframes.
 */
const THEME_INIT_SCRIPT = `(function(){try{var s=localStorage.getItem('nextep-theme');var d=window.matchMedia('(prefers-color-scheme: dark)').matches;if(s==='dark'||((!s||s==='system')&&d)){document.documentElement.classList.add('dark');}else{document.documentElement.classList.remove('dark');}}catch(e){}})();`;

export default async function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  // Pre-warm the session on the server so layout-level reads are cheap.
  // Better Auth's cookie cache means this typically does no DB work.
  // (Will throw if no DB is reachable — see README for setup steps.)
  await getUser();

  return (
    <html lang="en" suppressHydrationWarning className={manrope.className}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-[100dvh] bg-background font-sans text-foreground antialiased">
        <ThemeProvider>
          <PostHogProvider>{children}</PostHogProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}