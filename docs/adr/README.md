# Architecture decision records

Each record captures one decision: the context it was made in, the options considered, what was chosen and what it costs. Records are not edited after they are accepted; a changed decision gets a new record that supersedes the old one.

| # | Decision |
| --- | --- |
| [0001](0001-two-stores.md) | Firebase RTDB for device telemetry, Postgres as the system of record |
| [0002](0002-eta-cycle-as-a-leased-job.md) | The ETA cycle is one leased periodic job that can run on any host |
| [0003](0003-arrival-and-trip-counting.md) | Arrival from GPS with hysteresis; a trip is counted once per stop |
| [0004](0004-claim-then-send-alerts.md) | One-shot SMS alerts are claimed before they are sent |
| [0005](0005-identity-and-roles.md) | Neon Auth owns identity, the app owns roles |
| [0006](0006-business-day.md) | Daily statistics are keyed by the operator's local day |
