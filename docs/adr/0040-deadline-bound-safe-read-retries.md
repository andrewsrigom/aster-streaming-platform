# ADR-0040: Deadline-bound retries for selected owner reads

- Status: Accepted
- Date: 2026-08-29
- Owners: Platform, Playback and Discovery
- Requirements: P11-R01, P11-R02, P11-R03, P11-R04, P11-R06, P11-R11

## Context

Playback and Discovery use private, fixed GraphQL operations to read current
Catalog-owned state. Both operations are side-effect-free, credential-separated,
bounded and cancellable. ADR-0027 originally prohibited retries for Playback's
read, and Discovery likewise made one HTTP attempt. That was the safe initial
choice before Aster had an overall-deadline primitive, a dependency policy
registry or a way to prove retry amplification.

Phase 11 now requires a deliberate retry policy. Retrying at Web, Router and
owner-client layers would multiply load and could outlive the inbound request.
Treating every HTTP or transport failure as transient would also retry malformed
owner data and deterministic failures.

## Decision

Platform owns one framework-free safe-read executor in `@aster/runtime`. One
logical operation creates one overall deadline, remains inside its already
admitted concurrency lane and makes no more than the configured finite attempts.
Before a retry, the executor requires enough remaining budget for the jittered
delay, the complete next-attempt ceiling and a response reserve. Caller
cancellation bounds attempts and backoff. An attempt timeout is terminal: the
transport is aborted and no overlapping attempt starts.

Use equal-jitter exponential backoff: half of the capped exponential delay plus
a bounded random half. The random source is injected at client construction.
Invalid randomness, policy or attempt output fails closed. Observation uses only
finite attempt outcomes and optional delay; dependency metrics use the fixed
`catalog`/`read` dimensions and never include URLs, operations, identifiers,
credentials or error text.

The first two policies are:

| Logical operation | Overall | Attempt | Response reserve | Attempts | Backoff |
|---|---:|---:|---:|---:|---:|
| Playback current publication | 1,500 ms | 650 ms | 100 ms | 2 | 13–25 ms equal jitter |
| Discovery current snapshot/export page | 2,000 ms | 850 ms | 100 ms | 2 | 13–25 ms equal jitter |

Only HTTP 502, 503 and 504, `EAI_AGAIN`, `ECONNRESET`, and an incomplete or
aborted response stream are transient. HTTP 4xx/500, redirects, invalid headers,
oversized/compressed bodies, malformed JSON, GraphQL error envelopes, invalid
owner data, local capacity and unknown failures are terminal for the logical
read. A successful owner absence is a completed result, not a retry signal.

The Playback client keeps at most four logical operations in flight. Discovery
keeps one logical snapshot/export operation and no queue. A retry consumes the
same permit. Web and Apollo Router make one attempt for these operations, so the
owner client is the sole synchronous retry layer. Mutations, unknown transaction
outcomes, authorization decisions and rights/publication writes are unchanged
and receive no generic retry.

This decision supersedes only ADR-0027's `no retry` clause for the fixed private
Playback-to-Catalog read. All its trust, current-rights and fail-closed decisions
remain. It refines ADR-0035's private Catalog read execution without changing its
projection authority, visibility lease or rebuild consistency model.

## Consequences

- One brief owner reset or selected gateway failure can recover without user
  action while the original deadline still bounds latency.
- Slow attempts do not overlap, and a retry cannot escape the existing bulkhead.
- Permanent protocol/data failures remain one attempt and visible as failure.
- Per-attempt Catalog telemetry can expose amplification while Router and client
  logs retain one logical operation.
- Circuit breakers and controlled failure injection remain separate Phase 11
  work; this ADR does not claim them implemented.

## Alternatives considered

### Retry in Apollo Router

Rejected because it would apply outside the purpose-separated owner contract and
could combine with service or client retry. Router retains timeout, concurrency
and partial-response ownership only.

### Retry every 5xx or timeout

Rejected. HTTP 500 is not enough evidence of transience, and retrying an attempt
that consumed its full timeout risks overlapping cleanup and spending the entire
response reserve.

### Add a retry package

Rejected. The required executor is small, uses the existing deadline primitive
and needs Aster-specific classification, telemetry and budget semantics. No new
runtime dependency is introduced.

## Verification and rollback

Require deterministic executor tests for jitter, budget exhaustion, cancellation,
attempt timeout, permanent failure and the attempt ceiling. Real HTTP tests must
prove 503/reset recovery, one attempt for malformed/permanent responses, finite
concurrency and socket cleanup. The dependency registry must show one retry owner
for every operation class.

Rollback restores the two clients to one attempt while keeping the registry and
deadline primitive. No schema, data, Redis key, event, media or credential change
is involved.

## Sources

- [Node.js HTTP request cancellation](https://nodejs.org/docs/latest-v24.x/api/http.html)
- [AWS Builders Library: timeouts, retries and backoff with jitter](https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/)
- [Apollo Router traffic shaping](https://www.apollographql.com/docs/graphos/routing/performance/traffic-shaping)
