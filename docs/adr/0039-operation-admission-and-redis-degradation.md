# ADR-0039: Bound operation admission and Redis degradation

- Status: Accepted
- Date: 2026-08-29
- Owners: Engagement, Discovery and Platform
- Requirements: P10-R08, P10-R09, P10-R10, P10-R11, P10-R12

## Context

Aster already applies coarse process-local request rate and concurrency limits.
Those controls bound one process but do not partition repeated viewer writes,
coordinate replicas or isolate expensive Discovery search from home rails. Redis
must demonstrate atomic rate decisions and degraded operation without becoming
durable authority. Phase 10 owns the reusable primitive and representative
policies; Phase 13 still owns final public Router/proxy identity and workload
calibration.

## Decision

### Engagement write rate

Limit the existing `record_progress` and `set_watchlist` operations after current
Identity owner authorization. Before receipt inspection and rate admission, a
process-local queue serializes each authorized account/profile/idempotency key.
It holds at most 1,024 active keys and 31 waiters per key, propagates waiter
cancellation, and returns `BACKPRESSURE` at capacity. That queue prevents one
process from charging a concurrent same-key burst repeatedly. It does not
coordinate replicas, so the shared Redis decision also receives a SHA-256 digest
of operation, authorized account, profile, idempotency key and the canonical
request digest. Its atomic finite
marker makes another replica reuse the first allowed admission without consuming
another token. PostgreSQL receipt and aggregate locking still serialize the
durable effect. The rate partition is the authorized account, not the untrusted
profile argument or raw session cookie. SHA-256 pseudonyms are used only in
bounded local maps and short-lived Redis keys; they are never logged or used as
metric attributes.

Use these versioned key families without literal Redis Cluster hash-tag braces:

```text
aster:{environment}:engagement:rate:v2:record_progress:{accountDigest}:bucket
aster:{environment}:engagement:rate:v2:record_progress:{accountDigest}:admission:{admissionDigest}
aster:{environment}:engagement:rate:v2:set_watchlist:{accountDigest}:bucket
aster:{environment}:engagement:rate:v2:set_watchlist:{accountDigest}:admission:{admissionDigest}
```

The representative Phase 10 policies are:

| Operation | Capacity | Refill | Cost | State TTL |
|---|---:|---:|---:|---:|
| `record_progress` | 12 tokens | 4 tokens/second | 1 | 30 seconds |
| `set_watchlist` | 4 tokens | 1 token/second | 1 | 30 seconds |

One small Lua command uses Redis server `TIME`, integer milli-tokens, one bucket
envelope and one admission marker. It validates type, version, token range,
timestamp and remaining TTL; missing, malformed, wrong-type, future,
non-expiring or longer-than-policy bucket state is replaced atomically by a full
current bucket before the present cost is applied. A first allowed decision
writes both values with the policy TTL. A valid existing admission marker returns
the original bounded decision snapshot without changing the bucket or refreshing
the marker. A rejected decision creates no marker, so a later attempt may be
admitted after refill. The reply contains only allowed/rejected, remaining whole
tokens, retry-after milliseconds, reset milliseconds, recovery and
deduplication state. All inputs and replies are bounded by the shared adapter.
Superseded v1 bucket keys expire naturally.

### Local outage and hot-key shield

Each Engagement process keeps at most 1,024 account-operation buckets with the
same policies and a finite idle lifetime. JavaScript's synchronous state update
decides local admission before awaiting Redis. A local rejection sends no Redis
command, limiting command amplification for one hot account. A local acceptance
then asks Redis for the cross-instance decision. A successful Redis rejection is
authoritative for that attempt.

If Redis times out, disconnects, reaches adapter capacity or is unavailable, an
already accepted local decision is the explicit degraded result and the owner
operation may continue. During that outage, total capacity can scale with the
number of healthy Engagement processes; it remains bounded per process. If the
local partition map cannot represent a new active partition, Redis may still
decide it, but Redis failure rejects that attempt rather than becoming an
unbounded bypass. Caller cancellation never falls back to allow.

