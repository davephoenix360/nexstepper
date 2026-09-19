# 0003 — Use `db:generate` + `db:migrate` (not `db:push`)

## Context

Drizzle Kit ships **two mutually-exclusive dev workflows** for
applying schema changes. Mixing them gets the dev DB into a state
that's hard to reconcile.

| Command | What it does | Audit trail? |
|---|---|---|
| `pnpm db:push` | Syncs schema → DB directly. No files, no history. | **No.** |
| `pnpm db:generate` + `pnpm db:migrate` | Generates numbered `.sql` files in `lib/db/migrations/`, applies them in order, tracks them in `__drizzle_migrations`. | **Yes.** Replayable, version-controlled. |

On 2026-09-18 we hit the failure mode: the share-link columns from
migration `0003_common_blizzard.sql` were missing from the dev DB.
The prior session had been using `db:push` to iterate on the schema,
so the columns existed in the DB but not in the migration journal.
When the next session ran `pnpm db:migrate`, it correctly tried to
apply migration `0003` again — but Drizzle's hash check said "this
migration is already applied" and skipped it. End result: the SQL in
`0003` was never executed, and the columns were never created.

We also hit a known drizzle-kit bug on the way: `db:push` on Postgres
18 fails with `column "id" is in a primary key` (code 42P16) on tables
with NOT NULL PK columns. Fixed in drizzle-kit 0.31.7; we were on
0.30.4.

## Decision

**`db:push` was removed** from `package.json` on 2026-09-18. The
script no longer exists, so a future session can't accidentally
invoke it. If anyone feels tempted to call `pnpm exec drizzle-kit
push` directly, AGENTS.md Phase handoff calls out the same
foot-gun.

The canonical dev workflow from here on:

```bash
# 1. Edit lib/db/schema.ts
# 2. Generate a numbered migration from the diff
pnpm db:generate
# 3. Inspect the .sql file in lib/db/migrations/, commit it
# 4. Apply
pnpm db:migrate
```

The reconciliation script `scripts/sync-pending-migrations.mjs`
exists for the one-off recovery: it computes the SHA-256 hash of
each migration, inserts a row in `__drizzle_migrations`, and runs
the SQL for any migration that's marked-applied-but-not-actually-applied
(like our 0003 case). Idempotent — safe to re-run.

## Consequences

**Good:**

- Every schema change is a versioned, reviewable SQL file in
  `lib/db/migrations/`. We can git-blame a column addition.
- `pnpm db:migrate` on a fresh DB produces the same final state as
  `pnpm db:push` would, deterministically.
- No more "why are the columns missing in dev but in prod?" drift.
- Sync script is a one-line `node scripts/sync-pending-migrations.mjs`
  away when we have to reconcile history.

**Bad:**

- `db:generate` doesn't always name columns the way you'd write them
  by hand. We may end up with a few ugly-but-correct migration files.
  Acceptable for the audit-trail gain.
- The reconciliation script is custom and undocumented in Drizzle's
  docs. If someone new joins, they'll need a pointer to it. AGENTS.md
  Phase handoff has the pointer; this ADR is the second copy.

## Alternatives considered

- **Keep `db:push` and document it as "dev only, never for prod".**
  The original plan. Rejected because the failure mode is silent:
  dev DB has columns that aren't in the migration journal, and you
  find out only when you try to `migrate` later.
- **Switch to Prisma.** Prisma's migrate story is similar to Drizzle's
  `generate` + `migrate`, and Prisma Migrate's drift detection is
  actually better. Rejected because the rebuild plan locked Drizzle
  in and we like the SQL-first ergonomics.
- **Hand-write SQL migrations.** Tempting but defeats the purpose of
  having a schema file as the source of truth. We use `db:generate`
  to author them, then edit by hand only when Drizzle's output is
  wrong.

## Related tooling

- `drizzle.config.ts` — points at `lib/db/schema.ts` as the source
  of truth and `lib/db/migrations/` as the output directory.
- `lib/db/migrations/meta/_journal.json` — the journal Drizzle writes
  per `db:generate`. **Commit this.** It tracks the SHA-256 hash
  chain that the migration runner depends on.
