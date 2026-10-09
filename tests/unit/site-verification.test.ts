import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import robotsRoute from '@/app/robots';
import sitemapRoute from '@/app/sitemap';
import { absoluteUrl, getSiteOrigin, googleSiteVerification } from '@/lib/site';

/**
 * Site-origin resolution, robots, sitemap, and the Google verification tag.
 *
 * Why so much for four small files: all four are statically rendered at
 * BUILD time and shipped to a crawler. A typo here produces a 200 response
 * with wrong content, so nothing errors and nothing warns — the only way to
 * know it's right is to assert it. (Verified against live production on
 * 2026-10-09: /robots.txt was returning an HTML 404 page.)
 */

const ENV_KEYS = [
  'NEXT_PUBLIC_APP_URL',
  'BASE_URL',
  'GOOGLE_SITE_VERIFICATION',
] as const;

let saved: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

beforeEach(() => {
  saved = {};
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

/**
 * The `rules` field of Next.js's `MetadataRoute.Robots` is a deeply
 * recursive union (it nests `rules` inside `rules`) and is therefore not
 * iterable. This is the flat shape our own `robots.ts` actually emits —
 * asserting against the real output via a readable local type beats
 * fighting the vendor union at every call site.
 */
type EmittedRule = {
  userAgent?: string | string[];
  allow?: string | string[];
  disallow?: string | string[];
};

function emittedRules(): EmittedRule[] {
  return robotsRoute().rules as unknown as EmittedRule[];
}

/** Flatten robots()'s rules into a plain list of disallow prefixes. */
function disallowList(): string[] {
  const out: string[] = [];
  for (const rule of emittedRules()) {
    const disallow = rule?.disallow;
    if (Array.isArray(disallow)) out.push(...disallow);
    else if (typeof disallow === 'string') out.push(disallow);
  }
  return out;
}

/** Sitemap entries reduced to their path component, for prefix comparisons. */
function sitemapPaths(): string[] {
  return sitemapRoute().map((entry) => new URL(entry.url).pathname);
}

describe('getSiteOrigin', () => {
  it('prefers NEXT_PUBLIC_APP_URL over BASE_URL', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://www.nexstepper.com';
    process.env.BASE_URL = 'https://wrong.example.com';
    expect(getSiteOrigin()).toBe('https://www.nexstepper.com');
  });

  it('falls back to BASE_URL when NEXT_PUBLIC_APP_URL is absent', () => {
    process.env.BASE_URL = 'https://fallback.example.com';
    expect(getSiteOrigin()).toBe('https://fallback.example.com');
  });

  it('falls back to localhost:3000 when neither var is set', () => {
    expect(getSiteOrigin()).toBe('http://localhost:3000');
  });

  it('strips a single trailing slash', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://www.nexstepper.com/';
    expect(getSiteOrigin()).toBe('https://www.nexstepper.com');
  });

  it('strips repeated trailing slashes', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://www.nexstepper.com///';
    expect(getSiteOrigin()).toBe('https://www.nexstepper.com');
  });

  it('drops any path so the origin stays an origin', () => {
    // A path in the env var would otherwise produce
    // https://host/base/sitemap.xml — technically valid, entirely wrong.
    process.env.NEXT_PUBLIC_APP_URL = 'https://www.nexstepper.com/nested/path';
    expect(getSiteOrigin()).toBe('https://www.nexstepper.com');
  });

  it('trims surrounding whitespace', () => {
    process.env.NEXT_PUBLIC_APP_URL = '  https://www.nexstepper.com  ';
    expect(getSiteOrigin()).toBe('https://www.nexstepper.com');
  });

  it('treats an empty string as unset', () => {
    // `??` would have kept '' and produced a relative sitemap URL.
    process.env.NEXT_PUBLIC_APP_URL = '';
    process.env.BASE_URL = '';
    expect(getSiteOrigin()).toBe('http://localhost:3000');
  });

  it('treats a whitespace-only string as unset', () => {
    process.env.NEXT_PUBLIC_APP_URL = '   ';
    expect(getSiteOrigin()).toBe('http://localhost:3000');
  });

  it('falls back rather than throwing on a malformed value', () => {
    // This value is consumed by `new URL()` in metadataBase, which would
    // otherwise crash the entire production build.
    process.env.NEXT_PUBLIC_APP_URL = 'not a url at all';
    expect(() => getSiteOrigin()).not.toThrow();
    expect(getSiteOrigin()).toBe('http://localhost:3000');
  });

  it('rejects a non-http protocol', () => {
    // `new URL('ftp://x')` parses happily; an ftp: sitemap is not useful.
    process.env.NEXT_PUBLIC_APP_URL = 'ftp://www.nexstepper.com';
    expect(getSiteOrigin()).toBe('http://localhost:3000');
  });

  it('preserves a non-default port', () => {
    // Needed for local dev against a non-3000 port.
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:4000';
    expect(getSiteOrigin()).toBe('http://localhost:4000');
  });
});

