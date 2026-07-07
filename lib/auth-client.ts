import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({
  // baseURL is read from NEXT_PUBLIC_APP_URL by Better Auth when omitted.
});

export const { signIn, signUp, signOut, useSession } = authClient;