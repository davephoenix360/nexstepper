import { describe, expect, it } from 'vitest';

import {
  EXPORT_SCHEMA_VERSION,
  STANDARD_EXPORT_NOTES,
  exportBundleSchema
} from '@/lib/data-rights/schema';

/**
 * The export bundle schema is the GDPR Art. 20 contract. If we ever
 * change the SHAPE (rename a field, tighten a type), that's a breaking
 * change for any user who has already downloaded a bundle. This test
 * pins the shape so we can't accidentally break it without bumping
 * `EXPORT_SCHEMA_VERSION`.
 */

const baseBundle = {
  exportedAt: '2026-09-24T12:00:00.000Z',
  schemaVersion: EXPORT_SCHEMA_VERSION,
  notes: [...STANDARD_EXPORT_NOTES],
  user: {
    id: 'usr_001',
    name: 'Alex',
    email: 'alex@example.com',
    emailVerified: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z'
  },
  subscriptions: [
    {
      id: 'sub_001',
      plan: 'pro',
      status: 'active',
      currentPeriodEnd: '2026-10-01T00:00:00.000Z',
      stripeCustomerId: 'cus_123',
      stripeSubscriptionId: 'sub_456',
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z'
    }
  ],
  resumes: [],
  applications: [],
  scoreSnapshots: [],
  chatSessions: [],
  chatUsage: [{ date: '2026-09-24', tokensUsed: 1234, turnsUsed: 5 }],
  shares: [
    {
      resumeId: 'res_001',
      resumeName: 'Master',
      shareViewCount: 3,
      shareLastViewedAt: '2026-09-20T00:00:00.000Z',
      shareCreatedAt: '2026-09-15T00:00:00.000Z',
      tokenLastChars: null
    }
  ]
};

describe('exportBundleSchema', () => {
  it('accepts a minimal valid bundle', () => {
    const result = exportBundleSchema.safeParse(baseBundle);
    expect(result.success).toBe(true);
  });

  it('rejects a bundle with the wrong schemaVersion', () => {
    const result = exportBundleSchema.safeParse({
      ...baseBundle,
      // // 0.9.0 is a valid semver but not the version we ship.
      schemaVersion: '0.9.0'
    });
    expect(result.success).toBe(false);
  });

  it('rejects a bundle missing the notes array', () => {
    const { notes, ...withoutNotes } = baseBundle;
    void notes;
    const result = exportBundleSchema.safeParse(withoutNotes);
    expect(result.success).toBe(false);
  });

  it('rejects a user block missing required fields', () => {
    const result = exportBundleSchema.safeParse({
      ...baseBundle,
      user: { id: 'usr_001' }
    });
    expect(result.success).toBe(false);
  });

  it('rejects a chat message with the wrong role enum', () => {
    const result = exportBundleSchema.safeParse({
      ...baseBundle,
      chatSessions: [
        {
          id: 'ses_001',
          title: 'Tweak summary',
          resumeId: 'res_001',
          createdAt: '2026-09-24T12:00:00.000Z',
          updatedAt: '2026-09-24T12:00:00.000Z',
          messages: [
            {
              id: 'msg_001',
              role: 'system', // // not in our 'user' | 'assistant' enum
              content: 'hi',
              toolCalls: null,
              toolResult: null,
              createdAt: '2026-09-24T12:00:00.000Z'
            }
          ]
        }
      ]
    });
    expect(result.success).toBe(false);
  });

  it('rejects a resume whose kind is not master or variant', () => {
    const result = exportBundleSchema.safeParse({
      ...baseBundle,
      resumes: [
        {
          id: 'res_001',
          kind: 'cover_letter', // // not in our enum
          name: 'Master',
          parentResumeId: null,
          currentRevisionId: null,
          createdAt: '2026-09-24T12:00:00.000Z',
          updatedAt: '2026-09-24T12:00:00.000Z',
          revisions: []
        }
      ]
    });
    expect(result.success).toBe(false);
  });

  it('STANDARD_EXPORT_NOTES mentions every excluded category', () => {
    // // If someone removes an excluded category, this test fails and the
    // // _notes array needs updating in lock-step.
    const allText = STANDARD_EXPORT_NOTES.join(' ');
    expect(allText).toMatch(/stripe_events_processed/);
    expect(allText).toMatch(/access_token|refresh_token/);
    expect(allText).toMatch(/session/);
  });
});