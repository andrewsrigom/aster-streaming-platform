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
is released through PR39, squash `6a2fe3a8f55dd4c655f962d62d4ba017f5716cf0`
and exact-main run `33275183338`. The candidate implements the bounded Redis
token-bucket command, Engagement account-operation admission, local degraded
shield, finite limiter telemetry and the Discovery search-only bulkhead. Focused
Redis, telemetry, Engagement and Discovery suites pass, and the initial complete
affected candidate gate passed 73/73. Protected run `33277368515` passed the real
Redis/PostgreSQL fixtures at exact `6719bda`. Its initial review found three public
contract blockers: concurrent identical retries could spend multiple tokens, and
Engagement/Discovery limit responses depended on private subgraph HTTP behavior.
Exact `ade7379` serializes same-key work before receipt/admission and exposes the
two limit decisions in portable GraphQL payloads. Engagement123/123,
Discovery105/105 and Web111/111 pass after the batched remediation; the corrected
complete candidate passes 73/73 with 48 cached in 73.641 seconds. Protected run
`33279111820` then passed every required job at exact `041c75e`, including the
corrected real Redis/PostgreSQL fixtures. Its confirmation review found one
remaining replica boundary: process-local same-key ordering cannot prevent two
Engagement replicas from charging the shared bucket before PostgreSQL receipt
serialization. Exact `c5ea7c8` adds one finite atomic v2 admission marker to the
shared bucket decision. Redis18/18, Engagement124/124, scoped static checks and
the corrected affected gate pass 73/73 with 44 cached in 61.854 seconds. The
Redis script/key changed, so the protected real-dependency repeat and permitted
blocking-boundary confirmation remain before release.

## Proposed behavior

Add one Redis-server-time token-bucket command with a small deterministic Lua
script. It validates the exact bucket and admission keys plus bounded integer
policy. A first allowed idempotency admission atomically consumes one token and
records a finite marker; another replica presenting the same admission digest
reuses that decision without another charge. Independent admission digests still
compete for the account-operation bucket. The command atomically recovers
missing, malformed, wrong-type or non-expiring limiter state, sets finite TTLs
and returns only allowed/rejected, remaining capacity, retry-after, recovery and
deduplication state. Vendor timeout, abort, malformed reply and capacity behavior
stay inside the existing adapter deadline and cancellation contract.

Engagement wraps `record_progress` and `set_watchlist` after Identity has returned
current account/profile authority. A process-local queue serializes the same
authorized account/profile/idempotency key before receipt inspection and rate
admission, with at most 1,024 active keys and 31 waiters per key. The first caller
can spend one token; concurrent identical callers then observe its receipt rather
than multiplying token use or durable effects. Keys partition by
environment, exact operation and a SHA-256 pseudonym of the authorized account.
The companion admission key contains only a SHA-256 digest of the authorized
account/profile/idempotency identity and expires with the bucket policy.
Policies are twelve-token/four-per-second progress and four-token/one-per-second
watchlist buckets. A bounded 1,024-partition process-local shield applies the same
policy before Redis. It rejects a local hot burst without a Redis command; if
Redis is unavailable after local admission, the local result is the explicit
degraded decision. Successful Redis rejection remains authoritative. Idempotent
replays do not spend another token. A limit result performs no durable write and
returns `LIMIT_EXCEEDED` with bounded `retryAfterMs` in the public GraphQL payload;
the private subgraph header is supplemental only.

Discovery adds a local search-only bulkhead after operation validation: two
active searches, one queued caller, 100 ms maximum queue wait and independent
cancellation. Overflow or wait expiry is an explicit bounded rejection; home
rails and schema reads do not enter that lane. Search rejection returns HTTP 200
with `DiscoverySearchCode.LIMIT_EXCEEDED` and no source result, so Apollo Router
preserves the outcome. Shutdown closes admission and settles every waiter before
dependency closure.

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
- Concurrent work for one authorized idempotency key is serialized before receipt
  inspection, so one in-process burst cannot charge one token per identical retry.
- Across Engagement replicas, one atomic Redis marker makes the same authorized
  idempotency admission charge at most once during the bounded execution window;
  PostgreSQL receipt and aggregate locks remain the durable effect authority.
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
| Same-key mutation already in flight | Wait in the bounded local idempotency lane, then replay/conflict before another rate decision | existing finite owner/result outcomes |
| Same-key mutation reaches another replica before receipt commit | Reuse the finite atomic Redis admission marker without another token charge; PostgreSQL serializes the durable receipt/effect | limiter allowed outcome with bounded Redis dependency telemetry |
| Idempotency lane capacity exhausted or waiter limit reached | Return `BACKPRESSURE` before receipt/limiter/dependency work | no unbounded queue |
| Wrong-type, malformed, future, non-expiring or excessive-TTL state | Atomically replace only the exact key with one finite current decision | limiter `recovered` and decision |
| Caller cancellation before a Redis decision | Return cancelled; do not fall back or write | limiter `cancelled` |
| Local partition capacity exhausted | Redis remains the global authority for existing identities; reject new local admission safely when Redis cannot decide | limiter `rejected` or Redis decision |
| Search active slots full with queue available | Wait at most 100 ms with caller cancellation | concurrency `queued` then terminal outcome |
| Search queue full or wait expires | Return a public `LIMIT_EXCEEDED` payload without running the search source | concurrency `rejected` |
| Limiter telemetry failure | Preserve the already made admission decision | no behavior change |
| Redis outage during real progress traffic | Existing local bucket bounds admission; PostgreSQL transaction/idempotency still determines success | outage artifact and durable row/receipt counts |

