# Work Item: Operation admission and Phase 10 closeout

- Status: IN_PROGRESS
- Owner: Engagement owns viewer-write rate policy; Discovery owns search concurrency; Platform owns the bounded Redis command
- Phase: 10
- Requirement IDs: P10-R08, P10-R09, P10-R10, P10-R11, P10-R12
- Created: 2026-08-29
- Updated: 2026-08-29

## Outcome

Repeated viewer writes are admitted by an operation-specific token bucket after
current owner authorization. One account cannot multiply capacity by changing
profiles, and multiple service instances share one atomic Redis decision. Redis
loss falls back to a bounded process-local bucket, so accepted progress remains a
PostgreSQL transaction and Redis never acknowledges a durable mutation. Discovery
search receives a separate two-active/one-waiter bulkhead so expensive searches
cannot consume all home-rail capacity. Measured atomicity, outage and hot-key
evidence closes Phase 10 without implementing Phase 11 retry/circuit policies or
Phase 13's final public GraphQL calibration.

## Current behavior

Catalog cache-aside is released through main `903f7b4`. Discovery stale serving
passed PR39 protected run `33274397440`, clean exact-head confirmation and
squash-merged as `6a2fe3a8f55dd4c655f962d62d4ba017f5716cf0`; its exact-main
run `33275183338` is the frozen predecessor gate. Existing subgraphs have only
process-global token buckets and no operation identity partition. Discovery has
one four-request transport lane, so queued search work can consume the same
admission used by home rails. The shared Redis adapter has bounded cache and lease
commands but no atomic rate-decision command.

## Proposed behavior

Add one Redis-server-time token-bucket command with a small deterministic Lua
script. It validates the exact key and bounded integer policy, atomically recovers
missing, malformed, wrong-type or non-expiring limiter state, consumes one token,
sets a finite TTL and returns only allowed/rejected, remaining capacity,
retry-after and recovery state. Vendor timeout, abort, malformed reply and
capacity behavior stay inside the existing adapter deadline and cancellation
contract.

Engagement wraps `record_progress` and `set_watchlist` after Identity has returned
current account/profile authority and after an idempotency receipt replay check,
but before Playback/Catalog reads or a write transaction. Keys partition by
environment, exact operation and a SHA-256 pseudonym of the authorized account.
Policies are twelve-token/four-per-second progress and four-token/one-per-second
watchlist buckets. A bounded 1,024-partition process-local shield applies the same
policy before Redis. It rejects a local hot burst without a Redis command; if
Redis is unavailable after local admission, the local result is the explicit
degraded decision. Successful Redis rejection remains authoritative. Idempotent
replays do not spend another token. A limit result performs no durable write and
returns `LIMIT_EXCEEDED` with bounded `Retry-After` metadata.

Discovery adds a local search-only bulkhead after operation validation: two
active searches, one queued caller, 100 ms maximum queue wait and independent
cancellation. Overflow or wait expiry is an explicit bounded rejection; home
rails and schema reads do not enter that lane. Shutdown closes admission and
settles every waiter before dependency closure.

## Boundaries

- Owning context: Engagement owns write admission after owner authorization;
  Discovery owns search admission; Platform owns only the Redis primitive and
  finite telemetry vocabulary.
- Affected services/packages: `packages/redis`, `packages/telemetry`,
  `services/engagement`, `services/discovery`, Compose, operations and Phase 10
  evidence.
- Authoritative data: Engagement PostgreSQL remains progress/watchlist truth;
  Identity remains account/profile authority; Discovery PostgreSQL remains search
  truth. Redis and local limiter state are disposable.
- Read models/caches: no cache schema or read model changes.
- Trust boundaries: GraphQL operation/input, current Identity owner response,
  account pseudonym, Redis key/state/reply, server time, queue admission,
  cancellation and shutdown.
- External dependencies: existing pinned Redis 8.10.0 and PostgreSQL 18.6; no new
  package or service.

## Invariants

- Only a current Identity-authorized account selects the distributed partition;
  untrusted profile IDs or cookies do not select it directly.
- Idempotent receipt replay precedes limiting and cannot be converted into a new
  write by Redis behavior.
- Redis acceptance never authorizes, commits or acknowledges progress/watchlist;
  PostgreSQL owner checks and transactions remain decisive.
- Redis loss may multiply the documented local capacity by healthy process count,
  but cannot become unlimited inside one process or corrupt durable state.
- Limiter keys and telemetry contain no credential, account/profile ID, query,
  correlation ID or unbounded dimension.
- Search has two active slots, one finite waiter and a bounded wait; home rails do
  not use or wait for that bulkhead.
- Phase 10 supplies reusable behavior and representative policy only. Phase 13
  still owns trusted proxy identity, public/router placement and workload-based
  GraphQL calibration.

## Failure behavior