`LIMIT_EXCEEDED` is added to the two Engagement mutation result enums. Their
payloads add nullable `retryAfterMs`, bounded to 1–30,000 ms and selected by the
first-party operations. A private `Retry-After` header remains supplemental; the
public result does not depend on Apollo Router forwarding subgraph headers. A
limited response performs no later owner call, transaction, receipt or outbox
write. A successful Redis decision never authorizes or acknowledges
progress/watchlist; PostgreSQL and existing owner checks remain decisive.

### Discovery search concurrency

After trust and operation-shape validation, `search_titles` alone enters a local
bulkhead with two active permits, one FIFO waiter and a 100-millisecond maximum
wait. Queue overflow, expiry, caller cancellation and closure settle explicitly.
Home rails and schema reads do not enter or wait for the search lane. Shutdown
closes admission, rejects waiters and drains active GraphQL work through the
existing lifecycle. Overflow and queue expiry use the additive
`DiscoverySearchCode.LIMIT_EXCEEDED` payload with a null connection over a normal
GraphQL response, so Router preserves the public result instead of translating a
private HTTP 429 into a generic subgraph error.

### Telemetry and privacy

Record finite operation-limit outcomes and duration using only the fixed limiter
kind, operation and outcome vocabularies. Queue depth is bucketed. Never label a
metric or log with the Redis key, account/profile pseudonym, credential, query,
correlation ID, timestamp or retry value. Redis dependency telemetry continues to
record bounded command outcomes.

## Consequences

- Concurrent replicas share one atomic rate decision while one hot caller is
  shed locally before repeated Redis commands.
- Concurrent identical retries split across replicas charge the account-operation
  bucket once during the finite admission window, while distinct idempotency keys
  or payloads remain independent rate attempts, including after a rejected owner
  result that creates no receipt. Local same-key ordering excludes the payload
  digest so changed requests still observe a committed receipt conflict.
- Concurrent same-key work inside one process reaches receipt/rate admission in
  order, preventing identical retries from multiplying token use.
- Redis loss degrades distribution accuracy, not durable progress correctness or
  service readiness.
- Owner authorization still executes before rate admission, so this policy
  protects Engagement's later dependencies and writes rather than replacing
  edge/network abuse controls.
- Search saturation cannot occupy every Discovery execution slot, and its queue
  has finite memory and latency.
- Additive result enums and nullable retry fields require regenerated Federation
  artifacts and first-party operations but preserve existing clients.

## Alternatives considered

### Partition by profile argument or raw cookie

Rejected because an untrusted profile can be rotated and credentials must not be
stored in Redis keys. Current owner authorization supplies the account partition.

### Fail every viewer write closed when Redis is unavailable

Rejected because Redis is non-authoritative and ordinary playback progress may
remain safely available under a bounded local policy. Operator-sensitive controls
may choose fail-closed behavior in their owning future design.

### Bypass all limits on Redis failure

Rejected because an outage or adapter-capacity event would remove the hot-path
bound precisely when dependencies need protection.

### One Redis semaphore for search

Rejected for this phase. Search pressure is process/database local, the current
deployment has one Discovery instance, and a finite local bulkhead proves the
required queue behavior without adding distributed lease-release failure modes.
Phase 14 may revisit replica-wide capacity from measured deployment pressure.

### Hold a PostgreSQL lock while asking Redis

Rejected because a non-authoritative network call must not extend an
authoritative transaction or database lock. PostgreSQL continues to serialize
the receipt and effect only after the disposable admission decision.

### Shard limiter keys or add a Redis cluster

Rejected without measured infrastructure pressure. One atomic command, local
hot-key shedding, finite TTL and measured contention are the first response.

## Rollback

Disable distributed Engagement limiting and retain the compatible local shield,
or restore the previous Engagement/Discovery artifacts. Let v1 and v2 limiter
keys expire naturally. No Redis scan/flush, PostgreSQL migration, event replay,
media action or user-data deletion is required.