describe('absoluteUrl', () => {
  it('keeps a leading slash and produces exactly one separator', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://www.nexstepper.com';
    expect(absoluteUrl('/privacy')).toBe('https://www.nexstepper.com/privacy');
  });

  it('adds a missing leading slash', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://www.nexstepper.com';
    expect(absoluteUrl('privacy')).toBe('https://www.nexstepper.com/privacy');
  });

  it('does not double the slash when the origin has a trailing one', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://www.nexstepper.com/';
    expect(absoluteUrl('/privacy')).toBe('https://www.nexstepper.com/privacy');
  });

  it('returns a bare origin for the root path', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://www.nexstepper.com';
    expect(absoluteUrl('/')).toBe('https://www.nexstepper.com');
  });

  it('defaults to the root path', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://www.nexstepper.com';
    expect(absoluteUrl()).toBe('https://www.nexstepper.com');
  });
});

describe('googleSiteVerification', () => {
  it('returns undefined when unset so the tag is omitted entirely', () => {
    expect(googleSiteVerification()).toBeUndefined();
  });

  it('returns undefined for an empty string', () => {
    // An empty content="" is indistinguishable from a failed verification
    // to whoever is debugging it later.
    process.env.GOOGLE_SITE_VERIFICATION = '';
    expect(googleSiteVerification()).toBeUndefined();
  });

  it('returns undefined for whitespace only', () => {
    process.env.GOOGLE_SITE_VERIFICATION = '   ';
    expect(googleSiteVerification()).toBeUndefined();
  });

  it('shapes the token for Next.js metadata.verification', () => {
    process.env.GOOGLE_SITE_VERIFICATION = 'AbCdEf123456';
    expect(googleSiteVerification()).toEqual({ google: 'AbCdEf123456' });
  });

  it('trims the token', () => {
    process.env.GOOGLE_SITE_VERIFICATION = '  AbCdEf123456  ';
    expect(googleSiteVerification()).toEqual({ google: 'AbCdEf123456' });
  });
});

