import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Next.js 16 ships with stable Cache Components (`"use cache"` directive).
  // We opt in once we have a cacheable surface (Phase 1+ resumes list).
  // No experimental flags needed for Phase 0.
};

export default nextConfig;