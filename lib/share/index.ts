/**
 * Public shareable links for resumes.
 *
 * Flow:
 *   1. Owner clicks "Share" in the editor → enableShareAction()
 *   2. The action derives a deterministic token from the resume
 *      id (HMAC), stores it in `resumes.share_token`, and sets
 *      `shareEnabled = true`
 *   3. The action returns the full URL to the UI
 *   4. Owner copies the URL; anyone with the URL can view the
 *      rendered resume at `/r/{token}`
 *   5. To revoke, owner clicks "Stop sharing" → disableShareAction()
 *   6. To re-enable, owner clicks "Enable sharing" — same URL,
 *      because the token is a pure function of the resume id
 *      and the server secret
 *
 * Security model:
 *   - The token is `HMAC-SHA256(SHARE_LINK_SECRET, resume_id)`,
 *     truncated to 16 bytes and base64url-encoded (~22 chars).
 *   - The HMAC key lives in the environment, not the database,
 *     so a leaked DB dump yields no usable URLs — the same
 *     property the prior hash-only design gave us, with simpler
 *     code and a recoverable URL for the owner.
 *   - Public renders are no-auth, noindex, no-referrer.
 *   - Rate-limit hooks (Vercel) gate the public route at the edge.
 *
 * Migration from the previous (random-token + ciphertext) design:
 * see `lib/share/token-crypto.ts` (left as a deprecated shim so
 * any leftover import surfaces as a clear stack trace) and the
 * drift memo.
 */

export {
  deriveShareToken,
  shareLinkSecretConfigured
} from './deterministic-token';
export {
  buildShareUrl,
  looksLikeDeterministicShareToken
} from './token';
