import { Login } from '../login';
import { isGoogleAuthEnabled } from '@/lib/auth-google';

export default function SignInPage() {
  return <Login mode="signin" googleEnabled={isGoogleAuthEnabled()} />;
}