| Failure | Expected behavior | Telemetry |
|---|---|---|
| Redis timeout, disconnect, unavailable or command capacity | Continue only if the local bucket admitted; durable owner path remains unchanged | limiter `local_fallback` plus Redis dependency outcome |
| Redis atomic rejection | Return `LIMIT_EXCEEDED` and bounded retry metadata; execute no later owner dependency/write | limiter `rejected` |
| Wrong-type, malformed, future, non-expiring or excessive-TTL state | Atomically replace only the exact key with one finite current decision | limiter `recovered` and decision |
| Caller cancellation before a Redis decision | Return cancelled; do not fall back or write | limiter `cancelled` |
| Local partition capacity exhausted | Redis remains the global authority for existing identities; reject new local admission safely when Redis cannot decide | limiter `local_rejected` or `local_fallback` |
| Search active slots full with queue available | Wait at most 100 ms with caller cancellation | concurrency `queued` then terminal outcome |
| Search queue full or wait expires | Reject without running the search source | concurrency `rejected` |
| Limiter telemetry failure | Preserve the already made admission decision | no behavior change |
| Redis outage during real progress traffic | Existing local bucket bounds admission; PostgreSQL transaction/idempotency still determines success | outage artifact and durable row/receipt counts |

## Data and contracts

- Schema/migration: no PostgreSQL migration.
- GraphQL: additive `LIMIT_EXCEEDED` values for Engagement mutation payload enums;
  bounded `Retry-After` is set on a limited mutation response. No public operation,
  field or argument changes.
- Events: unchanged; rejected attempts append no outbox event.
- Cache: no cache changes. Limiter keys use
  `aster:{environment}:engagement:rate:v1:{operation}:{accountDigest}` without
  literal Redis Cluster hash-tag braces; compact versioned state and finite TTL.
- Compatibility: older clients already treat non-completed mutation codes as
  failures; generated supergraph/manifest are regenerated additively.
- Retention/deletion: Redis limiter state expires automatically; local state is
  bounded and evicted after inactivity. No scan, flush or durable deletion.

## Security and privacy

- Authorization: limiter placement follows successful current owner validation;
  it never substitutes for authorization.
- Input limits: two fixed operation names, fixed policies, 256-byte Redis key,
  bounded integer replies, 1,024 local partitions, two active searches and one
  waiter.
- Sensitive data: SHA-256 account pseudonym exists only in a short-lived Redis
  key/local map and is never logged or labeled; credentials and raw IDs are absent.
- Abuse cases: rotating profile IDs cannot create capacity; malformed Redis state
  is atomically fenced; hot callers are rejected locally before repeated Redis
  commands; queue flooding has finite memory and wait.

## Implementation steps

1. Record the identity, algorithm, failure and hot-key choices in ADR-0039.
2. Add and unit-test the bounded atomic Redis token-bucket command.
3. Add finite operation-limit telemetry and a bounded local token-bucket shield.
4. Apply rate admission after owner/idempotency checks to Engagement progress and
   watchlist writes; compose optional non-critical Redis lifecycle.
5. Add the Discovery search bulkhead and preserve independent home admission.
6. Regenerate/verify Federation artifacts and focused transport/application tests.
7. Run real Redis atomicity/hot-key/outage and real durable-progress evidence.
8. Run the affected candidate gate, one complete review round, batch blockers,
   confirm, release and close Phase 10.

## Tests

- Domain/application: policy validation, account/operation partition, independent
  refill, idempotent replay before limit, rejection before later dependencies and
  Redis-failure local fallback.
- Adapter: atomic allow/reject boundary, server time, malformed/wrong-type state,
  reply validation, timeout, cancellation and command capacity.
- Integration: real Redis concurrent same-key/two-instance atomicity, hot-key
  command reduction, TTL/cardinality and exact cleanup; real PostgreSQL progress
  succeeds and remains idempotent while Redis is absent.
- Contract: additive Federation composition/generated artifacts and finite metric
  labels.
- Browser: not repeated unless mutation response or Web handling changes beyond
  the already compatible non-completed code path.
- Performance/failure: two-active/one-waiter search barrier, overflow, wait expiry,
  cancellation, home isolation, Redis outage and measured hot burst.

## Evidence

- Commands: focused Redis/telemetry/Engagement/Discovery tests and strict static
  checks; disposable real Redis and PostgreSQL fixtures; `pnpm check:changed` and
  the Phase 10 complete acceptance gate.
- Raw artifact path: `evidence/phase-10/operation-limiters-*.txt`, Discovery
  release evidence and updated Phase 10 index.
- Acceptance result: pending implementation.
- Iteration gate: affected package/service builds and focused tests, then scoped
  lint/format.
- Candidate gate: `pnpm check:changed` plus real Redis atomicity/hot-key and
  Engagement PostgreSQL outage fixtures.
- Heavyweight repeat triggers: Redis script/reply/key or local policy changes
  repeat Redis evidence; owner placement/result or Engagement composition changes
  repeat durable outage evidence; search admission changes repeat concurrency
  proof. Unchanged media, player and browser assets do not repeat.
- Review stopping rule: one complete initial review and one confirmation. Reopen
  only for a requirement, security/data invariant, availability behavior or
  public-contract blocker.

## Rollback or recovery

Disable distributed Engagement limiting, retaining the compatible local shield,
or restore the prior Engagement/Discovery artifacts. Let limiter keys expire; do
not scan or flush Redis. No PostgreSQL rollback, event replay, profile change,
media action or retained-project reset is required.

## Documentation updates

ADR-0039, Redis/GraphQL architecture, Engagement and Discovery service docs,
runbooks, Phase 10 evidence/index, roadmap and repository memory.

## Completion checklist

- [ ] Requirements satisfied
- [ ] Tests pass
- [ ] Evidence captured
- [ ] Documentation current
- [ ] `.ai/` state updated
- [ ] Remaining risks recorded
