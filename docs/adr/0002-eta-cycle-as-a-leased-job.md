# ADR-0002: The ETA cycle is one leased periodic job that can run on any host

- **Status:** Accepted

## Context

Every 30 seconds something must read all vehicle positions, compute ETAs per stage, count trips, send alerts and accumulate distance. Those side effects are not idempotent if two copies run at once: trips and distance would be added twice and passengers texted twice.

The app is deployed in different ways: a long-running `next start` on a VM, several instances behind a load balancer, or serverless functions with no background process at all.

## Options

1. **In-process timer only.** Simple, but it doesn't exist on serverless, and with N instances it runs N times.
2. **Postgres session advisory lock** (`pg_try_advisory_lock`). Session locks don't survive Neon's PgBouncer pooler in transaction mode: the lock is held by whichever server connection happened to run the statement.
3. **External queue or scheduler service.** Correct, but a new piece of infrastructure for one job.
4. **A lease row in Postgres** (`job_locks`): an `INSERT … ON CONFLICT DO UPDATE … WHERE locked_until < now` that only succeeds when the previous lease has expired.

## Decision

Option 4, with one job body (`runEtaCycle`) and three interchangeable triggers: an in-process timer (`ETA_CYCLE_MODE=interval`), an HTTP endpoint for any cron (`/api/cron/eta-cycle`, constant-time secret check), or a standalone worker (`npm run eta:worker`). Whichever trigger fires, only the lease holder does any work.

A lease that expires while its holder is still running would let a second run start alongside it. So each run works to a **time budget** shorter than the lease (45 s of a 55 s lease) and stops starting new stages or writes once the budget is spent. The cron endpoint additionally caps the budget by what is left of the function's `maxDuration`, so the platform never kills a run while it still holds the lease.

## Consequences

- **+** Safe with any number of instances and any mix of triggers. No new infrastructure.
- **+** Stopping early is harmless by construction: ETAs are overwritten by the next run, and distance is measured from the last *saved* position, so movement that wasn't recorded is counted next time.
- **+** Every side effect is also guarded on its own (trip flip, alert claim), so correctness doesn't rest on the lease alone.
- **−** No fencing token: a holder that stalls for longer than the safety margin (e.g. a long GC pause) could overlap a new holder for a moment. The per-effect guards above bound the damage to a duplicated ETA publish.
- **−** One job processes stages sequentially. That is fine at city scale; the README's *Scaling* section describes sharding the lease per stage group when it isn't.
