# ADR-0037: Fence Catalog cache reuse with current owner state

- Status: Accepted
- Date: 2026-08-29
- Owners: Catalog and Platform
- Requirements: P10-R01, P10-R02, P10-R03, P10-R05, P10-R06, P10-R07, P10-R10

## Decision

Cache only Catalog public `Title` projections loaded by identifier. Do not cache
browse ordering, rights records, publication commands, Playback authority or
Discovery ordering. PostgreSQL remains the current-visibility authority. Before a
positive cache value is returned, Catalog reads a compact fence containing the
title ID, title version, rights revision and publication ID under the current
rights-use policy. A value is reusable only when its schema and complete fence
equal that owner result. This lightweight check intentionally remains on cache
hits: Redis reduces full candidate reads and projection work but never decides
that retired or expired content is public.

Use these versioned key families without Redis Cluster hash-tag braces:

```text
aster:{environment}:catalog:public-title:v1:{titleId}:{titleVersion}:{rightsRevision}:{publicationId}
aster:{environment}:catalog:public-title-absent:v1:{titleId}
aster:{environment}:catalog:public-title-lease:v1:{sha256(cacheKey)}
```

Here the braces describe variables, not literal key characters. Environment and
identifiers are validated before key construction. Keys are at most 256 UTF-8
bytes. The positive value is a schema-v1 JSON envelope with the exact fence,
cache time and already-projected public title. It is at most 16 KiB and contains
no raw rights record, credential, profile data, signed media URL or private
metadata. Unknown fields, wrong versions, non-finite values, mismatched IDs or
oversized/malformed bytes and non-string Redis values are misses; delete only
that exact key best-effort. The Redis-side bounded read checks the key type and
size before returning value bytes, so wrong-type or oversized values never enter
the application parser.

Positive entries expire after 120 seconds plus deterministic 0–30 second jitter
derived from SHA-256 of the full key. A valid UUID that has no current public
candidate may use a negative marker for 5 seconds plus deterministic 0–5 second
jitter. This can briefly preserve public absence after a new publication but can
never expose an ineligible title. Its expiry is the explicit and only consistency
boundary, so a new publication becomes discoverable through this entity path no
later than ten seconds after an earlier valid absence read. Versioned positive
keys need no global invalidation and expire naturally. Never scan keys.

## Refresh coordination

Within one process, at most 128 distinct cold keys may own shared refresh work.
This bound covers both exact positive-fence projections and negative-key owner
fence lookups. Fence work is shared only when title ID, request time and rights-use
policy are identical; calls on opposite sides of a visibility boundary cannot
reuse one another's PostgreSQL decision. Concurrent identical cold or expired
absence checks share one fence read before a negative marker is written.
The first request creates work with its own finite deadline; later callers attach
as waiters and retain independent cancellation. A cancelled caller stops waiting
without aborting work still used by another caller. Settled work is removed. When
the map is full, a request loads the source directly instead of allocating an
unbounded entry.

Across processes, acquire a two-second Redis lease with `SET NX PX` and a random
128-bit token. A loser waits at most 25 milliseconds, checks the cache once, then
loads the authoritative source if necessary. Release uses one atomic Lua
compare-and-delete operation; a client never deletes another holder's lease.
The same lease protocol surrounds a cold negative-key fence read, so an owner
that confirms absence publishes the short marker before releasing its lease.
Lease expiry, holder failure and duplicate refresh are safe because refresh only
writes a disposable derivation. There is no retry loop and no lease authorizes a
durable operation.

## Failure and measurements

Redis is an optional non-critical Catalog dependency. Timeout, abort, capacity
rejection, reconnect, malformed bytes, eviction or lease loss bypasses to
PostgreSQL within the existing request deadline. PostgreSQL failure keeps the
existing unavailable/cancelled result; cached data cannot replace the owner
fence. If a fence changes between its check and the full candidate read, the
exact source result must match the fence or perform one bounded re-check rather
than cache mismatched data.

Record finite-label counters/histograms for hit, miss, negative hit, malformed,
bypass, full source load, fence change, refresh amplification, coalesced waiter,
lease acquired/contended/lost, payload bytes and latency. Labels may identify the
fixed cache family, outcome and bounded waiter bucket only; never use title ID,
cache key, query text or correlation ID as a metric label.

## Consequences and alternatives

The design preserves immediate retirement/rights safety and cuts expensive
candidate transfer/projection on hits, but it does not eliminate the compact
PostgreSQL fence query. Pure event invalidation was rejected because missed or
delayed delivery could expose retired content. Caching browse pages was rejected
because ordering and membership invalidate broadly. Serving positive values
without a fence was rejected because TTL alone is not an acceptable rights
boundary. Redis transactions or distributed locks were rejected because duplicate
cache refresh is harmless and must not become durable coordination.

Rollback disables the optional cache and restores compatible prior binaries.
Existing versioned entries expire without a flush. PostgreSQL, rights, media,
events and public contracts remain unchanged.
