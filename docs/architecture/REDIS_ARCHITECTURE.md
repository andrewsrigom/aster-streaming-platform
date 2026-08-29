# Redis Architecture

## Role

Redis improves latency, absorbs bursts, and coordinates bounded refresh work. It is not the durable authority for accounts, rights, titles, publications, sessions that require recovery, progress, watchlists, or history.

## Key namespaces

```text
aster:{env}:{owner}:{capability}:v{schema}:{identity}
```

Examples:

```text
aster:prod:catalog:title:v1:{titleId}
aster:prod:discovery:rail:v2:{rail}:{locale}
aster:prod:engagement:continue:v1:{profileId}
aster:prod:platform:ratelimit:v1:{partition}
aster:prod:catalog:lease:v1:{cacheKeyHash}
```

Braces are used only when cluster slot locality is intentional and documented.

Do not put raw emails, access tokens, or signed URLs in keys.

## Catalog cache

Pattern: cache-aside with a current-owner fence and bounded expiry.

- Source and visibility authority: Catalog PostgreSQL
- Scope: public-title entity projections only; browse ordering and Playback
  authority are not cached
- Positive reuse: only after the current owner fence exactly matches title,
  rights, publication and schema versions
- TTL: 120 seconds plus deterministic 0–30 second jitter
- Negative cache: 5 seconds plus 0–5 second jitter for a valid UUID absent from
  the current public resource set; its schema-v1 envelope records cache time and
  rejects missing, future or more-than-ten-second-old values, so missing or
  excessive Redis expiry cannot extend the same at-most-ten-second
  public-discoverability boundary
- Consistency: versioned positive keys expire; no scan-based invalidation
- Failure: read PostgreSQL directly
- Stampede: at most 128 process-local owners plus a two-second tokenized Redis
  lease released by atomic compare-and-delete; positive projection refreshes and
  cold negative-key owner-fence reads both enter coordination before their
  expensive source operation; fence sharing also requires identical request time
  and rights-use policy; atomic acquisition replaces non-string, non-expiring or
  longer-than-policy malformed lease keys and preserves finite holders within
  the requested coordination window
- Corruption: the Redis-side read rejects oversized and non-string exact values
  before returning bytes; the client keeps bounded replies binary until strict
  UTF-8 decoding. Invalid encoding is malformed without a connection reset;
  valid strings, including control bytes, reach the strict Catalog envelope
  parser for exact deletion
- Metrics: hit, negative hit, miss, malformed, bypass, source load, fence change,
  coalescing and lease outcomes, bounded attached-caller bucket excluding the
  refresh owner and tracked independently from active cancellation waiters,
  duration and payload bytes

The exact contract and safety trade-off are in
[ADR-0037](../adr/0037-rights-safe-catalog-cache.md). This section describes the
locally verified Phase10 candidate; protected release evidence is still pending.

## Discovery rails

Pattern: stale-while-revalidate.

- Scope: one bounded whole-home page for each valid `first` value; search,
  personalization and Catalog metadata remain uncached
- Freshness: fifteen seconds plus zero-to-five deterministic jitter
- Stale bound: at most sixty seconds from capture and never at/after the earliest
  title visibility expiry
- Coordination: at most twelve process entries and a two-second tokenized lease;
  stale callers return immediately while one lifecycle-owned refresh runs;
  atomic acquisition recovers wrong-type, non-expiring and longer-than-policy
  lease contamination, while coalescing counts attachments separately from
  active cancellation waiters
- Public result: eligible cache fallback uses the existing `STALE` code with page
  fields; source-projection stale without a cache page keeps null fields
- Failure: Redis outage or an ineligible value executes the PostgreSQL source;
  refresh failure cannot extend the stale boundary

[ADR-0038](../adr/0038-bounded-discovery-home-stale-cache.md) defines the exact
envelope, lifecycle and client-shape contract. It is a local candidate until
protected release evidence passes.

## Continue-watching

The durable source is Engagement PostgreSQL. A cached assembled response may exist for low latency.

Progress mutation invalidates or version-bumps the cache. Cache loss causes reconstruction. No accepted progress exists only in Redis.

## Rate limiting

The implemented representative policy limits Engagement viewer writes only:

- `record_progress`: twelve tokens, four tokens/second;
- `set_watchlist`: four tokens, one token/second.

Both use a thirty-second state TTL. Admission follows current Identity account
authorization and exact idempotency replay. The Redis key contains only the
environment, fixed operation and SHA-256 account pseudonym. One server-time Lua
command atomically recovers malformed, wrong-type, future, non-expiring or
excessive-TTL state, consumes integer milli-tokens and returns bounded decision
metadata. A 1,024-partition local shield applies first; its rejection avoids a
Redis command, while Redis outage can use only a locally admitted decision.
Redis never authorizes or acknowledges the durable mutation. Exact behavior and
trade-offs are in [ADR-0039](../adr/0039-operation-admission-and-redis-degradation.md).

Future phases may select distinct policies for:

- anonymous browse;
- authenticated queries;
- mutations;
- playback-session creation;
- progress reporting;
- operator operations;
- media-processing administration.

Fail-open or fail-closed remains an operation-owned choice:

- public catalog browse may fail open with local emergency bounds;
- operator mutations fail closed;
- current Engagement viewer writes use the documented bounded local fallback;
- playback-session policy remains future work;
- GraphQL cost and concurrency limits still apply regardless of Redis.

## Request coalescing

Within one process, concurrent identical cache misses share one promise. The coalescing map:

- has a maximum size;
- removes settled promises;
- observes cancellation carefully;
- does not let one caller cancel work still needed by others;
- records waiter count.

Across instances, the Redis lease reduces duplicate refreshes. Callers never wait indefinitely for a lease holder.

## Lock safety

A Redis lease is sufficient for cache refresh because duplicate refresh is acceptable.

It is not sufficient by itself for:

- publishing a media version;
- charging;
- deleting durable data;
- assigning a unique durable sequence;
- any irreversible external side effect.

Those operations use PostgreSQL constraints, row locks, advisory locks, or durable fencing.

## Hot keys

Measure before adding complexity.

Mitigation order:

1. shorten payload and computation;
2. in-process bounded cache;
3. request coalescing;
4. replica reads where consistent;
5. shard derived values;
6. precompute at the edge when valid.

## Memory and eviction

Every key family has estimated cardinality and value size. Hosted Redis uses an eviction policy compatible with non-authoritative data. Alert before sustained memory pressure causes widespread churn.

Large or unbounded structures are prohibited.

## Failure modes

- timeout: bypass or fallback within request deadline;
- connection storm: shared clients and reconnect backoff;
- stale entry: schema version and maximum stale age;
- malformed value: delete and rebuild, record metric;
- failover: tolerate transient command errors;
- eviction: rebuild;
- split coordination: rely on durable owner for correctness.
