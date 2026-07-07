import { headers } from 'next/headers';
import { auth } from '@/lib/auth';

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  return Response.json(session?.user ?? null);
}