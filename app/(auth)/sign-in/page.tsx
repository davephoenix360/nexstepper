import { Suspense } from 'react';
import { Login } from '../login';
import { isGoogleAuthEnabled } from '@/lib/auth-google';
import { getTurnstileConfig } from '@/lib/turnstile';

export default function SignInPage() {
  // The bot check is resolved on the server and passed down, so the
  // widget and the server-side gate are decided by the SAME read in the
  // SAME request. See lib/turnstile.ts.
  const { siteKey } = getTurnstileConfig();
  return (
    // `<Login>` reads `useSearchParams()` (for the "check your email"
    // banner and the `?redirect=` target), and in Next 16 that forces
    // the whole page into client-side rendering unless the component is
    // wrapped in a Suspense boundary. Without this, the page cannot be
    // PRERENDERED at build time — which means it becomes a Serverless
    // Function, and Vercel's Hobby plan allows only 12 of those per
    // deployment.
    //
    // The same shape as `reset-password/page.tsx`, with a placeholder
    // that matches the card's dimensions so there is no layout jump.
    <Suspense fallback={<div className="min-h-[32rem]" />}>
      <Login
        mode="signin"
        googleEnabled={isGoogleAuthEnabled()}
        turnstileSiteKey={siteKey}
      />
    </Suspense>
  );
}
