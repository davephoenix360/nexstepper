import { headers } from 'next/headers';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from './drizzle';
import {
  applications,
  resumes,
  resumeRevisions,
  resumeVariants,
  subscriptions,
  user,
  type Application,
  type Resume,
  type ResumeRevision,
  type ResumeVariant,
  type Subscription,
  type User
} from './schema';
import { auth } from '@/lib/auth';
import {
  blankResumeData,
  resumeDataSchema,
  type ResumeData,
  type ResumeSections
} from '@/lib/resume-schema';
import { parsedJdSchema, type ParsedJd } from '@/lib/jd-parser';

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

  // Auto-create a free-tier row so downstream code can always read one.
  // ON CONFLICT DO NOTHING keeps this safe under concurrent renders
  // (Next.js dev double-render, layout + page Promise.all, parallel page
  // navigation hits): whichever request loses the race re-selects the row
  // that won, instead of throwing a unique-constraint violation.
  const [created] = await db
    .insert(subscriptions)
    .values({ id: crypto.randomUUID(), userId: u.id, plan: 'free', status: 'inactive' })
    .onConflictDoNothing({ target: subscriptions.userId })
    .returning();

  if (created) return created;

  // A concurrent request inserted it first — fetch the row they wrote.
  const [existing] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, u.id))
    .limit(1);

  return existing ?? makeFreeSubscription(u.id);
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
 *
 * Pass `sections` to seed the first revision with imported / AI-parsed
 * content (used by the resume import flow). Without `sections` the
 * first revision is a `blankResumeData()` envelope — the create-from-
 * scratch path.
 */
