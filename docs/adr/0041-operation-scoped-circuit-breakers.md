# ADR-0041: Bound circuit breakers by dependency operation

- Status: Accepted
- Date: 2026-08-29
- Owners: Platform, Playback and Discovery
- Requirements: P11-R05, P11-R07, P11-R11

## Context

ADR-0040 gives Playback publication and Discovery snapshot/export reads bounded
deadlines and one selected-transient retry. Those controls limit one logical
call, but a sustained Catalog failure still causes every newly admitted call to
repeat the same bounded work. A global Catalog breaker would stop unrelated
operations, while counting each retry attempt would make one caller contribute
multiple failures and amplify the protection response.

Playback cannot replace current Catalog publication authority with cached or
stale data. Discovery is optional and already retains a version-fenced,
visibility-limited active projection; a breaker may stop owner refresh traffic
but cannot create or extend that projection. The recovery policy therefore must
preserve different consumer outcomes while sharing one deterministic state
machine.

## Decision

Platform owns a framework-free in-memory circuit breaker in `@aster/runtime`.
Playback owns one long-lived `catalog/playback_publication` instance. Discovery
owns independent `catalog/discovery_snapshot` and `catalog/discovery_export`
instances. A failure in one scope cannot open either other scope.

Each instance uses this fixed first policy:

| Setting | Value |
|---|---:|
| Rolling time window | 30 seconds |
| Retained sample ceiling | 64 logical calls |
| Minimum throughput | 4 logical calls |
| Open threshold | failure rate at least 50% |
| Open interval | 5 seconds |
| Half-open concurrency | 1 probe; no queue |

The breaker sits inside the existing logical-operation concurrency lane and
outside ADR-0040's retry executor. A safe read contributes exactly one result.
A validated Catalog completion, including authoritative absence, is success.
An exhausted deadline, unavailable transport/status, malformed envelope or
invalid owner result is failure. Caller cancellation is ignored. Identifier,
trace and local concurrency rejection happen before breaker admission and do not
poison its sample window.

Closed calls record a bounded rolling sample. When minimum throughput and the
failure threshold hold, the state opens and clears the prior samples. Calls
during the open interval reject without HTTP. The first admitted call at or
after expiry changes the state to half-open; all other callers reject without a
queue. Probe success closes and resets the breaker. Probe failure or caller
cancellation is inconclusive and starts a fresh open interval.

Every permit captures a state generation. When one concurrent call opens or
changes the circuit, a later completion from the prior generation is observed
but cannot mutate the newer state. The clock is monotonic and injected for
tests. A regressing or failed clock freezes at its last valid reading, so an open
breaker fails safe instead of admitting a probe early. Observer failure never
changes admission.

The OpenTelemetry contract records one bounded counter,
`aster.resilience.circuit_breaker.events`, with only dependency, operation,
current state and event. Events include result accounting, open rejection,
half-open admission/rejection and closed/open transitions. IDs, URLs, queries,
credentials, errors, sample counts and raw timing are not metric dimensions.
The policy values remain in this ADR and registry rather than high-cardinality
labels.

Playback maps open/rejected/failed execution to unavailable and issues no
session. Discovery returns unavailable to its event/rebuild use case; only its
existing valid active projection can continue serving until its own visibility
lease. The breaker is not durable authority. Restart clears its finite samples
and begins closed.

## Consequences

- Sustained failure reaches at most the measured threshold before open-state
  calls stop owner HTTP amplification.
- One recovery caller probes; no thundering recovery queue forms.
- Snapshot failure does not block export recovery, and Discovery does not block
  Playback authority reads.
- Permanent protocol failures do not retry, but they do count as dependency
  failures for circuit protection.
- Process-local state is deliberate for the local single-instance demo; hosted
  replica calibration remains Phase 14.
- Router, PostgreSQL, Redis, broker, object storage and media operations retain
  their registry state until a later operation-specific Phase 11 decision.

## Alternatives considered

### One global Catalog breaker

Rejected because an export or projection-refresh fault could deny a critical
Playback publication check, and an unrelated healthy operation could hide the
failing class in one shared sample.

### Count every retry attempt

Rejected because one logical caller could consume two samples. Retry metrics
remain per attempt; breaker outcomes remain per logical operation.

### Allow several half-open probes

Rejected for the initial local policy. One probe is sufficient to demonstrate
recovery and keeps recovery load deterministic. Measured hosted throughput can
justify a different ADR later.

### Add a circuit-breaker dependency

Rejected. The required state machine is small, framework-independent and must
follow Aster's exact deadline, cancellation, generation and telemetry contracts.
No third-party runtime package is needed.

## Verification and rollback

Require deterministic transition, rolling-window, capacity, clock, observer,
generation and hostile-result tests. Real HTTP tests must prove open rejection
makes no request, only one half-open probe runs, success recovers, and Discovery
snapshot/export scopes remain independent. Telemetry tests must reject unknown
dimensions and collect only the finite series.

Rollback removes the three instances and retains ADR-0040 safe reads. No schema,
data, cache, event, credential, media or infrastructure recovery is required.

## Sources

- [Microsoft Azure Architecture Center: Circuit Breaker pattern](https://learn.microsoft.com/azure/architecture/patterns/circuit-breaker)
- [AWS Builders Library: avoiding fallback in distributed systems](https://aws.amazon.com/builders-library/avoiding-fallback-in-distributed-systems/)
- [OpenTelemetry metric semantic conventions](https://opentelemetry.io/docs/specs/semconv/general/metrics/)
