# ADR-0003: Arrival from GPS with hysteresis; a trip is counted once per stop

- **Status:** Accepted (supersedes the original route-distance rule)

## Context

A vehicle is *Arrived* at a stage when it is within 50 m of it, and each arrival adds one trip to that vehicle's daily total. Originally both decisions came from Google Directions:

- *Arrived* meant "Google's road distance < 50 m". But directions are cached on a ~110 m grid for 5 minutes to control cost. The cache cell is coarser than the arrival radius, so a vehicle 90 m out could inherit a cached 20 m leg (false arrival), and one 30 m out could inherit a 120 m leg (missed arrival). A Maps outage or a missing API key meant no arrivals and no trips at all.
- *Left the stage* (which re-arms trip counting) meant "this run didn't report Arrived". A GPS dropout, a "No Route" from Maps, or an exception while processing the stage all looked like leaving, so the next sighting counted a second trip. GPS jitter around the 50 m line did the same.

## Decision

- **Arrival** is decided from the GPS fix alone: straight-line distance ≤ 50 m. Google is only asked for an ETA when the vehicle is inside the 5 km geofence and not yet at the stage. Road distance is never shorter than straight-line distance, so this can only detect an arrival earlier than the old rule, never miss one.
- **Leaving** needs positive evidence: the vehicle has a fix and is more than **150 m** from *every* stage it serves. The gap between 50 m and 150 m is hysteresis, so jitter at the boundary doesn't re-arm counting.
- **Counting** is an atomic flip of `vehicles.is_at_stage` from false to true in the same transaction as the trip increment. Only the caller that wins the flip counts, so two concurrent runs can't double-count either.

## Consequences

- **+** Trip counts no longer depend on a paid third-party API being up, and fewer Directions calls are made (none for vehicles at a stage).
- **+** Each failure mode above is pinned by a unit test, and the race is pinned by an integration test against Postgres.
- **−** A stage on a dual carriageway could register a vehicle on the opposite side within 50 m. The radius is a named constant if a deployment needs it tighter.
- **−** A vehicle that serves two stages less than 150 m apart is never seen as having left either, so it counts one trip for both. Stages that close together are effectively one stop.
