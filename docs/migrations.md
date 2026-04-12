# Database Migrations

## Workflow

1. Edit schema files in `src/db/schema/`
2. Generate a migration: `npm run db:generate`
3. Review the generated SQL in `drizzle/` — confirm it does what you expect
4. Apply: `npm run db:migrate`
5. Commit both the schema change and the generated migration files together

## Commands

| Command | Description |
|---|---|
| `npm run db:generate` | Diff schema against snapshots and generate new SQL migration |
| `npm run db:migrate` | Apply all pending migrations to the database |
| `npm run db:studio` | Open Drizzle Studio at http://local.drizzle.studio |
| `npm run db:check` | Verify the migration snapshot matches current schema (CI-friendly) |

## For Existing Developers (Migration from drizzle-kit push)

If you previously used `drizzle-kit push` and already have a populated database, the migration history table will be empty even though your schema is up to date. Run this once to mark all existing migrations as applied without re-running them:

```bash
psql -U inhale -d inhale -f scripts/mark-migrations-applied.sql
```

After that, `npm run db:migrate` will only apply genuinely new migrations.

## Production Notes

Managed Postgres providers (Neon, Supabase, RDS, etc.) do not enable the `pgvector` extension by default. Before running your first migration on a new production database, connect as a superuser and run:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

Then run `npm run db:migrate` normally. The Docker local dev setup handles this automatically via `docker/initdb/01-extensions.sql`.

## Rules

- **Never use `drizzle-kit push`.** It applies schema changes directly without creating migration files, causing drift between your migration history and the actual database state. This breaks `db:migrate` for everyone else on the team and makes rollbacks impossible. It has been intentionally omitted from the scripts.
- **Always review generated SQL before committing.** Drizzle generates migrations from schema diffs — an accidental column rename can become a destructive `DROP COLUMN` + `ADD COLUMN`.
- **Keep `drizzle.config.ts` pointed at `src/db/schema/index.ts`.** All schema tables must be exported from the index so the generator sees the full picture.
- **Commit migration files alongside schema changes.** Never commit a schema edit without its corresponding migration file, and never commit a migration file without the schema change that produced it.
