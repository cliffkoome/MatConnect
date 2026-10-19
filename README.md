# MatConnect — real-time matatu arrivals

MatConnect shows passengers live ETAs for matatus approaching their stage, sends one-shot SMS alerts
when a matatu arrives, and gives system admins and matatu owners dashboards for stages, vehicles,
users, trips, distance and feedback. GPS devices in the vehicles push fixes to Firebase; a background
cycle turns them into ETAs.

**Stack:** Next.js 16 (App Router) · TypeScript · Prisma 7 · PostgreSQL on Neon · Vitest

## Features

- **Passengers** — pick a stage, see live ETAs (refreshes every 30 s), subscribe to an SMS alert for the
  next arrival, rate rides, manage profile and TOTP two-factor auth, sign in with email or Google.
- **Admins** — live fleet status with street-level locations, stage & route management, vehicle
  registry, user management (search, filter, block, delete, create admins), feedback feed.
- **Matatu admins** — today's fleet totals, per-vehicle distance/trips for any day, daily/weekly/monthly
  charts (PNG export) and a CSV fleet report.

## Architecture

```
src/
├─ app/                     Next.js routes
│  ├─ api/**/route.ts       HTTP layer only: validate → call a service → JSON
│  └─ (pages)               React client pages (/, /login, /stages, /admin, /mat-admin, …)
├─ server/                  server-only code (never imported by client components — lint-enforced)
│  ├─ http/                 route() wrapper, error mapping, rate limiting
│  ├─ auth/                 JWTs (jose), bcrypt, TOTP, guard, cookies, Google OAuth
│  ├─ modules/<feature>/    business logic per feature (auth, admin, mat-admin, stages, eta, feedback, vehicles)
│  ├─ domain/               pure logic, no I/O: ETA classification, geo maths, date periods, phone numbers
│  ├─ integrations/         Firebase RTDB, Google Maps, Africa's Talking SMS, SMTP
│  ├─ jobs/                 ETA cycle, job lease, in-process scheduler
│  ├─ db.ts                 Prisma client (Neon serverless driver or node-postgres)
│  └─ env.ts                validated environment
├─ lib/client/              browser API client (auto token refresh), session, hooks
├─ components/              shared UI (headers, live vehicle table)
└─ styles/pages/            the original page styles, scoped per page
prisma/                     schema.prisma, migrations/, seed.ts
tests/                      unit/, api/ (route handlers), integration/ (real Postgres)
docs/MIGRATIONS.md          migration rules
```

Request flow: `route()` applies the rate limit, authenticates the bearer token (checking the user row,
so blocking a user or resetting a password takes effect immediately), awaits params, runs the handler
and maps `HttpError` / Zod / Prisma errors to `{ message, errors? }` JSON.

**Auth:** short-lived access token (15 min) in the `Authorization` header, httpOnly refresh cookie
(7 days, `SameSite=Lax`, path `/api/auth`) with rotation and reuse detection. Every JWT carries a `typ`
claim so a 2FA temp token can't be used as an access token. Revoked token IDs live in Postgres.

**ETA cycle:** reads all GPS fixes from Firebase, computes ETAs per stage (Google Directions, only
inside a 5 km geofence), publishes them to Firebase `etas/<stage>`, counts a trip once per arrival,
texts subscribers, and accumulates daily distance. A lease row in `job_locks` guarantees only one run
at a time across instances. It runs:

| Where you deploy | How the cycle runs | Set |
| --- | --- | --- |
| VM / container (`next start`) | in-process every 30 s | nothing (default) |
| Vercel Pro | Vercel Cron → `/api/cron/eta-cycle?runs=2` every minute (two runs, 30 s apart) | `CRON_SECRET`, add the cron below |
| Vercel Hobby / other serverless | an external scheduler calling `/api/cron/eta-cycle`, or `npm run eta:worker` on a small VM | `CRON_SECRET` or `ETA_CYCLE_MODE=off` + worker |

Vercel Pro `vercel.json` (Hobby only allows daily crons and rejects this at deploy time):

```json
{ "crons": [{ "path": "/api/cron/eta-cycle?runs=2", "schedule": "* * * * *" }] }
```

## Getting started

Prerequisites: Node.js ≥ 22 and a Neon project (or any PostgreSQL 15+).

```bash
git clone https://github.com/cliffkoome/MatConnect && cd MatConnect
npm install                       # also runs `prisma generate`
cp .env.example .env              # read by Next.js, the Prisma CLI and scripts
# fill in DATABASE_URL (pooled), DIRECT_URL (direct) and the two JWT secrets
npm run db:migrate:deploy         # create the schema
npm run db:seed                   # optional demo data (password: matconnect123)
npm run dev                       # http://localhost:3000
```

The first account to register becomes the Admin. Optional integrations (Google sign-in, Maps, Firebase,
SMS, email) switch on when their variables are set; see `.env.example`.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js |
| `npm run lint` / `typecheck` | ESLint, `tsc --noEmit` |
| `npm test` | unit + route tests (no database needed) |
| `npm run test:integration` | tests against a real, migrated Postgres (`DATABASE_URL`) |
| `npm run db:migrate:create -- --name x` | generate a migration from schema changes, without applying it |
| `npm run db:migrate:dev` | apply pending migrations to your dev database |
| `npm run db:migrate:deploy` | apply migrations (CI / production) |
| `npm run db:migrate:status` | show applied / pending migrations |
| `npm run db:migrate:check` | enforce the migration rules |
| `npm run db:seed` / `db:studio` | seed demo data / open Prisma Studio |
| `npm run eta:worker` | run the ETA cycle as a standalone process |

## Database & migrations

Read **[docs/MIGRATIONS.md](docs/MIGRATIONS.md)** before changing `prisma/schema.prisma`. In short:
generate migrations with `db:migrate:create`, review the SQL, never edit a merged migration, keep
changes backward compatible, mark destructive SQL explicitly, and let CI deploy to production.

CI (`.github/workflows/`):
- **ci.yml** — lint, typecheck, tests, build; then migration rules, drift check, apply history to a
  fresh Postgres, verify DB == schema, integration tests, seed.
- **neon-preview.yml** — per-PR Neon branch copied from production with the PR's migrations applied.
- **deploy-migrations.yml** — `prisma migrate deploy` to production on merge to `main` (only path to prod).

## API

Same endpoints as the Express version (`api-tests.http` has a request for each):
`/api/auth/*` (register, login, refresh, logout, me, profile, password reset, 2FA, Google),
`/api/stages`, `/api/eta/:stageId`, `/api/feedback`, `/api/admin/*`, `/api/mat-admin/*`,
plus `/api/health` and `/api/cron/eta-cycle`. Old `*.html` page URLs redirect to the new routes.
