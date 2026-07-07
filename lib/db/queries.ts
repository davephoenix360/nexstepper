import { headers } from 'next/headers';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from './drizzle';
import {
  resumes,
  resumeRevisions,
  subscriptions,
  user,
  type Resume,
  type ResumeRevision,
  type Subscription,
  type User
} from './schema';
import { auth } from '@/lib/auth';
import {
  blankResumeData,
  resumeDataSchema,
  type ResumeData
} from '@/lib/resume-schema';

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

// ─── Resume queries ─────────────────────────────────────────────────────────

/** A master resume + its variants, for the list view. */
export type ResumeFamily = {
  master: Resume;
  variants: Resume[];
};

/**
 * List all of a user's resumes grouped as master → variants.
 *
 * Masters come first (sorted by most recently updated). Variants are nested
 * under their parent. Variants without a master (orphaned) are filtered out.
 */
export async function listResumes(userId: string): Promise<ResumeFamily[]> {
  // One round trip: pull all the user's resumes, then group in memory.
  const rows = await db
    .select()
    .from(resumes)
    .where(eq(resumes.userId, userId))
    .orderBy(desc(resumes.updatedAt));

  const masters = rows.filter((r) => r.isMaster);
  const variantsByParent = new Map<string, Resume[]>();
  for (const r of rows) {
    if (!r.isMaster && r.parentResumeId) {
      const arr = variantsByParent.get(r.parentResumeId) ?? [];
      arr.push(r);
      variantsByParent.set(r.parentResumeId, arr);
    }
  }

  return masters.map((master) => ({
    master,
    variants: (variantsByParent.get(master.id) ?? []).sort(
      (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
    )
  }));
}

/**
 * Fetch a single resume + its current revision's data. Returns null if the
 * resume doesn't exist OR doesn't belong to the given user (don't leak
 * existence to non-owners).
 *
 * The returned `data` is the parsed `ResumeData` (JSONB validated by Zod).
 * If the JSONB blob is somehow corrupted (failed migration, manual edit),
 * we return null and surface a recovery UI on the edit page.
 */
export async function getResume(
  resumeId: string,
  userId: string
): Promise<{ resume: Resume; data: ResumeData } | null> {
  const [row] = await db
    .select()
    .from(resumes)
    .where(and(eq(resumes.id, resumeId), eq(resumes.userId, userId)))
    .limit(1);

  if (!row) return null;

  const data = await getCurrentRevisionData(row);
  if (!data) return null;

  return { resume: row, data };
}

/**
 * Fetch just the current revision data for a resume (assumes ownership already
 * checked). Used internally by `getResume` and exposed for the edit page
 * after we've authorized.
 */
export async function getCurrentRevisionData(
  resume: Pick<Resume, 'currentRevisionId'>
): Promise<ResumeData | null> {
  if (!resume.currentRevisionId) return null;

  const [rev] = await db
    .select()
    .from(resumeRevisions)
    .where(eq(resumeRevisions.id, resume.currentRevisionId))
    .limit(1);

  if (!rev) return null;

  // Belt-and-suspenders: even though we type the column as ResumeData, the
  // JSONB could be stale from a prior schema version. Re-validate on read.
  const parsed = resumeDataSchema.safeParse(rev.data);
  if (!parsed.success) {
    console.error(
      `[resumes] revision ${rev.id} failed validation:`,
      parsed.error.flatten()
    );
    return null;
  }
  return parsed.data;
}

/**
 * Create a master resume + its first revision in a single transaction.
 *
 * Always creates a `draft` master. Variants are created separately via
 * `createVariant` so we never accidentally produce an orphan variant.
 */
export async function createMasterResume(
  userId: string,
  name: string
): Promise<Resume> {
  const data = blankResumeData();
  // Honor the requested name; otherwise keep the blank default.
  if (name.trim()) data.name = name.trim();

  return db.transaction(async (tx) => {
    const resumeId = crypto.randomUUID();
    const revisionId = crypto.randomUUID();

    await tx.insert(resumeRevisions).values({
      id: revisionId,
      resumeId,
      data
    });

    const [created] = await tx
      .insert(resumes)
      .values({
        id: resumeId,
        userId,
        name: data.name,
        isMaster: true,
        parentResumeId: null,
        currentRevisionId: revisionId,
        status: 'draft',
        template: data.template
      })
      .returning();

    if (!created) throw new Error('Failed to create master resume');
    return created;
  });
}

/**
 * Create a variant of a master resume. The variant starts as a deep copy of
 * the master's current data so the user can tweak without losing the source.
 *
 * Phase 3 will pass an optional `jobContext` when tailoring to a JD.
 */
export async function createVariant(
  userId: string,
  parentResumeId: string,
  options?: { jobContext?: ResumeData['jobContext'] }
): Promise<Resume | null> {
  const master = await getResume(parentResumeId, userId);
  if (!master) return null;

  return db.transaction(async (tx) => {
    const variantId = crypto.randomUUID();
    const revisionId = crypto.randomUUID();

    const variantData: ResumeData = {
      ...structuredClone(master.data),
      // Default the variant's name to "<Master name> — Variant" so it's
      // obvious in the list. The user can rename after creation.
      name: `${master.data.name} — Variant`,
      ...(options?.jobContext !== undefined
        ? { jobContext: options.jobContext }
        : {})
    };

    await tx.insert(resumeRevisions).values({
      id: revisionId,
      resumeId: variantId,
      data: variantData
    });

    const [created] = await tx
      .insert(resumes)
      .values({
        id: variantId,
        userId,
        name: variantData.name,
        isMaster: false,
        parentResumeId: master.resume.id,
        currentRevisionId: revisionId,
        status: 'draft',
        template: variantData.template,
        note: variantData.note
      })
      .returning();

    return created ?? null;
  });
}

/**
 * Save a new revision for a resume. Validates the data with the Zod schema
 * (server-side, never trust the client) and bumps `currentRevisionId`.
 *
 * Returns the new revision on success. Throws on validation failure so the
 * calling Server Action can surface a structured error.
 */
export async function saveResumeRevision(
  resumeId: string,
  userId: string,
  rawData: unknown,
  options?: { message?: string }
): Promise<ResumeRevision> {
  // Validate BEFORE touching the DB — fail fast on bad input.
  const parsed = resumeDataSchema.parse(rawData);

  // Ownership check (also covers the resume-existing case).
  const [row] = await db
    .select({ id: resumes.id })
    .from(resumes)
    .where(and(eq(resumes.id, resumeId), eq(resumes.userId, userId)))
    .limit(1);

  if (!row) {
    throw new Error(`Resume ${resumeId} not found or not owned by user`);
  }

  return db.transaction(async (tx) => {
    const revisionId = crypto.randomUUID();

    const [rev] = await tx
      .insert(resumeRevisions)
      .values({
        id: revisionId,
        resumeId,
        data: parsed,
        message: options?.message ?? null
      })
      .returning();

    if (!rev) throw new Error('Failed to insert revision');

    await tx
      .update(resumes)
      .set({
        currentRevisionId: revisionId,
        name: parsed.name,
        note: parsed.note,
        status: parsed.status,
        template: parsed.template,
        updatedAt: new Date()
      })
      .where(eq(resumes.id, resumeId));

    return rev;
  });
}

/**
 * Restore a resume to a previous revision. Reads the target revision, inserts
 * a NEW revision with its data (preserving append-only history), and bumps
 * `currentRevisionId`.
 */
export async function restoreRevision(
  resumeId: string,
  userId: string,
  targetRevisionId: string,
  message = 'Restored from previous revision'
): Promise<ResumeRevision | null> {
  const [target] = await db
    .select()
    .from(resumeRevisions)
    .where(
      and(
        eq(resumeRevisions.id, targetRevisionId),
        eq(resumeRevisions.resumeId, resumeId)
      )
    )
    .limit(1);

  if (!target) return null;

  // Re-validate the target's data before restoring — if it's corrupted, bail.
  const parsed = resumeDataSchema.safeParse(target.data);
  if (!parsed.success) return null;

  return saveResumeRevision(resumeId, userId, parsed.data, { message });
}

/**
 * List past revisions for a resume (most recent first). Excludes the JSONB
 * blob for the list view — only metadata. Caller can fetch the full data
 * per row if needed (e.g., for a "preview this revision" hover).
 */
export async function listRevisions(
  resumeId: string,
  userId: string
): Promise<
  Array<Pick<ResumeRevision, 'id' | 'message' | 'createdAt'>>
> {
  // Ownership check via the resumes table.
  const [owns] = await db
    .select({ id: resumes.id })
    .from(resumes)
    .where(and(eq(resumes.id, resumeId), eq(resumes.userId, userId)))
    .limit(1);
  if (!owns) return [];

  return db
    .select({
      id: resumeRevisions.id,
      message: resumeRevisions.message,
      createdAt: resumeRevisions.createdAt
    })
    .from(resumeRevisions)
    .where(eq(resumeRevisions.resumeId, resumeId))
    .orderBy(desc(resumeRevisions.createdAt));
}

/**
 * Hard-delete a resume + cascade its revisions. Variants are also deleted
 * (the parent-resumeId FK is plain — no ON DELETE behavior — so we cascade
 * manually for clarity).
 *
 * Returns true on success, false if the resume didn't exist or wasn't owned.
 */
export async function deleteResume(
  resumeId: string,
  userId: string
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ id: resumes.id })
      .from(resumes)
      .where(and(eq(resumes.id, resumeId), eq(resumes.userId, userId)))
      .limit(1);
    if (!row) return false;

    // Variants first (they reference this resume via parentResumeId, no CASCADE).
    await tx
      .delete(resumes)
      .where(and(eq(resumes.parentResumeId, resumeId), eq(resumes.userId, userId)));

    // Then the resume itself — this CASCADEs to resume_revisions.
    await tx.delete(resumes).where(eq(resumes.id, resumeId));

    return true;
  });
}

/**
 * Count a user's master resumes. Used to enforce a "one master per user" rule
 * (or, more permissively, to surface a "you already have a master" warning).
 *
 * For Phase 1 we don't enforce the rule — multiple masters are fine. This
 * helper exists so the UI can show "Add another master resume?" affordance
 * only when relevant.
 */
export async function countMasterResumes(userId: string): Promise<number> {
  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(resumes)
    .where(and(eq(resumes.userId, userId), eq(resumes.isMaster, true)));
  return result?.count ?? 0;
}