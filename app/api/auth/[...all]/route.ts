import { toNextJsHandler } from 'better-auth/next-js';
import { auth } from '@/lib/auth';

// Better Auth's catch-all route — handles /api/auth/sign-up, /sign-in, /sign-out,
// /session, /forget-password, etc. See https://better-auth.com/docs/api-reference
export const { GET, POST } = toNextJsHandler(auth);