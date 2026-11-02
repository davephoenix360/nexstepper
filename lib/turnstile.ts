import 'server-only';

/**
 * Cloudflare Turnstile — the bot check on the auth surfaces.
 *
 * ## Why the sign-up form is worth protecting
 *
 * Every account is a wallet. A bot that signs up can then make the
 * calls this product charges for — the JD parser, the resume parser,
 * the Jev requirement evaluation, and the chat on Pro. The free tier's
 * chat chain is $0 (see `lib/ai/providers.ts`), but the parse and
 * analysis calls are not, and an unbounded number of accounts is an
 * unbounded bill.
 *
 * ## Why the site key is a server-held env var, not `NEXT_PUBLIC_`
 *
 * `NEXT_PUBLIC_*` values are BAKED INTO THE CLIENT BUNDLE AT BUILD
 * TIME. On Vercel a preview deployment is built with the Preview env
 * scope, so a `NEXT_PUBLIC_` site key set only in Production is absent
 * from a preview build — while the preview's RUNTIME could still have
 * the secret. That combination is the dangerous one: the server demands
 * a token the client cannot produce, and **nobody can sign up on the
 * preview**.
 *
 * Reading the site key from the server at REQUEST time and passing it
 * down as a prop removes the skew entirely: the widget and the gate
 * are decided by the SAME read, in the SAME request, on the SAME
 * environment. The site key is a public value, so nothing is lost by
 * holding it server-side — only the convenience of `NEXT_PUBLIC_`.
 *
 * If you rename these to `NEXT_PUBLIC_*`, you re-introduce the skew.
 *
 * ## Failing OPEN, loudly
 *
 * Turnstile is enabled only when BOTH the site key and the secret are
 * present. A half-configured deployment therefore has NO bot check
 * rather than a bot check that rejects everyone. That is the right
 * direction for a missing env var, but it is a silent hole, so the
 * misconfiguration is logged loudly on boot.
 */
import { captcha } from 'better-auth/plugins';
import { TURNSTILE_ACTIONS } from '@/lib/turnstile-actions';

/**
 * The `data-action` each surface declares, and therefore the action the
 * server requires back from siteverify.
 *
 * A token minted for one surface cannot be replayed against another:
 * the siteverify response carries the action the widget declared, and
 * the plugin rejects a mismatch. The constants live in
 * `lib/turnstile-actions.ts` so the client form and this server
 * config read the same values.
 */
export { TURNSTILE_ACTIONS, type TurnstileAction } from '@/lib/turnstile-actions';

export type TurnstileConfig = {
  /** True when BOTH the site key and the secret are present. */
  enabled: boolean;
  /** The public site key, or null when disabled. */
  siteKey: string | null;
  /** The secret key, or null when disabled. */
  secretKey: string | null;
  /**
   * The hostnames a verification may report.
   *
   * Never empty in production: an empty allowlist turns the hostname
   * check off, which is the check that stops a token minted on one of
   * our own preview deployments being replayed on production.
   */
  allowedHostnames: string[];
};

/**
 * The hostnames used when `TURNSTILE_HOSTNAMES` is not set.
 *
 * Production gets the two hosts the app actually serves on (the apex
 * 308-redirects to `www`, so the browser sees `www`). Local dev gets
 * `localhost` — never `localhost` in a production allowlist, because a
 * token minted on a developer's machine would then be accepted in
 * production.
 */
export function defaultTurnstileHostnames(
  nodeEnv: string | undefined = process.env.NODE_ENV
): string[] {
  return nodeEnv === 'production'
    ? ['www.nexstepper.com', 'nexstepper.com']
    : ['localhost'];
}

/**
 * Parse a comma-separated hostname allowlist.
 *
 * Exported for the unit tests: the parsing is the thing most likely to
 * be wrong (a stray space, an empty entry, a trailing comma) and the
 * consequence of getting it wrong is either a locked-out user or a
 * check that is quietly off.
 */
export function parseTurnstileHostnames(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((hostname) => hostname.trim())
    .filter(Boolean);
}

/**
 * The misconfiguration warning, emitted ONCE per process.
 *
 * `getTurnstileConfig()` is called on every request that renders an
 * auth page, so warning inside it would print on every single one.
 */
let warned: string | null = null;

function warnOnce(message: string): void {
  if (warned === message) return;
  warned = message;
  console.warn(message);
}

/**
 * Reset the once-per-process warning latch. Test-only — the same
 * pattern `lib/scroll-lock.ts` uses for its reset hook.
 */
export function __resetTurnstileWarnings(): void {
  warned = null;
}

/**
 * The current Turnstile configuration, read fresh on every call.
 *
 * Reading fresh (rather than at module load) is deliberate: it keeps
 * the server and the page that renders the widget on the same read, in
 * the same request, and it makes the config testable by mutating
 * `process.env` between cases.
 */
export function getTurnstileConfig(): TurnstileConfig {
  const siteKey = process.env.TURNSTILE_SITE_KEY?.trim() || null;
  const secretKey = process.env.TURNSTILE_SECRET?.trim() || null;

  const configured = parseTurnstileHostnames(process.env.TURNSTILE_HOSTNAMES);
  const allowedHostnames =
    configured.length > 0 ? configured : defaultTurnstileHostnames();

  const enabled = Boolean(siteKey && secretKey);

  if (siteKey && !secretKey) {
    warnOnce(
      '[turnstile] TURNSTILE_SITE_KEY is set but TURNSTILE_SECRET is not — ' +
        'bot protection is DISABLED. Set both to turn it on.'
    );
  }
  if (!siteKey && secretKey) {
    warnOnce(
      '[turnstile] TURNSTILE_SECRET is set but TURNSTILE_SITE_KEY is not — ' +
        'bot protection is DISABLED. Set both to turn it on.'
    );
  }

  return {
    enabled,
    siteKey: enabled ? siteKey : null,
    secretKey: enabled ? secretKey : null,
    allowedHostnames
  };
}

/**
 * The Better Auth captcha plugin instances, one per protected surface.
 *
 * Better Auth runs EVERY plugin's `onRequest` hook in order, and each
 * hook decides for itself whether it applies (by matching the request
 * path against its own `endpoints`). So three instances with
 * disjoint endpoint lists means exactly one fires per request — and
 * each one can carry its OWN `expectedAction`, which a single instance
 * could not.
 *
 * The plugin reads the token from the `x-captcha-response` REQUEST
 * HEADER, and calls Cloudflare's siteverify itself. We do not call
 * siteverify by hand, and the browser never talks to it.
 */
export function turnstileAuthPlugins(config: TurnstileConfig) {
  if (!config.enabled || !config.secretKey) return [];

  const base = {
    provider: 'cloudflare-turnstile' as const,
    secretKey: config.secretKey,
    allowedHostnames: config.allowedHostnames
  };

  return [
    captcha({
      ...base,
      endpoints: ['/sign-up/email'],
      expectedAction: TURNSTILE_ACTIONS.signup
    }),
    captcha({
      ...base,
      endpoints: ['/sign-in/email'],
      expectedAction: TURNSTILE_ACTIONS.login
    }),
    captcha({
      ...base,
      endpoints: ['/request-password-reset'],
      expectedAction: TURNSTILE_ACTIONS.passwordReset
    })
  ];
}