## Data and contracts

- Schema/migration: no PostgreSQL migration.
- GraphQL: additive `LIMIT_EXCEEDED` values for Engagement mutation payload enums
  and `DiscoverySearchCode`; additive nullable `retryAfterMs` on both Engagement
  mutation payloads. First-party persisted operations select the retry field.
  Private `Retry-After` headers are supplemental and not required through Router.
- Events: unchanged; rejected attempts append no outbox event.
- Cache: no cache changes. Limiter v2 keys use separate bounded bucket and
  admission families under
  `aster:{environment}:engagement:rate:v2:{operation}:{accountDigest}` without
  literal Redis Cluster hash-tag braces; both values are compact, versioned and
  expire after the policy TTL. Superseded v1 bucket keys expire naturally.
- Compatibility: older clients already treat non-completed mutation codes as
  failures; generated supergraph/manifest are regenerated additively.
- Retention/deletion: Redis limiter state expires automatically; local state is
  bounded and evicted after inactivity. No scan, flush or durable deletion.

## Security and privacy

- Authorization: limiter placement follows successful current owner validation;
  it never substitutes for authorization.
- Input limits: two fixed operation names, fixed policies, 256-byte Redis key,
  bounded integer replies, 1,024 local partitions, 1,024 active idempotency keys
  with 31 waiters each, two active searches and one waiter.
- Sensitive data: SHA-256 account pseudonym exists only in a short-lived Redis
  key/local map and is never logged or labeled; credentials and raw IDs are absent.
- Abuse cases: rotating profile IDs cannot create capacity; malformed Redis state
  is atomically fenced; hot callers are rejected locally before repeated Redis
  commands; queue flooding has finite memory and wait.

## Implementation steps

1. Record the identity, algorithm, failure and hot-key choices in ADR-0039.
2. Add and unit-test the bounded atomic Redis token-bucket command, including
   cross-client idempotency admission deduplication.
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
  refill, five concurrent same-key progress/watchlist retries consuming one
  admission/effect, bounded/cancellable idempotency queues, rejection before later
  dependencies and Redis-failure local fallback.
- Adapter: atomic allow/reject boundary, same-admission deduplication across two
  clients, distinct-admission charging, server time, malformed/wrong-type state,
  reply validation, timeout, cancellation and command capacity.
- Integration: real Redis concurrent same-key/two-instance atomicity, hot-key
  command reduction, TTL/cardinality and exact cleanup; real PostgreSQL progress
  succeeds and remains idempotent while Redis is absent.
- Contract: additive Federation composition/generated artifacts, portable
  Engagement retry/search-limit payloads and finite metric labels.
- Browser: repeat the affected hosted journey because the corrected public
  mutation/search response handling changed; unchanged media encoding is carried
  forward.
- Performance/failure: two-active/one-waiter search barrier, overflow, wait expiry,
  cancellation, home isolation, Redis outage and measured hot burst.

## Evidence

- Commands: focused Redis/telemetry/Engagement/Discovery tests and strict static
  checks; disposable real Redis and PostgreSQL fixtures; `pnpm check:changed` and
  the Phase 10 complete acceptance gate.
- Raw artifact path: `evidence/phase-10/operation-limiters-*.txt`, Discovery
  release evidence and updated Phase 10 index.
- Acceptance result: both earlier protected real-dependency runs passed, and the
  cross-replica correction passes its focused suites plus the complete affected
  73/73 local candidate. The new two-key Redis command still requires protected
  real-dependency execution.
- Iteration gate: affected package/service builds and focused tests, then scoped
  lint/format.
- Candidate gate: `pnpm check:changed` plus real Redis atomicity/hot-key and
  Engagement PostgreSQL outage fixtures.
- Heavyweight repeat triggers: Redis script/reply/key or local policy changes
  repeat Redis evidence; owner placement/result or Engagement composition changes
  repeat durable outage evidence; search admission changes repeat concurrency
  proof. Unchanged media, player and browser assets do not repeat.
- Review stopping rule: the complete initial review and first confirmation are
  collected. Discussion3887901456 is a new blocking availability/idempotency
  boundary, so one confirmation of this exact remediation is permitted; no
  speculative extra round follows.

## Rollback or recovery

Disable distributed Engagement limiting, retaining the compatible local shield,
or restore the prior Engagement/Discovery artifacts. Let limiter keys expire; do
not scan or flush Redis. No PostgreSQL rollback, event replay, profile change,
media action or retained-project reset is required.

## Documentation updates

ADR-0039, Redis/GraphQL architecture, Engagement and Discovery service docs,
runbooks, Phase 10 evidence/index, roadmap and repository memory.

## Completion checklist

- [x] Requirements satisfied in implementation and focused contracts
- [x] Local non-Docker candidate tests pass
- [ ] Evidence captured
- [x] Documentation current
- [ ] `.ai/` state updated
- [ ] Remaining risks recorded
