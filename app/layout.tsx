import './globals.css';
import type { Metadata, Viewport } from 'next';
import { Manrope } from 'next/font/google';
import { getUser } from '@/lib/db/queries';

export const metadata: Metadata = {
  title: 'Nextep — AI-assisted resume builder',
  description:
    'Master-resume → tailored variants, ATS-style scoring, peer reviews, and real-time collaboration.'
};

export const viewport: Viewport = {
  maximumScale: 1
};

const manrope = Manrope({ subsets: ['latin'] });

export default async function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  // Pre-warm the session on the server so layout-level reads are cheap.
  // Better Auth's cookie cache means this typically does no DB work.
  await getUser();

  return (
    <html
      lang="en"
      className={`bg-white dark:bg-gray-950 text-black dark:text-white ${manrope.className}`}
    >
      <body className="min-h-[100dvh] bg-gray-50">{children}</body>
    </html>
  );
}