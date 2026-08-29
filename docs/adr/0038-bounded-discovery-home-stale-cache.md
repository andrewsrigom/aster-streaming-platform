# ADR-0038: Bound Discovery home stale-while-revalidate

- Status: Accepted
- Date: 2026-08-29
- Owners: Discovery and Platform
- Requirements: P10-R01, P10-R04, P10-R05, P10-R06, P10-R07, P10-R10

## Decision

Cache only the existing Discovery `homeRails` result, keyed by environment and
the validated `first` value. Search pages, Catalog browse/entity data,
personalization and Engagement progress remain outside this cache. Discovery
PostgreSQL stays the ordering source; Catalog continues to resolve every
federated title reference under current publication and rights policy.

Use this versioned key without Redis Cluster hash-tag braces:

```text
aster:{environment}:discovery:home:v1:{first}
```

Here the braces describe variables, not literal key characters. The environment
and `first` value are validated before key construction. There are at most twelve
page variants. A schema-v1 JSON envelope contains the exact `first`, capture time,
refresh boundary, stale boundary and bounded home page. It is at most 16 KiB and
contains public title identifiers plus projection timing only. It contains no
query text, profile/progress data, rights record, credentials, token, media URL or
Catalog metadata.

Admit only a completed page whose fixed rail codes are `COMPLETED`, `EMPTY` or
`FALLBACK` and whose genre result is `COMPLETED` or `EMPTY`. Validate every rail,
source, generation, identifier, timestamp, edge count and aggregate code on read.
Unknown fields, duplicate titles, malformed JSON, impossible derived timestamps
and oversized bytes are misses and delete only the exact key best-effort.

## Freshness and public contract

A captured page is fresh for fifteen seconds plus deterministic zero-to-five
second jitter derived from SHA-256 of the key. Its absolute stale limit is sixty
seconds after capture, shortened to the earliest cached edge `visibleUntil`.
Physical Redis expiry may add deterministic zero-to-ten second cleanup jitter,
but envelope time and title visibility always decide serving. No page is served
at or after either stale boundary.

A fresh hit returns the existing page without PostgreSQL. An eligible stale hit
returns immediately with the existing aggregate GraphQL code `STALE` and the
existing nullable page fields populated, then starts refresh. Source projection
stale without an eligible cached page retains the existing legal `STALE` response
with null page fields. No schema field or enum is added. Strict clients accept
exactly these two shapes; the Web keeps stale rails usable and shows a bounded
refresh notice.

## Refresh coordination and lifecycle

Within one process, each exact page key may own one shared refresh. At most twelve
entries exist. Cold callers wait on that shared work with independent
cancellation; a cancelled caller does not abort work still required by another.
Before a caller accepts shared source work, Discovery rechecks that the result was
not generated in its future and that every returned title remains visible at the
caller's own request time. A caller crossing that boundary executes a new owner
read instead of reusing the earlier result.
Stale callers do not wait. The first stale caller starts detached refresh and
later refresh requests attach without creating more work. Coalescing telemetry
counts only attachments behind the owner and tracks that monotonic count
separately from active cancellation waiters. Shared work has a 1.5-second
deadline and settled entries are removed.

Across instances, refresh uses the shared tokenized Redis lease: a two-second
atomic acquisition, random 128-bit token and compare-and-delete release. The
acquisition preserves string holders whose remaining TTL is inside the requested
window and replaces wrong-type, non-expiring or longer-lived contamination with
the caller's finite lease. A cold loser waits once for 25 milliseconds and checks
the page again before source fallback. A stale loser keeps serving the
already-eligible snapshot and starts no request wait loop. Lease loss or
duplicate source reads are safe because they write only a disposable validated
projection.

Background work belongs to the Discovery service lifecycle, not the request that
observed stale data. Graceful shutdown stops admission, aborts and drains every
owned refresh before Redis/PostgreSQL closure. Forced shutdown aborts refreshes
and closes Redis within the existing process deadline. No timer or promise is
left as an unbounded owner. Consumer shutdown attempts the cache, GraphQL,
projection, event and readiness closures even if one sibling closure fails.

## Failure and measurements

Redis is optional and non-critical. Timeout, abort, capacity rejection,
reconnect, eviction or malformed data executes the existing PostgreSQL home use
case. A rejected cache write cannot replace a completed owner response. Redis
readiness is reported separately and never changes Discovery's
critical readiness. If source refresh fails while stale data remains eligible,
later requests may continue to use that same bounded value; without eligible
stale data the existing unavailable, cancelled or indeterminate result is
returned.

Record finite-label cache outcomes for fresh hit, stale hit, miss, malformed,
bypass, source load, refresh failure, coalesced waiter and lease
acquired/contended/lost, plus duration and admitted payload bytes. Labels may
contain only the fixed cache family, outcome and bounded waiter bucket. Never use
key, title/profile ID, query, correlation ID, error or timestamp as a metric
label.

## Consequences and alternatives

This design removes four PostgreSQL selections on a fresh hit and bounds stale
latency during transient refresh failure, while Catalog entity resolution still
prevents stale Discovery references from exposing retired metadata. Whole-page
caching is accepted because the home contract is already a finite assembled read
model; caching each rail would multiply keys and permit mixed generations.
Caching search pages is rejected because query/cursor cardinality and generation
replacement require a separate policy. Serving beyond a title visibility lease,
using Redis TTL as serving authority and proxying Catalog metadata are rejected.

Rollback disables `ASTER_DISCOVERY_CACHE_ENABLED`, restores compatible Discovery
and Web artifacts and lets versioned keys expire. No scan, flush, migration,
projection rebuild or retained-data deletion is required.
