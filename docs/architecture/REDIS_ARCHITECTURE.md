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

Pattern: cache-aside with event invalidation.

- Source: Catalog PostgreSQL
- TTL: minutes, with jitter
- Negative cache: short for valid missing IDs
- Consistency: publication changes invalidate immediately through local write path and event
- Failure: read PostgreSQL directly
- Stampede: in-process coalescing plus short Redis lease
- Metrics: hit, miss, stale, bypass, refresh, error, payload bytes

## Discovery rails

Pattern: stale-while-revalidate.

- Stable editorial rails may serve a bounded stale value.
- One holder refreshes across instances.
- If refresh fails and stale data exists within maximum stale age, serve stale and mark degradation.
- If no acceptable value exists, return a smaller stable fallback.
- Redis outage causes source read or fallback according to rail type.

## Continue-watching

The durable source is Engagement PostgreSQL. A cached assembled response may exist for low latency.

Progress mutation invalidates or version-bumps the cache. Cache loss causes reconstruction. No accepted progress exists only in Redis.

## Rate limiting

Use distinct policies:

- anonymous browse;
- authenticated queries;
- mutations;
- playback-session creation;
- progress reporting;
- operator operations;
- media-processing administration.

A token-bucket or sliding-window Lua script returns allowed state and retry metadata atomically.

Fail-open or fail-closed is chosen per operation:

- public catalog browse may fail open with local emergency bounds;
- operator mutations fail closed;
- playback session uses a conservative local limit if Redis is unavailable;
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