describe('robots()', () => {
  it('advertises an absolute sitemap URL', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://www.nexstepper.com';
    expect(robotsRoute().sitemap).toBe(
      'https://www.nexstepper.com/sitemap.xml'
    );
  });

  it('advertises the site host', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://www.nexstepper.com';
    expect(robotsRoute().host).toBe('https://www.nexstepper.com');
  });

  it('applies to all user agents', () => {
    const rules = emittedRules();
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({ userAgent: '*', allow: '/' });
  });

  it('blocks API, dashboard, share links, and auth routes', () => {
    const disallowed = disallowList();
    for (const prefix of [
      '/api/',
      '/dashboard',
      '/r/',
      '/sign-in',
      '/sign-up',
      '/forgot-password',
      '/reset-password',
    ]) {
      expect(disallowed).toContain(prefix);
    }
  });

  it('blocks /r/ — public share links must never be indexable', () => {
    // Highest-stakes entry in the file: each token is a distinct URL
    // holding a real person's resume.
    expect(disallowList()).toContain('/r/');
  });

  it('does NOT block the legal pages', () => {
    // Regulators and auditors look these up by URL; blocking them would
    // contradict the privacy policy's own commitments.
    const disallowed = disallowList();
    for (const legal of ['/privacy', '/terms', '/cookies']) {
      expect(disallowed.some((prefix) => legal.startsWith(prefix))).toBe(false);
    }
  });

  it('uses prefixes, not exact matches, for nested routes', () => {
    // '/dashboard' alone must cover /dashboard/resumes/[id]/preview.
    const disallowed = disallowList();
    expect(disallowed).toContain('/dashboard');
    expect(disallowed).not.toContain('/dashboard/');
  });
});

describe('sitemap()', () => {
  it('lists exactly the public routes', () => {
    expect(sitemapPaths().sort()).toEqual(
      ['/', '/cookies', '/pricing', '/privacy', '/terms'].sort()
    );
  });

  it('emits absolute URLs', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://www.nexstepper.com';
    for (const entry of sitemapRoute()) {
      // Compared against the bare origin, not origin + '/': the homepage
      // entry is `https://www.nexstepper.com` with no trailing slash,
      // which is the documented absoluteUrl('/') behaviour.
      expect(entry.url.startsWith('https://www.nexstepper.com')).toBe(true);
    }
  });

  it('excludes the private dashboard', () => {
    expect(sitemapPaths().some((p) => p.startsWith('/dashboard'))).toBe(false);
  });

  it('excludes share links', () => {
    // Unbounded — one URL per recipient.
    expect(sitemapPaths().some((p) => p.startsWith('/r/'))).toBe(false);
  });

  it('excludes auth routes', () => {
    expect(
      sitemapPaths().some((p) =>
        ['/sign-in', '/sign-up', '/forgot-password', '/reset-password'].some(
          (auth) => p.startsWith(auth)
        )
      )
    ).toBe(false);
  });

  it('has no duplicate URLs', () => {
    const urls = sitemapRoute().map((entry) => entry.url);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('ranks the homepage above the legal pages', () => {
    const entries = sitemapRoute();
    // Matched on pathname, not URL suffix — the homepage entry has no
    // trailing slash, so a suffix match on '/nexstepper.com' misses it.
    const home = entries.find((e) => new URL(e.url).pathname === '/');
    const legal = entries.find((e) => new URL(e.url).pathname === '/privacy');
    expect(home).toBeDefined();
    expect(legal).toBeDefined();
    expect(home!.priority).toBeDefined();
    expect(legal!.priority).toBeDefined();
    expect(home!.priority!).toBeGreaterThan(legal!.priority!);
  });

  it('omits lastModified rather than restamping every build', () => {
    // A lastModified that moves on every deploy trains Google to ignore it.
    for (const entry of sitemapRoute()) {
      expect(entry.lastModified).toBeUndefined();
    }
  });
});

describe('sitemap and robots agree', () => {
  /**
   * The invariant that silently breaks when someone adds a route: a page
   * listed in the sitemap but blocked in robots is dropped by Google with
   * no error anywhere. This is the check that catches it in CI instead.
   */
  it('no sitemap URL is blocked by robots', () => {
    const disallowed = disallowList();
    for (const path of sitemapPaths()) {
      for (const prefix of disallowed) {
        expect(
          path.startsWith(prefix),
          `"${path}" is in the sitemap but robots.txt disallows "${prefix}"`
        ).toBe(false);
      }
    }
  });

  it('robots allows the root and every sitemap path', () => {
    // Belt-and-braces: nothing in the sitemap may sit under a disallow.
    expect(disallowList()).not.toContain('/');
  });
});