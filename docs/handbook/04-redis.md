# Redis in Aster

## Purpose

Redis is valuable because it makes certain reads and coordination decisions fast. It is dangerous when its speed hides unclear authority, unbounded growth, or fragile invalidation.

## 1. Cache-aside

Catalog title flow:

```text
read versioned key
├─ hit → validate schema → return
└─ miss
   → load PostgreSQL
   → serialize bounded value
   → SET with TTL and jitter
   → return
```

Writes update PostgreSQL first. After commit, they invalidate or version-bump cache entries.

### Failure cases

- Redis timeout → read PostgreSQL within remaining deadline;
- malformed value → delete best effort and rebuild;
- PostgreSQL unavailable + valid bounded stale entry → serve stale only if policy allows;
- both unavailable → return classified error.

## 2. Key design

A key communicates environment, owner, capability, schema, and identity:

```text
aster:prod:catalog:title:v1:{titleId}
```

Keep keys predictable but avoid personal information.

Value envelopes can include:

```json
{
  "schema": 1,
  "sourceVersion": 7,
  "generatedAt": "timestamp",
  "payload": {}
}
```

## 3. TTL and jitter

If every popular key has exactly sixty seconds, many keys can expire together.

Jitter example:

```text
effective TTL = base TTL ± bounded random percentage
```

Jitter is not a consistency model. Maximum stale age and invalidation still matter.

## 4. Negative caching

A short cache for a valid missing title can protect PostgreSQL from repeated random IDs.

Do not negative-cache:

- authorization failure as not-found across users;
- dependency failure;
- malformed input;
- a state expected to appear immediately without read-your-write handling.

## 5. Stale-while-revalidate

Discovery rails tolerate bounded staleness:

```text
fresh → return
stale but acceptable → return stale and refresh once
too old or missing → wait within deadline or use fallback
```

Store fresh and maximum-stale deadlines separately or derive them unambiguously.

Expose when stale data was served.

## 6. Request coalescing

One process can share one refresh promise:

```ts
const inflight = new Map<string, Promise<unknown>>()

export async function singleFlight<T>(
  key: string,
  load: () => Promise<T>
): Promise<T> {
  const existing = inflight.get(key) as Promise<T> | undefined

  if (existing) {
    return existing
  }

  const created = load().finally(() => {
    inflight.delete(key)
  })

  inflight.set(key, created)
  return created
}
```

Production code adds a map limit, telemetry, error isolation, and cancellation semantics.

## 7. Cross-instance refresh lease

Acquire:

```text
SET leaseKey token NX PX leaseMs
```

Release only if still owner:

```lua
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
end

return 0
```

The lease prevents duplicate refresh most of the time. It does not guarantee durable mutual exclusion after expiry or network uncertainty.

For cache refresh, duplicate work is acceptable. For publication, use PostgreSQL authority.

## 8. Cache stampede experiment

Workload:

- one popular missing or expiring key;
- multiple application instances;
- concurrent burst;
- source query counter.

Compare:

1. no protection;
2. TTL jitter;
3. in-process coalescing;
4. coalescing plus lease;
5. stale-while-revalidate.

Measure:

- source queries;
- request latency;
- errors;
- waiters;
- lease contention;
- Redis operations;
- database saturation.

## 9. Rate limiting

### Token bucket concept

State:

- current tokens;
- last refill time.

Atomic script:

1. calculate refill from elapsed time;
2. cap at capacity;
3. consume if enough tokens;
4. store state with expiry;
5. return allowed, remaining, and retry time.

Partition keys must represent trusted identity. Anonymous limits use validated client network context behind known proxies, not arbitrary forwarded headers.

## 10. Concurrency semaphore

Rate limits control operations over time. A semaphore controls operations at once.

Use a semaphore for expensive search, media administration, or refresh work where ten concurrent calls are safe but one hundred are not.

Expiration and owner tokens are necessary so crashed holders do not leak capacity indefinitely.

## 11. Hot keys

A very popular rail may stress one Redis shard even with a high hit rate.

Measure command rate and latency first.

Possible responses:

- local bounded cache;
- edge caching;
- smaller values;
- precomputed variants;
- key sharding for counters;
- replicas;
- removing unnecessary reads.

## 12. What Redis must not hide

- slow unindexed source queries;
- unbounded home responses;
- incorrect authorization;
- publication races;
- loss of durable progress;
- missing capacity limits.

A fast cache around a broken source path delays discovery of the problem.
