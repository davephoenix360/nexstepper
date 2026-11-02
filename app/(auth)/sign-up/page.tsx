import { Login } from '../login';
import { isGoogleAuthEnabled } from '@/lib/auth-google';
import { getTurnstileConfig } from '@/lib/turnstile';

export default function SignUpPage() {
  // The bot check is resolved on the server and passed down, so the
  // widget and the server-side gate are decided by the SAME read in the
  // SAME request. See lib/turnstile.ts.
  const { siteKey } = getTurnstileConfig();
  return (
    <Login
      mode="signup"
      googleEnabled={isGoogleAuthEnabled()}
      turnstileSiteKey={siteKey}
    />
  );
}
