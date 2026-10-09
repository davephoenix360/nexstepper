import type { MetadataRoute } from 'next';
import { absoluteUrl, getSiteOrigin } from '@/lib/site';

/**
 * Statically rendered at build time. Combined with the note in
 * `lib/site.ts` about `GOOGLE_SITE_VERIFICATION`, this means a robots change
 * requires a redeploy to go live.
 */
export const dynamic = 'force-static';

/**
 * Prefixes withheld from crawlers.
 *
 * These are all prefix matches — Next.js emits them verbatim and Google
 * matches by path prefix, so `/dashboard` also covers `/dashboard/resumes/…`.
 *
 * `/api/`      — never indexable content anyway; crawling it just burns
 *                crawl budget against endpoints that return JSON/errors.
 * `/dashboard` — session-gated, so crawlers get bounced to sign-in. Blocking
 *                it explicitly avoids feeding the bot a redirect chain.
 * `/r/`        — PUBLIC share links, and the most important entry here.
 *                Each token is a distinct URL containing a real person's
 *                resume, reachable by anyone holding the link. Leaving this
 *                crawlable invites a search engine to build an index of
 *                every resume ever shared. `lib/share/token.ts` reaches the
 *                same conclusion in a comment ("we'd rather it stays
 *                quiet") — this is the machine-readable half of that.
 * `/sign-in`   — thin, no indexable content.
 * `/sign-up`   — thin, no indexable content.
 * `/forgot-password`, `/reset-password` — thin, no indexable content.
 *
 * Deliberately NOT listed, i.e. explicitly crawlable:
 * `/privacy`, `/terms`, `/cookies` — regulators and users need to be able to
 * find these, and the cookie policy in particular is what an auditor checks
 * first. See `docs/SELF_HOSTING.md`: self-hosters must replace this file's
 * intent with their own legal pages.
 */
const DISALLOWED_PATHS = [
  '/api/',
  '/dashboard',
  '/r/',
  '/sign-in',
  '/sign-up',
  '/forgot-password',
  '/reset-password',
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: DISALLOWED_PATHS,
      },
    ],
    sitemap: absoluteUrl('/sitemap.xml'),
    host: getSiteOrigin(),
  };
}