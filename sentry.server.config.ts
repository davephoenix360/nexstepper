import * as Sentry from '@sentry/nextjs';

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    debug: false,
    // Sentry 11 replaced `sendDefaultPii` with the more granular
    // `dataCollection` config (header / cookie / query-param deny
    // lists). Defaults are conservative; we leave them as-is here and
    // rely on the wizard-added `dataCollection` block in
    // `instrumentation-client.ts` for client-side hardening.
    dataCollection: {
      userInfo: false
    }
  });
}