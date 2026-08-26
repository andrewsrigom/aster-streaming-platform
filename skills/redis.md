# Skill: Redis

## Purpose

Use Redis deliberately for latency and coordination without making system correctness depend on accidental cache behavior.

## Authority rule

PostgreSQL or another approved durable store owns product truth. Redis entries can expire, disappear, be evicted, be stale, or become unavailable.

Every Redis-backed capability must define behavior for:

- hit;
- miss;
- stale value;
- malformed value;
- timeout;
- connection failure;
- partial command execution;
- failover;
- eviction;
- key-version change.

## Cache design record

For each cache, document:

- owner;
- key pattern;
- value schema and version;
- source of truth;
- TTL;
- TTL jitter;
- maximum size;
- invalidation trigger;
- consistency expectation;
- negative-caching policy;
- stampede protection;
- degraded behavior;
- metric names;
- personal-data classification.

## Cache patterns

Use the simplest pattern that meets the requirement:

- cache-aside for derived catalog reads;
- event invalidation for known mutations;
- short negative cache for repeated valid misses;
- stale-while-revalidate for optional home rails;
- local bounded LRU in front of Redis only for measured hot-key pressure;
- versioned keys for safe schema changes.

Never use `KEYS` in runtime paths. Avoid large values and unbounded sets.

## Stampede protection

Use two layers:

1. in-process request coalescing for concurrent requests on one instance;
2. a short Redis lease for cross-instance refresh ownership.

A lease must use:

- unique ownership token;
- atomic acquire with expiry;
- compare-and-delete release;
- bounded wait;
- fallback to stale data or source read;
- metrics for contention and refresh duration.

Do not use a Redis lease for irreversible durable writes unless the durable resource validates a fencing token.

## Rate limiting

Select the algorithm based on required semantics:

- fixed window for coarse protection;
- sliding window for smoother fairness;
- token bucket for bursts with a sustained rate;
- concurrency semaphore for expensive operations.

Define identity partition, anonymous fallback, trusted proxy handling, failure behavior, and response metadata.

## Concurrency

Use atomic Lua scripts or transactions when a decision depends on multiple Redis operations. Keep scripts small, deterministic, and tested.

For playback progress, Redis may absorb or coalesce updates, but durable ordering and idempotency remain enforced by the Engagement context.
