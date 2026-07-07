import { headers } from 'next/headers';
import { eq } from 'drizzle-orm';
import { db } from './drizzle';
import { subscriptions, user, type Subscription, type User } from './schema';
import { auth } from '@/lib/auth';

/**
 * Get the current user from the Better Auth session, joined with the user row.
 * Returns null if not signed in.
 *
 * Used by server components / actions. For client-side reads, use `useSession`
 * from `lib/auth-client.ts` instead.
 */
export async function getUser(): Promise<User | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;

  const rows = await db
    .select()
    .from(user)
    .where(eq(user.id, session.user.id))
    .limit(1);

  return rows[0] ?? null;
}

/**
 * Get the current user's subscription. Returns a default free-tier row if no
 * subscription record exists yet (everyone is on Free until they upgrade).
 */
export async function getSubscription(): Promise<Subscription> {
  const u = await getUser();
  if (!u) {
    // Unauthenticated callers get the free plan as a safe default
    return makeFreeSubscription('anonymous');
  }

  const rows = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, u.id))
    .limit(1);

  if (rows[0]) return rows[0];

  // Auto-create a free-tier row so downstream code can always read one
  const [created] = await db
    .insert(subscriptions)
    .values({ id: crypto.randomUUID(), userId: u.id, plan: 'free', status: 'inactive' })
    .returning();
  return created ?? makeFreeSubscription(u.id);
}

function makeFreeSubscription(userId: string): Subscription {
  return {
    id: 'anonymous',
    userId,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    stripePriceId: null,
    plan: 'free',
    status: 'inactive',
    currentPeriodEnd: null,
    createdAt: new Date(),
    updatedAt: new Date()
  };
}

export async function getSubscriptionByStripeCustomerId(customerId: string) {
  const rows = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.stripeCustomerId, customerId))
    .limit(1);
  return rows[0] ?? null;
}

export async function upsertSubscription(
  userId: string,
  data: Partial<Omit<Subscription, 'id' | 'userId' | 'createdAt'>>
) {
  await db
    .insert(subscriptions)
    .values({ id: crypto.randomUUID(), userId, ...data })
    .onConflictDoUpdate({
      target: subscriptions.userId,
      set: { ...data, updatedAt: new Date() }
    });
}