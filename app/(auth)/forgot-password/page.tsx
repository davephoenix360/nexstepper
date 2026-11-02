import { getTurnstileConfig } from '@/lib/turnstile';
import { ForgotPasswordForm } from './forgot-password-form';

export default function ForgotPasswordPage() {
  // The bot check is resolved on the server and passed down, so the
  // widget and the server-side gate are decided by the SAME read in the
  // SAME request. See lib/turnstile.ts.
  const { siteKey } = getTurnstileConfig();
  return <ForgotPasswordForm turnstileSiteKey={siteKey} />;
}
