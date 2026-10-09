import type { MetadataRoute } from 'next';
import { absoluteUrl } from '@/lib/site';

export const dynamic = 'force-static';

type PublicRoute = {
  path: string;
  priority: number;
  changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'];
};

/**
 * Every indexable URL in the app, and nothing else.
 *
 * This list is the sitemap's contract, and it must stay a SUBSET of what
 * `app/robots.ts` allows. A URL in one and not the other is a bug:
 * listed-but-blocked is invisible (Google just drops it), while
 * allowed-but-unlisted quietly starves a page of crawl attention.
 *
 * Enumerated deliberately rather than globbed — an accidental new route
 * should show up in a diff for review, not silently enter the index.
 *
 * Excluded and why:
 *   /dashboard/*  — private, session-gated, and robots-blocked.
 *   /r/[token]    — per-recipient share links; see the `/r/` note in robots.ts.
 *   /sign-in, /sign-up, /forgot-password, /reset-password — robots-blocked,
 *                  no indexable content.
 *
 * `lastModified` is intentionally omitted. These pages change on a human
 * timescale (a quarterly legal edit), not a deploy timescale, and stamping
 * every build would tell Google all five changed just now — which trains it
 * to ignore the field.
 */
const PUBLIC_ROUTES: PublicRoute[] = [
  { path: '/', priority: 1, changeFrequency: 'weekly' },
  { path: '/pricing', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/privacy', priority: 0.3, changeFrequency: 'yearly' },
  { path: '/terms', priority: 0.3, changeFrequency: 'yearly' },
  { path: '/cookies', priority: 0.3, changeFrequency: 'yearly' },
];

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_ROUTES.map(({ path, priority, changeFrequency }) => ({
    url: absoluteUrl(path),
    priority,
    changeFrequency,
  }));
}