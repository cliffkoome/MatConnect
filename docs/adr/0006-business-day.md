# ADR-0006: Daily statistics are keyed by the operator's local day

- **Status:** Accepted

## Context

Trips and distance are stored per vehicle per calendar day (`daily_trips`, `daily_distances`, a Postgres `DATE`). The day was computed in UTC. Nairobi is UTC+3, so every trip between midnight and 03:00 local time landed on the previous day, and an owner checking "today" just after midnight saw yesterday's totals until 03:00.

## Decision

The day is computed in a configured IANA time zone, `APP_TIME_ZONE` (default `Africa/Nairobi`, validated at startup), and stored as midnight UTC of that calendar date, which is how a `DATE` column round-trips. One function (`businessDay`) converts an instant to a day, and both the writer (the ETA cycle) and the readers (the dashboards) use it. After that point all date arithmetic is plain calendar arithmetic.

## Consequences

- **+** Days match what operators see on the wall clock, and the rule lives in one tested function.
- **+** Deployments in other countries change one variable, not code.
- **−** Rows written before this change used UTC days, so trips made between 00:00 and 03:00 in Nairobi before the change stay on the previous day. No backfill is attempted: the time of each trip wasn't stored, so it can't be recomputed.
- **−** A whole deployment shares one zone. A multi-country fleet would need the zone per operator.
