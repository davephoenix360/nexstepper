// This file configures the initialization of Sentry for edge features (middleware, edge routes, and so on).
// The config you add here will be used whenever one of the edge features is loaded.
// Note that this config is unrelated to the Vercel Edge Runtime and is also required when running locally.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs';

const sentryDsn =
  process.env.NEXT_PUBLIC_SENTRY_DSN ?? process.env.SENTRY_DSN;

if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    // 10% sampling — matches `sentry.server.config.ts` and the
    // client init in `instrumentation-client.ts`.
    tracesSampleRate: 0.1,
    debug: false,
    // Hardening: deny-list of header / cookie / query-param names that
    // often carry identifying info (forwarded-for IPs, user-agent
    // fragments, etc.). Supersedes the `sendDefaultPii` option that
    // existed in Sentry 10. Matches `instrumentation-client.ts`.
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
