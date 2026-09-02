/**
 * Public shareable links for resumes.
 *
 * Flow:
 *   1. Owner clicks "Share" in the editor → enableShareAction()
 *   2. Action generates a fresh token, hashes it, stores the hash +
 *      sets `shareEnabled = true` on the resume row
 *   3. Action returns the raw token + the full URL to the UI
 *   4. Owner copies the URL; anyone with the URL can view the
 *      rendered resume at `/r/{token}`
 *   5. To revoke, owner clicks "Stop sharing" → disableShareAction()
 *   6. To invalidate the existing URL (someone leaked it), owner
 *      clicks "Generate new link" → rotateShareTokenAction()
 *
 * Security model:
 *   - The token is 21 chars (126 bits) of CSPRNG entropy
 *   - The DB stores only the SHA-256 hash; a DB leak doesn't leak URLs
 *   - Public renders are no-auth, noindex, no-referrer
 *   - Rate-limit hooks (Vercel) gate the public route at the edge
 */

export {
  generateShareTokenRaw,
  hashShareToken,
  buildShareUrl,
  generateInternalSecret
} from './token';
