import type { Metadata } from 'next';

/**
 * Route layout for the Design Lab.
 *
 * Exists as a server component solely to publish a noindex/nofollow
 * meta tag and a stable <title>. The page itself is a client
 * component (it owns the print-settings panel state and needs to
 * mutate CSS custom properties on the templates' wrapper), but
 * `metadata` exports are server-only — so the server/client split
 * lives here.
 *
 * No layout chrome (header / footer): the design lab is an internal
 * visual review surface, not a user-facing page.
 */
export const metadata: Metadata = {
  title: 'Design Lab — Nexstepper',
  description:
    'Internal visual review surface — every template, sample data, no auth.',
  robots: { index: false, follow: false }
};

export default function DesignLabLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}