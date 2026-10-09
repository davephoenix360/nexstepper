import { Login } from '../login';
import { isGoogleAuthEnabled } from '@/lib/auth-google';

export default function SignUpPage() {
  return <Login mode="signup" googleEnabled={isGoogleAuthEnabled()} />;
}