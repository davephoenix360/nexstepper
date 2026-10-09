/**
 * Next.js 15.3+ client instrumentation entry. Loaded once per client boot,
 * before the app renders. Sentry's init location because:
 *
 *  - Surfaces init errors early (during dev startup, not first interaction).
 *
 * The `instrumentation.ts` sibling handles the server side.
 *
 * **PostHog used to be initialised here and deliberately no longer is.**
 * Consent can be granted at runtime, and a visitor who clicks "Accept
 * all" must start being tracked without a reload. Init moved to
 * `components/consent/analytics-gate.tsx`, which subscribes to the
 * consent decision. Initialising here would mean analytics started the
 * instant the page loaded — i.e. *before* anyone could decline.
 *
 * If NEXT_PUBLIC_SENTRY_DSN isn't set, this is a no-op — the rest of
 * the app keeps working without error monitoring.
 */
import * as Sentry from '@sentry/nextjs';

const sentryDsn =
  process.env.NEXT_PUBLIC_SENTRY_DSN ?? process.env.SENTRY_DSN;

if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    // 10% sampling — matches `sentry.server.config.ts`. Bump to 1.0
    // once we have volume worth analyzing.
    tracesSampleRate: 0.1,
    debug: false,
    // Hardening added by the Sentry 11 wizard: deny-list of header /
    // cookie / query-param names that often carry identifying info
    // (forwarded-for IPs, user-agent fragments, etc.). Supersedes the
    // `sendDefaultPii` option that existed in Sentry 10. See
    // https://docs.sentry.io/platforms/javascript/configuration/options/#dataCollection
    dataCollection: {
      userInfo: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      queues: false,
      httpBodies: [],
      httpHeaders: {
        deny: ['forwarded', '-ip', 'remote-', 'via', '-user']
      },
      cookies: { deny: ['forwarded', '-ip', 'remote-', 'via', '-user'] },
      urlQueryParams: {
        deny: ['forwarded', '-ip', 'remote-', 'via', '-user']
      }
    }
  });
}

/**
 * App Router navigation instrumentation. Next.js calls this hook
 * before each client-side route transition; Sentry uses it to
 * create a span + breadcrumb. Without it, Sentry prints the
 * `[@sentry/nextjs] ACTION REQUIRED: ...onRouterTransitionStart...`
 * warning every boot.
 *
 * Safe to export unconditionally — `captureRouterTransitionStart`
 * is a no-op when Sentry wasn't initialized above (no DSN set).
 */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
