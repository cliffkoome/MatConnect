# Database migrations (Prisma + Neon)

`prisma/schema.prisma` is the source of truth for the database. Every change to it ships as a
committed, reviewed SQL migration in `prisma/migrations/`, and only CI applies migrations to
production. The rules below are enforced automatically where possible (see [Enforcement](#enforcement)).

## Connection strings

| Variable | Used by | Neon value |
| --- | --- | --- |
| `DATABASE_URL` | the app at runtime | **pooled** URL (host contains `-pooler`) |
| `DIRECT_URL` | Prisma CLI (`migrate`, `db`, `studio`, seed) | **direct** URL (no `-pooler`) |
| `SHADOW_DATABASE_URL` | `migrate dev` / drift checks, optional | a throwaway database or Neon branch |

Migrations need a direct session (advisory locks, DDL in one connection), which PgBouncer's
transaction pooling doesn't provide — so `prisma.config.ts` always gives the CLI `DIRECT_URL` when set.

## Everyday workflow

1. Work against **your own database**: a Neon branch (`dev/<your-name>`, branched from `main`) or a
   local Postgres. Never point `migrate dev` at a shared or production database.
2. Edit `prisma/schema.prisma`.
3. Generate the migration without applying it, so you can read it first:
   ```bash
   npm run db:migrate:create -- --name add_vehicle_colour
   ```
4. Review `prisma/migrations/<timestamp>_add_vehicle_colour/migration.sql`. Add anything Prisma can't
   express (CHECK constraints, data backfills, partial indexes) by hand, with a comment saying why.
5. Apply it locally and regenerate the client: `npm run db:migrate:dev`.
6. Run `npm run db:migrate:check` and the tests, then commit the schema **and** the migration together.

When you open the PR, CI applies the full migration history to a fresh Postgres, checks for drift and,
if Neon is configured, applies your new migrations to a copy of production data (see below).

## Rules

### R1 — Merged migrations are immutable
Never edit, rename or delete a migration that is on `main`. Prisma stores a checksum of every applied
migration; changing one makes `migrate deploy` fail or, worse, leaves environments silently different.
Fix mistakes with a **new** migration. (Editing a migration that only exists on your branch is fine.)

### R2 — Migrations apply in order
Folder names are `YYYYMMDDHHMMSS_snake_case_description` (UTC). A new migration must sort after
the latest one on `main`; if `main` moved on while your PR was open, rebase and regenerate yours
(delete your unmerged folder, `npm run db:migrate:create` again).

### R3 — Only CI deploys to production
Production changes only through `prisma migrate deploy` in the **Deploy migrations** workflow after a
merge to `main`. No `prisma db push`, `migrate dev`, `migrate reset` or hand-written DDL against
production — ever. `db push` is fine for throwaway experiments on your own branch only.

### R4 — Every migration must be safe for the version that's already running
Migrations and app deploys aren't atomic, so the code that is running must work with both the old and
the new schema. Ship schema additions **before** (or in the same release as, gated by the deploy
workflow) the code that needs them, and use **expand → migrate → contract** for anything that removes
or renames:

| Change | Release 1 (expand) | Release 2 | Release 3 (contract) |
| --- | --- | --- | --- |
| Rename column | add new column, write both, backfill | read new column | drop old column |
| Drop column | stop using it in code | — | drop it |
| Make column required | add as nullable + backfill | code always writes it | `SET NOT NULL` |
| Change type | add new column + backfill | switch reads | drop old column |

### R5 — Destructive SQL needs an explicit, reviewed opt-in
`DROP TABLE`, `DROP COLUMN`, `TRUNCATE`, unbounded `DELETE`, `ALTER COLUMN … TYPE`, `SET NOT NULL`,
renames and `DROP TYPE` fail the check unless the migration contains:

```sql
-- migration-safety: destructive-approved <why this is safe, e.g. "column unused since v2.3">
```

The reviewer approving the PR is confirming that reason. Take a Neon branch snapshot of production
before merging (Neon console → Branches → Create branch from `main`) so you can restore instantly.

### R6 — One concern per migration, and keep it small
Schema change and big data backfill go in separate migrations. Large backfills should be batched or
run as a script, not a single `UPDATE` that locks the table.

### R7 — Indexes on big tables
`CREATE INDEX` blocks writes while it builds. For large tables use `CREATE INDEX CONCURRENTLY`, and
make it the **only statement** in its migration (Postgres can't run it inside the implicit transaction
of a multi-statement script). The checker warns on non-concurrent index creation in new migrations.

### R8 — Schema conventions
- Tables snake_case plural (`@@map`), columns snake_case (`@map`), models PascalCase singular.
- Timestamps are `timestamptz` (`@db.Timestamptz(3)`), calendar days are `date` (`@db.Date`). The
  app sets its sessions to UTC; don't depend on the server's `TimeZone`.
- Every foreign key states its `onDelete`.
- Constraints Prisma can't model (CHECKs, partial indexes) live in the migration SQL with a comment,
  and are mentioned in a `///` doc comment on the field.
- No semicolons inside SQL comments (some migration runners split statements on `;`).

### R9 — No drift
`schema.prisma` must equal the result of applying every migration. Don't change one without the other.

## Enforcement

| Check | Where | Command |
| --- | --- | --- |
| Folder names, non-empty SQL, lock file | local + CI | `npm run db:migrate:check` |
| R1 immutability, R2 ordering, R5 destructive guard | CI (against `origin/main`) | `MIGRATIONS_BASE_REF=origin/main npm run db:migrate:check` |
| R9 drift: migrations vs schema | CI | `prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --exit-code` |
| History applies cleanly to an empty DB, then DB == schema | CI (Postgres service) | `prisma migrate deploy` + `prisma migrate diff --from-config-datasource --to-schema … --exit-code` |
| New migrations apply to a copy of production | CI (Neon preview branch) | `.github/workflows/neon-preview.yml` |
| R3 production deploys | CI on `main` only | `.github/workflows/deploy-migrations.yml` |

Recommended GitHub settings: protect `main`, require the **CI** checks, and add `prisma/migrations/**`
to `CODEOWNERS` so a maintainer reviews every migration.

## Neon setup

1. Create a Neon project; the default branch (`main`) is production.
2. Repository **secrets**: `DATABASE_URL_DIRECT_PRODUCTION` (direct URL of `main`) and `NEON_API_KEY`.
   Repository **variable**: `NEON_PROJECT_ID`.
3. Create a GitHub **environment** named `production` (optionally with required reviewers) — the
   deploy workflow runs in it, so you can gate production migrations on an approval.
4. In your hosting provider set `DATABASE_URL` (pooled) for the app. The build only needs
   `prisma generate`, not a database.

With `NEON_PROJECT_ID` set, each PR that touches `prisma/` gets a fresh `preview/pr-<number>` branch
copied from production; CI applies the PR's migrations to it and checks the result matches the schema,
so a migration that would fail on real data fails the PR instead of the deploy. The branch is deleted
when the PR closes. (Neon branches are copy-on-write, so this costs seconds, not a full copy.)

## When a production migration fails

`migrate deploy` stops at the failing migration and records it as failed; nothing after it runs.

1. Look at the error in the workflow log. Neon makes it cheap to inspect: branch from `main` and
   reproduce.
2. If the migration **did not** change anything (e.g. failed on the first statement):
   `npx prisma migrate resolve --rolled-back <migration_name>`, fix with a *new* migration, redeploy.
3. If it **partially** applied: finish or undo the remaining changes by hand on a Neon branch first,
   then `npx prisma migrate resolve --applied <migration_name>` (finished) or `--rolled-back` (undone).
   `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` shows what
   is still missing.
4. Last resort: restore production from a Neon branch / point-in-time restore.

## Moving data from the old MariaDB database

The Express app let Sequelize `sync()` its tables, so there's no migration history to carry over. The
init migration creates the Postgres schema from scratch; copy data across once, before go-live:

| MariaDB (Sequelize) | Postgres | Notes |
| --- | --- | --- |
| `Users` | `users` | camelCase → snake_case columns; `role` → enum `user_role`; bcrypt hashes and 2FA secrets carry over unchanged |
| `Stages` | `stages` | |
| `Vehicles` | `vehicles` | `deletedAt` keeps soft-deleted rows |
| `StageVehicles` (`StageId`, `VehicleId`) | `stage_vehicles` (`stage_id`, `vehicle_id`) | |
| `UserStageSubscriptions` (`UserId`, `StageId`) | `stage_subscriptions` | |
| `DailyDistances`, `DailyTrips`, `Feedbacks` | `daily_distances`, `daily_trips`, `feedback` | |

[pgloader](https://pgloader.io/) can do MySQL → Postgres in one pass with a column-rename map; or export
CSVs and `\copy` them in. Afterwards reset the sequences, e.g.
`SELECT setval(pg_get_serial_sequence('users','id'), (SELECT max(id) FROM users));`, for every table
with a serial `id`.