export async function createMasterResume(
  userId: string,
  name: string,
  sections?: ResumeSections
): Promise<Resume> {
  const data = blankResumeData();
  // Honor the requested name; otherwise keep the blank default.
  if (name.trim()) data.name = name.trim();
  // Seed the first revision with caller-provided sections when given.
  if (sections) data.sections = sections;

  return db.transaction(async (tx) => {
    const resumeId = crypto.randomUUID();
    const revisionId = crypto.randomUUID();

    // Insert the parent row BEFORE the child. Postgres checks FKs
    // immediately by default (NOT DEFERRABLE), so the resume_revisions
    // insert trips the resume_id FK if we try it the other way around.
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

    await tx.insert(resumeRevisions).values({
      id: revisionId,
      resumeId,
      data
    });

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

    // Parent first, child second — same FK ordering as createMasterResume.
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

    if (!created) return null;

    await tx.insert(resumeRevisions).values({
      id: revisionId,
      resumeId: variantId,
      data: variantData
    });

    return created;
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

// ─── Share-link queries (Phase 2.5) ─────────────────────────────────────────

/**
 * A shareable-link summary — the bits the owner UI needs to show
 * "Sharing is on, X views" / "Generate new link" / "Stop sharing".
 *
 * Deliberately omits the token hash (it would be useless to the
 * client) and the raw token (only the action ever sees that).
 */
export type ShareStatus = {
  enabled: boolean;
  viewCount: number;
  lastViewedAt: Date | null;
  createdAt: Date | null;
  /** The token hash. The client should never need this, but the
   *  action uses it to build the public URL after generation. */
  tokenHash: string | null;
};

/**
 * Read the share status for a resume. Ownership-checked. Returns
 * null if the resume doesn't exist OR isn't owned by this user
 * (don't leak existence to non-owners).
 */
export async function getShareStatus(
  resumeId: string,
  userId: string
): Promise<ShareStatus | null> {
  const [row] = await db
    .select({
      shareEnabled: resumes.shareEnabled,
      shareViewCount: resumes.shareViewCount,
      shareLastViewedAt: resumes.shareLastViewedAt,
      shareCreatedAt: resumes.shareCreatedAt,
      shareTokenHash: resumes.shareTokenHash
    })
    .from(resumes)
    .where(and(eq(resumes.id, resumeId), eq(resumes.userId, userId)))
    .limit(1);

  if (!row) return null;

  return {
    enabled: row.shareEnabled,
    viewCount: row.shareViewCount,
    lastViewedAt: row.shareLastViewedAt,
    createdAt: row.shareCreatedAt,
    tokenHash: row.shareTokenHash
  };
}

/**
 * Enable sharing on a resume. Stores the (already-hashed) token +
 * flips `shareEnabled` to true + stamps `shareCreatedAt`. The caller
 * (Server Action) generates the raw token, gives it to the user,
 * and passes the hash here.
 *
 * Returns true on success, false if the resume doesn't exist or
 * isn't owned by this user.
 */
export async function enableShare(
  resumeId: string,
  userId: string,
  tokenHash: string
): Promise<boolean> {
  const result = await db
    .update(resumes)
    .set({
      shareTokenHash: tokenHash,
      shareEnabled: true,
      // First-time enable. We deliberately don't reset viewCount —
      // re-enable after a disable preserves the running total so the
      // owner can see how popular the resume has been over time.
      shareCreatedAt: new Date(),
      shareLastViewedAt: null,
      updatedAt: new Date()
    })
    .where(and(eq(resumes.id, resumeId), eq(resumes.userId, userId)))
    .returning({ id: resumes.id });

  return result.length > 0;
}

/**
 * Disable sharing on a resume. Anyone with the existing URL gets
 * 404 from now on. We KEEP the token hash so rotation can reuse the
 * same row state; if the user re-enables we generate a fresh token
 * anyway (the old one is dead).
 *
 * Returns true on success, false if not found / not owned.
 */
export async function disableShare(
  resumeId: string,
  userId: string
): Promise<boolean> {
  const result = await db
    .update(resumes)
    .set({
      shareEnabled: false,
      updatedAt: new Date()
    })
    .where(and(eq(resumes.id, resumeId), eq(resumes.userId, userId)))
    .returning({ id: resumes.id });

  return result.length > 0;
}

/**
 * Rotate the share token. Generates a new hash, replaces the old,
 * keeps `shareEnabled = true` and the existing viewCount. The old
 * URL immediately stops working.
 */
export async function rotateShareToken(
  resumeId: string,
  userId: string,
  newTokenHash: string
): Promise<boolean> {
  const result = await db
    .update(resumes)
    .set({
      shareTokenHash: newTokenHash,
      // New URL = reset the "first shared" timestamp so the UI shows
      // the new creation date. viewCount is preserved (lifetime stat).
      shareCreatedAt: new Date(),
      shareLastViewedAt: null,
      updatedAt: new Date()
    })
    .where(
      and(
        eq(resumes.id, resumeId),
        eq(resumes.userId, userId),
        eq(resumes.shareEnabled, true)
      )
    )
    .returning({ id: resumes.id });

  return result.length > 0;
}

/**
 * Look up a resume by its share token. No auth — the URL is the
 * capability. Returns null if:
 *   - The token doesn't match any hash
 *   - Sharing is disabled (shareEnabled = false)
 *
 * Does NOT validate the JSONB revision data here — the route handler
 * does that as a defense-in-depth check before rendering.
 */
export async function getResumeByShareToken(tokenHash: string): Promise<{
  resume: Resume;
  data: ResumeData;
} | null> {
  const [row] = await db
    .select()
    .from(resumes)
    .where(
      and(
        eq(resumes.shareTokenHash, tokenHash),
        eq(resumes.shareEnabled, true)
      )
    )
    .limit(1);

  if (!row) return null;

  const data = await getCurrentRevisionData(row);
  if (!data) return null;

  return { resume: row, data };
}

/**
 * Increment the view counter + stamp the last-viewed timestamp. Best-
 * effort — we don't fail the render if the increment fails. The
 * `fire-and-forget` semantics are intentional: the public route
 * already returned the HTML by the time this runs.
 *
 * Race conditions are fine — two concurrent viewers incrementing to
 * the same value is a non-event (the counter is a stat, not a
 * billing signal).
 */
export async function recordShareView(resumeId: string): Promise<void> {
  try {
    await db
      .update(resumes)
      .set({
        shareViewCount: sql`${resumes.shareViewCount} + 1`,
        shareLastViewedAt: new Date()
      })
      .where(eq(resumes.id, resumeId));
  } catch (err) {
    // Log + swallow. The public render already succeeded.
    console.error('[recordShareView] failed:', err);
  }
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

// ─── Application queries (Phase 2.4a) ───────────────────────────────────────

/**
 * A single Application + its validated ParsedJd shape.
 *
 * `jdParsed` is re-validated on every read (the JSONB could be stale
 * from a prior schema version). If validation fails we log + return
 * null so the caller can surface a "re-parse this application" UI
 * instead of crashing.
 */
export type ApplicationWithParsed = {
  application: Application;
  jdParsed: ParsedJd;
};

/**
 * List a user's applications, most recent first. Excludes the heavy
 * jdText + jdParsed columns for the list view — caller fetches the
 * detail row when it needs the full JD.
 */
export async function listApplications(
  userId: string
): Promise<Array<Omit<Application, 'jdText' | 'jdParsed'>>> {
  return db
    .select({
      id: applications.id,
      userId: applications.userId,
      jobTitle: applications.jobTitle,
      company: applications.company,
      sourceUrl: applications.sourceUrl,
      sourceBoard: applications.sourceBoard,
      status: applications.status,
      appliedAt: applications.appliedAt,
      notes: applications.notes,
      createdAt: applications.createdAt,
      updatedAt: applications.updatedAt
    })
    .from(applications)
    .where(eq(applications.userId, userId))
    .orderBy(desc(applications.createdAt));
}

/**
 * Get a single application + its validated parsed shape. Returns null
 * if the application doesn't exist OR isn't owned by the given user
 * (don't leak existence to non-owners).
 */
export async function getApplication(
  applicationId: string,
  userId: string
): Promise<ApplicationWithParsed | null> {
  const [row] = await db
    .select()
    .from(applications)
    .where(
      and(
        eq(applications.id, applicationId),
        eq(applications.userId, userId)
      )
    )
    .limit(1);

  if (!row) return null;

  // Re-validate the parsed shape (defense in depth — a prior schema
  // version may have stored an incompatible shape).
  const parsed = parsedJdSchema.safeParse(row.jdParsed);
  if (!parsed.success) {
    console.error(
      `[applications] row ${row.id} jd_parsed failed validation:`,
      parsed.error.flatten()
    );
    return null;
  }

  return { application: row, jdParsed: parsed.data };
}

/**
 * Create an Application row. The caller is responsible for parsing
 * the JD first (via `parseJd()`) and passing the validated shape in.
 *
 * Returns the new row id. Throws on DB failure (the caller's
 * Server Action should catch + surface as `ai_failure` or similar).
 */
export async function createApplication(
  userId: string,
  input: {
    jobTitle: string;
    company?: string | null;
    jdText: string;
    jdParsed: ParsedJd;
    sourceUrl?: string | null;
    sourceBoard?: string | null;
    notes?: string;
  }
): Promise<{ id: string }> {
  const id = crypto.randomUUID();
  await db.insert(applications).values({
    id,
    userId,
    jobTitle: input.jobTitle,
    company: input.company ?? null,
    jdText: input.jdText,
    jdParsed: input.jdParsed,
    sourceUrl: input.sourceUrl ?? null,
    sourceBoard: input.sourceBoard ?? null,
    notes: input.notes ?? ''
  });
  return { id };
}

/**
 * Update an Application. All fields are optional (PATCH semantics);
 * `status` and `appliedAt` get special handling — when status moves
 * to 'applied' we auto-set appliedAt unless the caller passes one.
 *
 * Returns true on success, false if the row didn't exist or wasn't
 * owned by the user.
 */
export async function updateApplication(
  applicationId: string,
  userId: string,
  patch: {
    jobTitle?: string;
    company?: string | null;
    jdText?: string;
    jdParsed?: ParsedJd;
    sourceUrl?: string | null;
    sourceBoard?: string | null;
    status?: string;
    appliedAt?: Date | null;
    notes?: string;
  }
): Promise<boolean> {
  // Ownership check + read the current row in one query.
  const [existing] = await db
    .select({
      id: applications.id,
      status: applications.status,
      appliedAt: applications.appliedAt
    })
    .from(applications)
    .where(
      and(
        eq(applications.id, applicationId),
        eq(applications.userId, userId)
      )
    )
    .limit(1);
  if (!existing) return false;

  // Build the update payload, dropping undefined fields so Drizzle
  // doesn't try to set columns to undefined.
  const updates: Partial<typeof applications.$inferInsert> = {
    updatedAt: new Date()
  };
  if (patch.jobTitle !== undefined) updates.jobTitle = patch.jobTitle;
  if (patch.company !== undefined) updates.company = patch.company;
  if (patch.jdText !== undefined) updates.jdText = patch.jdText;
  if (patch.jdParsed !== undefined) updates.jdParsed = patch.jdParsed;
  if (patch.sourceUrl !== undefined) updates.sourceUrl = patch.sourceUrl;
  if (patch.sourceBoard !== undefined)
    updates.sourceBoard = patch.sourceBoard;
  if (patch.notes !== undefined) updates.notes = patch.notes;
  if (patch.status !== undefined) {
    updates.status = patch.status;
    // Auto-set appliedAt the first time status moves to 'applied'.
    if (patch.status === 'applied' && !existing.appliedAt) {
      updates.appliedAt = patch.appliedAt ?? new Date();
    }
  }
  if (patch.appliedAt !== undefined) updates.appliedAt = patch.appliedAt;

  await db
    .update(applications)
    .set(updates)
    .where(
      and(
        eq(applications.id, applicationId),
        eq(applications.userId, userId)
      )
    );

  return true;
}

/**
 * Hard-delete an Application. Cascades to resumeVariants (the variants
 * aren't useful without the JD they were tailored for).
 *
 * Returns true on success, false if the row didn't exist or wasn't owned.
 */
export async function deleteApplication(
  applicationId: string,
  userId: string
): Promise<boolean> {
  const [row] = await db
    .select({ id: applications.id })
    .from(applications)
    .where(
      and(
        eq(applications.id, applicationId),
        eq(applications.userId, userId)
      )
    )
    .limit(1);
  if (!row) return false;

  // resumeVariants cascades via FK. So one delete is enough.
  await db.delete(applications).where(eq(applications.id, applicationId));
  return true;
}

// ─── Resume-variant queries (Phase 2.4a) ────────────────────────────────────

/**
 * The structured breakdown of an Optimize score. The full score
 * (0-100 headline) lives on `matchScore`; this is the per-axis
 * breakdown the UI shows when the user clicks for details.
 *
 * Mirrors the contract `lib/optimize/` will write when it runs. We
 * keep the breakdown shape loose here (`unknown` JSONB) so the
 * Optimize tool can evolve the axes without a migration.
 */
export type MatchBreakdown = unknown;

/**
 * List the resume variants for an Application, most recent first.
 * Variants are the tailored resume snapshots the AI produced for
 * this JD. The UI uses this for the Application detail page's
 * "Variants" tab.
 *
 * Ownership: caller must have already checked the Application
 * belongs to the user; the resume_variants table has no userId
 * column (ownership is via the Application).
 */
export async function listResumeVariants(
  applicationId: string
): Promise<ResumeVariant[]> {
  return db
    .select()
    .from(resumeVariants)
    .where(eq(resumeVariants.applicationId, applicationId))
    .orderBy(desc(resumeVariants.createdAt));
}

/**
 * Create a resume variant (Application × tailored resume link + score).
 * The actual tailored resume data lives in `resumes` + `resume_revisions`
 * — this is just the join + the score.
 */
export async function createResumeVariant(
  applicationId: string,
  resumeId: string,
  score: number,
  breakdown: MatchBreakdown,
  tailoringNotes = ''
): Promise<{ id: string }> {
  const id = crypto.randomUUID();
  await db.insert(resumeVariants).values({
    id,
    applicationId,
    resumeId,
    matchScore: score,
    matchBreakdown: breakdown,
    tailoringNotes
  });
  return { id };
}