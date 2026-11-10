# ADR-0004: One-shot SMS alerts are claimed before they are sent

- **Status:** Accepted

## Context

A passenger can ask to be texted when the next matatu arrives at a stage. The subscription is one-shot: it is consumed by the first alert. The original order was *check the row exists → send → delete the row*. Two runs that overlapped, or a failure between sending and deleting, texted the same person again on the next arrival.

SMS delivery is an external side effect with no idempotency key, so exactly-once is not available. The choice is which way to fail.

## Options

1. **Send, then delete** (at-least-once). Never loses an alert; duplicates under overlap and on a failed delete.
2. **Claim, then send** (at-most-once). `DELETE` the row first; only the caller whose delete removed it sends. On a rejected or failed send, put the row back.
3. **Outbox table** with a status column and a separate sender with retries. Strongest, but a second job and a state machine for one message type.

## Decision

Option 2. The delete is the claim; Postgres guarantees only one concurrent `DELETE` of a row reports it. If Africa's Talking rejects the message or the call throws, the subscription is re-inserted with its original `created_at` (`skipDuplicates`, so a fresh subscription isn't clobbered) and the next arrival retries.

## Consequences

- **+** No duplicate texts under any overlap, including two vehicles arriving at the same stage in one run.
- **−** A crash between the claim and the send loses that one alert. For "your matatu is here", a rare missed text costs less than a duplicate, and the passenger can still see the live ETA.
- **→** If alerts grow beyond one message type, move to option 3.
