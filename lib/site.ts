/**
 * Canonical site-origin resolution and absolute-URL construction.
 *
 * This is the single source of truth for "what is this site's origin".
 * Two things need it and neither should re-derive the fallback chain:
 *
 *   - `app/sitemap.ts` / `app/robots.ts` — Google must be handed absolute
 *     URLs; relative ones are rejected.
 *   - `app/layout.tsx` — `metadataBase` (absolute OG/canonical URLs) and
 *     the `google-site-verification` meta tag.
 *
 * It also replaces the inline copy that lived in `lib/share/token.ts`, so
 * the precedence rule below is stated once and tested once.
 *
 * Precedence (unchanged from the original inline implementation):
 *   NEXT_PUBLIC_APP_URL → BASE_URL → http://localhost:3000
 *
 * Note this is deliberately *not* validated against a known host. A
 * self-hoster running `nexstepper` on their own domain should have this
 * work without patching the codebase. What we DO guard is the shape: a
 * malformed URL would throw inside `metadataBase` and take the entire
 * build down, so anything unparseable degrades to the dev default rather
 * than exploding.
 */

/** Used when neither env var is set, and as the fallback when the
 *  configured value is not a parseable absolute URL. */
const DEFAULT_ORIGIN = 'http://localhost:3000';

/** Strip any trailing slashes so `origin + path` never doubles up. */
function normalizeOrigin(value: string): string {
  return value.replace(/\/+$/, '');
}

/**
 * Resolve the site's origin.
 *
 * Never throws. An unparseable or non-absolute configured value falls back
 * to {@link DEFAULT_ORIGIN} — a wrong-but-working origin is recoverable, a
 * build that dies on a typo in an env var is not.
 */
export function getSiteOrigin(): string {
  const configured = (
    process.env.NEXT_PUBLIC_APP_URL ?? process.env.BASE_URL ?? ''
  ).trim();

  if (!configured) return DEFAULT_ORIGIN;

  try {
    const parsed = new URL(configured);
    // Require an explicit protocol. `new URL('nexstepper.com')` throws, but
    // `new URL('ftp://nexstepper.com')` parses — and an ftp: origin would
    // silently produce nonsense sitemap entries.
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return DEFAULT_ORIGIN;
    }
    return normalizeOrigin(parsed.origin);
  } catch {
    return DEFAULT_ORIGIN;
  }
}

/**
 * Build an absolute URL for a site-absolute path.
 *
 * `absoluteUrl('/privacy')` → `https://www.nexstepper.com/privacy`
 *
 * Accepts a path with or without a leading slash and always returns exactly
 * one slash between origin and path, so callers do not have to care which
 * convention they used.
 */
export function absoluteUrl(path = '/'): string {
  const origin = getSiteOrigin();
  const normalized = path.startsWith('/') ? path : `/${path}`;
  // Preserve the root path rather than producing a bare trailing slash.
  return normalized === '/' ? origin : `${origin}${normalized}`;
}

/**
 * The `google-site-verification` token, shaped for Next.js `metadata.verification`.
 *
 * Returns `undefined` when the env var is unset so Next.js omits the tag
 * entirely — an empty `<meta name="google-site-verification" content="">`
 * is worse than no tag, because it looks like a failed verification to
 * whoever is debugging it.
 *
 * This is read from a *non-public* env var on purpose. `metadata` is
 * evaluated on the server, so the token never reaches the client bundle,
 * and `NEXT_PUBLIC_` would inline it into every page.
 *
 * ## Build-time vs runtime (verified against `pnpm build`, 2026-10-09)
 *
 * These differ, and guessing wrong here costs an afternoon of "I set the
 * env var and nothing happened":
 *
 *   `robots.txt` + `sitemap.xml` → prerendered STATIC (`○` in the build
 *     output, emitted to `.next/server/app/*.body`), so frozen at build
 *     time. Neither reads this token, but the ORIGIN they bake in is
 *     frozen — which is why `NEXT_PUBLIC_APP_URL` must be correct at
 *     build time, not just at runtime.
 *
 *   the layout `verification` tag → every page shares the root layout,
 *     and that layout awaits `getUser()`, so every page renders DYNAMIC
 *     (`ƒ`). The tag is read from the runtime environment per request and
 *     does **not** need a redeploy to appear. If a route is ever made
 *     static, its copy freezes at build time like the sitemap does.
 */
export function googleSiteVerification(): Record<string, string> | undefined {
  const token = process.env.GOOGLE_SITE_VERIFICATION?.trim();
  return token ? { google: token } : undefined;
}