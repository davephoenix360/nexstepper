import { z } from 'zod';

/**
 * `flexibleUrl` — a URL field that's friendly to humans.
 *
 * Accepts three input shapes:
 *  - empty string  — "not set" sentinel, same as the rest of the schema
 *  - full URL      — `https://diepreyecd.dev`, `http://example.com:8080/path?q=1`
 *  - bare domain   — `diepreyecd.dev`, `www.diepreyecd.dev`, `sub.example.co.uk/path`
 *
 * On success, normalizes bare-domain input by prepending `https://`. So a
 * user who types `diepreyecd.dev` ends up with `https://diepreyecd.dev` in
 * storage — clean data, easier to render as `<a href>`, consistent with the
 * `https://`-only convention most modern browsers default to.
 *
 * What's NOT accepted:
 *  - `not-a-url` (no dot, no TLD)
 *  - `localhost` (no dot)
 *  - `192.168.1.1` (no alphabetic TLD)
 *  - bare schemes like `https://` (no host)
 *
 * The full-URL branch uses the platform `URL` constructor as a second-line
 * check, so any RFC-3986 weirdness that slips past our regex still gets
 * caught.
 *
 * Used wherever a section schema has a `url` field (basics, work, education,
 * projects, volunteer, certificates, publications). Keeping it in one place
 * means the contract is identical across every section.
 */
export const flexibleUrl = z
  .string()
  .refine(
    (s) => {
      if (s === '') return true;
      // Full URL — defer to the platform parser.
      if (/^https?:\/\//i.test(s)) {
        try {
          new URL(s);
          return true;
        } catch {
          return false;
        }
      }
      // Bare domain — at least one dot, TLD 2+ chars, optional path/query/fragment.
      // First label can't start with a hyphen (real hostnames can't).
      return /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(\/.*)?$/i.test(s);
    },
    {
      message:
        'Enter a website URL or bare domain (e.g. example.com or https://example.com)'
    }
  )
  .transform((s) => {
    if (s === '') return s;
    if (/^https?:\/\//i.test(s)) return s;
    return `https://${s}`;
  });

/**
 * Schema for an optional URL field that defaults to empty string.
 * Drop-in replacement for `z.url().or(z.literal('')).default('')`.
 */
export const optionalFlexibleUrl = flexibleUrl
  .or(z.literal(''))
  .default('');