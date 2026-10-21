/**
 * @deprecated Superseded by `deterministic-token.ts` after the
 * Phase 2.5b share-token redesign. The new design stores the
 * deterministic token directly in `resumes.share_token` — there
 * is nothing reversible to encrypt. Existing call sites have been
 * migrated. Any leftover import here is a bug and will throw.
 *
 * Branch: `feat/deterministic-share-tokens`. See the drift memo
 * for the migration rationale. Removal is deferred so an
 * accidental import surfaces as a clear stack trace instead of
 * silently regressing to the old `unavailable` fallback path.
 */

export function encryptShareToken(): never {
  throw new Error(
    'encryptShareToken was removed in Phase 2.5b. The share token is now derived deterministically from the resume id — see lib/share/deterministic-token.ts.'
  );
}

export function decryptShareToken(): never {
  throw new Error(
    'decryptShareToken was removed in Phase 2.5b. The share token is now derived deterministically from the resume id — see lib/share/deterministic-token.ts.'
  );
}

export function shareTokenEncryptionAvailable(): boolean {
  return false;
}

export function tokenMatchesHash(): never {
  throw new Error(
    'tokenMatchesHash was removed in Phase 2.5b. The share token is now derived deterministically from the resume id — see lib/share/deterministic-token.ts.'
  );
}
