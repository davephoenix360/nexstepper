import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guards two migration hazards this repo has actually hit.
 *
 * 1. The Drizzle snapshot chain was BROKEN: `0011_snapshot.json` had
 *    been copy-pasted from `0010_snapshot.json` with the same `id`, so
 *    `drizzle-kit generate` refused to run at all ("pointing to a parent
 *    snapshot: ... which is a collision"). Migrations still applied —
 *    because `drizzle-kit migrate` reads the JOURNAL, not the snapshots —
 *    which is exactly how it went unnoticed.
 *
 * 2. The schema and the DATABASE disagreed about `resumes_share_token_idx`.
 *    The DB had it UNIQUE + partial; schema.ts declared a plain index,
 *    on the belief that drizzle's index builder "doesn't expose
 *    `.where()`". It does. The consequence was that the next
 *    `db:generate` produced a migration which DROPPED the unique partial
 *    index and replaced it with a plain one — silently discarding the
 *    uniqueness guarantee on the public share token, in a migration
 *    nobody would read closely.
 *
 * Both are source-level assertions because the failure modes are
 * invisible at runtime until a migration has already run.
 */

const SCHEMA = readFileSync(resolve(process.cwd(), 'lib/db/schema.ts'), 'utf8');
const JOURNAL = JSON.parse(
  readFileSync(
    resolve(process.cwd(), 'lib/db/migrations/meta/_journal.json'),
    'utf8'
  )
);

describe('the migration snapshot chain is intact', () => {
  // Snapshot files are numbered by INDEX (`0012_snapshot.json`), not by
  // the journal's tag (`0012_plain_omega_flight`). The tag is the .sql
  // filename; the snapshot drops the random suffix.
  const snapshotPath = (entry: { idx: number }) =>
    resolve(
      process.cwd(),
      `lib/db/migrations/meta/${String(entry.idx).padStart(4, '0')}_snapshot.json`
    );

  it('every snapshot has a unique id', () => {
    const ids = JOURNAL.entries.map((e: { tag: string }) => e.tag);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every snapshot file exists for its journal entry', () => {
    for (const entry of JOURNAL.entries) {
      expect(
        () => readFileSync(snapshotPath(entry), 'utf8'),
        entry.tag
      ).not.toThrow();
    }
  });

  it('no two snapshots share an id', () => {
    const ids: string[] = [];
    for (const entry of JOURNAL.entries) {
      const snap = JSON.parse(readFileSync(snapshotPath(entry), 'utf8'));
      ids.push(snap.id);
    }
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('the schema matches the database on the share-token index', () => {
  it('declares resumes_share_token_idx as a UNIQUE index', () => {
    // A plain `index(...)` here is what produced the destructive
    // migration. It must be `uniqueIndex(...)`.
    expect(SCHEMA).toMatch(
      /uniqueIndex\(\s*'resumes_share_token_idx'\s*\)/
    );
  });

  it('keeps the partial predicate', () => {
    expect(SCHEMA).toMatch(/resumes_share_token_idx[\s\S]{0,200}\.where\(/);
  });
});

describe('resume_analyses is declared the way the migration creates it', () => {
  it('has the unique index the upsert depends on', () => {
    expect(SCHEMA).toMatch(
      /uniqueIndex\(\s*'resume_analyses_resume_jd_uniq'\s*\)/
    );
  });

  it('is keyed on resume + jd hash', () => {
    expect(SCHEMA).toMatch(
      /uniqueIndex\('resume_analyses_resume_jd_uniq'\)[\s\S]{0,120}table\.resumeId[\s\S]{0,80}table\.jdHash/
    );
  });
});
