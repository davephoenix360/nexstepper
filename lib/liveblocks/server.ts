import { Liveblocks } from '@liveblocks/node';

/**
 * Liveblocks server client. Used to mint auth tokens for the user's
 * collaborative sessions. Real collab lands in Phase 5; the import + env
 * wiring is in place now so we can flip it on without a refactor.
 *
 * Requires LIVEBLOCKS_SECRET_KEY (server) + NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY
 * (client).
 */
export const liveblocks = process.env.LIVEBLOCKS_SECRET_KEY
  ? new Liveblocks({ secret: process.env.LIVEBLOCKS_SECRET_KEY })
  : null;