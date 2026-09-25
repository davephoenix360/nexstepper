'use server';

import 'server-only';

import { headers } from 'next/headers';

import { auth } from '@/lib/auth';
import { getUserExportBundle } from '@/lib/db/queries';
import {
  EXPORT_SCHEMA_VERSION,
  STANDARD_EXPORT_NOTES,
  exportBundleSchema,
  type ExportBundle
} from './schema';

/**
 * `exportUserData` — server action that produces a JSON bundle
 * satisfying GDPR Art. 20 (right to data portability).
 *
 * The bundle is the user's portable copy of everything Nextep holds
 * about them. Format: JSON (EDPB explicitly cites JSON as a suitable
 * format — see `lib/data-rights/schema.ts` for the rationale).
 *
 * Implementation notes:
 *
 *   - Server-authoritative. The client just calls this and gets back
 *     a JSON string. No streaming; the entire bundle fits in a single
 *     JSON object for any realistic user (even 10k chat messages is
 *     well under 1 MB). If a future user crosses that threshold,
 *     switch to a streamed archive.
 *
 *   - Auth via the existing `auth.api.getSession`. The bundle is
 *     scoped to the session's user — there's no admin override.
 *
 *   - Validated against `exportBundleSchema` before returning. If
 *     the schema rejects the shape (e.g. someone added a `password`
 *     column to the user table later), the action throws instead of
 *     silently leaking.
 *
 *   - The action returns a string (JSON). The client (dashboard
 *     security page) wraps it in a `Blob` and downloads it as
 *     `nextep-export-<userId>-<iso-date>.json`.
 */

export type ExportUserInput = void;
export type ExportUserResult =
  | { ok: true; json: string; filename: string }
  | { ok: false; error: string };

export async function exportUserData(): Promise<ExportUserResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { ok: false, error: 'Not authenticated.' };
  }
  const userId = session.user.id;

  const raw = await getUserExportBundle(userId);

  if (!raw.user) {
    // The session says we're logged in but the user row is gone —
    // probably a concurrent delete. Treat as not-authenticated.
    return { ok: false, error: 'User not found.' };
  }

  // ── Map raw rows → bundle shape ────────────────────────────────────────────
  const bundle: ExportBundle = {
    exportedAt: new Date().toISOString(),
    schemaVersion: EXPORT_SCHEMA_VERSION,
    notes: [...STANDARD_EXPORT_NOTES],
    user: {
      id: raw.user.id,
      name: raw.user.name,
      email: raw.user.email,
      emailVerified: raw.user.emailVerified,
      createdAt: raw.user.createdAt.toISOString(),
      updatedAt: raw.user.updatedAt.toISOString()
    },
    subscriptions: raw.subscriptions.map((s) => ({
      id: s.id,
      plan: s.plan,
      status: s.status,
      currentPeriodEnd: s.currentPeriodEnd?.toISOString() ?? null,
      stripeCustomerId: s.stripeCustomerId,
      stripeSubscriptionId: s.stripeSubscriptionId,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString()
    })),
    resumes: raw.resumes.map((r) => ({
      id: r.id,
      kind: r.isMaster ? 'master' : 'variant',
      name: r.name,
      parentResumeId: r.parentResumeId,
      currentRevisionId: r.currentRevisionId,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      revisions: r.revisions.map((rev) => ({
        id: rev.id,
        data: rev.data,
        createdAt: rev.createdAt.toISOString()
      }))
    })),
    applications: raw.applications.map((a) => ({
      id: a.id,
      jobTitle: a.jobTitle,
      company: a.company,
      status: a.status,
      jdText: a.jdText,
      jdParsed: a.jdParsed,
      sourceUrl: a.sourceUrl,
      sourceBoard: a.sourceBoard,
      appliedAt: a.appliedAt?.toISOString() ?? null,
      notes: a.notes,
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString()
    })),
    scoreSnapshots: raw.scoreSnapshots.map((s) => ({
      id: s.id,
      resumeId: s.resumeId,
      matchScore: s.matchScore,
      matchBreakdown: s.matchBreakdown,
      dynamicTips: s.dynamicTips,
      computedInMs: s.computedInMs,
      createdAt: s.createdAt.toISOString()
    })),
    chatSessions: raw.chatSessions.map((s) => ({
      id: s.id,
      title: s.title,
      resumeId: s.resumeId,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
      messages: s.messages.map((m) => ({
        id: m.id,
        role: m.role as 'user' | 'assistant',
        content: m.content,
        toolCalls: m.toolCalls ?? null,
        toolResult: m.toolResult ?? null,
        createdAt: m.createdAt.toISOString()
      }))
    })),
    chatUsage: raw.chatUsage.map((u) => ({
      date: u.date,
      tokensUsed: u.tokensUsed,
      turnsUsed: u.turnsUsed
    })),
    shares: raw.shares.map((s) => ({
      resumeId: s.resumeId,
      resumeName: s.resumeName,
      shareViewCount: s.shareViewCount,
      shareLastViewedAt: s.shareLastViewedAt?.toISOString() ?? null,
      shareCreatedAt: s.shareCreatedAt?.toISOString() ?? null,
      tokenLastChars: null // // not exposing hashed token; revoke via UI
    }))
  };

  // ── Validate ────────────────────────────────────────────────────────────────
  const parsed = exportBundleSchema.safeParse(bundle);
  if (!parsed.success) {
    // A schema mismatch means we're about to leak something we shouldn't,
    // OR the schema drifted from the DB. Either way, refuse to return.
    return {
      ok: false,
      error: `Export bundle failed integrity check: ${parsed.error.message}`
    };
  }

  // ── Stringify + filename ───────────────────────────────────────────────────
  // JSON.stringify with 2-space indent so a human can `cat` the export.
  const json = JSON.stringify(parsed.data, null, 2);

  const isoDate = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const filename = `nextep-export-${userId.slice(0, 8)}-${isoDate}.json`;

  return { ok: true, json, filename };
}