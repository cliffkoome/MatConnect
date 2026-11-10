# ADR-0001: Firebase RTDB for device telemetry, Postgres as the system of record

- **Status:** Accepted

## Context

GPS units in the vehicles already push their position to Firebase Realtime Database (`locations/<carId>`). The firmware is out of this repository's control, and it only needs a URL and a device credential, not a server of ours. Everything else — users, roles, stages, vehicle assignments, trips, distance, feedback — is relational, needs constraints and transactions, and is read by dashboards with date-range queries.

## Options

1. **Everything in Firebase.** One store, but no foreign keys, no unique constraints, no transactions across nodes, and reporting queries become client-side scans.
2. **Everything in Postgres.** Devices would need an ingestion API to write to, which means new firmware and a public write endpoint to secure and scale.
3. **Split by job.** Firebase stays the device-facing inbox for "latest position" and an outbox for published ETAs. Postgres holds everything that must be correct.

## Decision

Option 3. Firebase holds only ephemeral, last-value-wins data (current position, current ETAs). Anything that is counted, owned or audited lives in Postgres. The ETA cycle is the only component that reads from one and writes to the other.

## Consequences

- **+** Devices need no changes, and losing Firebase data loses nothing that can't be regenerated within one cycle.
- **+** Integrity rules (one trip row per vehicle per day, ratings 1–5, cascading deletes) are enforced by the database, not by application code.
- **−** Two sets of credentials and two failure domains. Each integration switches itself off with one log line when unconfigured, and the cycle isolates failures per stage (see [ADR-0002](0002-eta-cycle-as-a-leased-job.md)).
- **−** Position fixes carry no timestamp today, so a device that goes silent leaves its last fix in place. This is listed under *Limitations* in the README; the fix needs a firmware change.
