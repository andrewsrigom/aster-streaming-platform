# Phase 10 Evidence Index

Status: Catalog cache and Discovery stale cache are released through protected
review, squash and exact-main CI. Phase 10 stays open only for the
operation-limiter closeout.

## Active slice

P10-R01/R02/R03/R05/R06/R07/R10 implements a rights-safe Catalog public-title
cache. [ADR-0037](../../docs/adr/0037-rights-safe-catalog-cache.md) defines the
PostgreSQL fence, bounded key/value/TTL contract, negative cache, process
coalescing, tokenized lease, degraded behavior and finite measurements.

P10-R04 adds a bounded stale-while-revalidate cache to the Discovery public-home
read model. [ADR-0038](../../docs/adr/0038-bounded-discovery-home-stale-cache.md)
defines its twelve key variants, 16-KiB envelope, age and visibility bounds,
background lifecycle, explicit stale client shape and PostgreSQL fallback.

P10-R08/R09/R10/R11/R12 add account-partitioned Engagement write admission and
a search-only Discovery bulkhead. [ADR-0039](../../docs/adr/0039-operation-admission-and-redis-degradation.md)
defines the atomic server-time Redis bucket, bounded local degraded mode,
two-active/one-waiter search policy, finite telemetry and durable-state boundary.

## Candidate artifacts

- [Contract](catalog-cache-contract.txt): focused/static suites and complete
  affected candidate gate.
- [PostgreSQL](catalog-cache-postgres.txt): current fence, exact source and stale
  dispute behavior.
- [Runtime](catalog-cache-runtime.txt): real Redis expiry, negative reuse, outage,
  metrics and exact cleanup.
- [Concurrency](catalog-cache-concurrency.txt): cold-key amplification, warm
  reuse, cross-instance lease contention and compare-delete safety.
- [Catalog release](catalog-cache-release.txt): protected exact-head acceptance,
  confirmation, squash and exact-main CI.
- [Discovery contract](discovery-swr-contract.txt): focused Discovery, GraphQL,
  Web and telemetry contract proof.
- [Discovery Redis](discovery-swr-redis.txt): real bounded Redis behavior, stale
  bursts, recoverable lease contention, outage fallback and exact cleanup.
- [Discovery runtime](discovery-swr-runtime.txt): real PostgreSQL/Router runtime,
  non-critical Redis outage behavior, isolation/restart and exact cleanup.
- [Discovery browser](discovery-swr-browser.txt): stale rails and visible refresh
  warning pass 1/1 through the production Web client; byte-identical source and
  the rebased candidate gate support carry-forward.
- [Discovery release](discovery-swr-release.txt): protected exact-head acceptance,
  clean confirmation, squash and exact-main CI.
- [Operation-limiter contract](operation-limiters-contract.txt): focused suites,
  finite policy boundaries, cross-replica admission correction and the complete
  73/73 local candidate gate.
- Operation-limiter Redis, PostgreSQL and release artifacts require one protected
  repeat after the shared Redis admission-marker correction.

Every artifact records the exact implementation commit, environment, command,
workload, raw result, interpretation and limitations. Catalog has release
evidence; both cache slices now have release evidence.

Initial hosted review comment 3886890023 found one measurement boundary: an
oversized projection bypassed storage but supplied a payload sample above the
telemetry contract. Reviewed implementation
`374686844853a8d1f3cfb75f0b3d1ce7f1c08c88` retains the bypass outcome without
the invalid size sample. Confirmation comments3886917843/44/46 then found a
pre-rejection Redis GET allocation, whole-batch coalescing and the same metric
boundary for corrupt reads. Corrected exact
`2a9b86c221180f2df8caf74f66d9a2495c794888` performs a bounded Redis-side read,
shares hot titles across mixed batches and preserves finite malformed telemetry.
Catalog242/242, Redis17/17 and affected73/73 pass. Because Redis wire and
coalescing behavior changed, both real Redis and PostgreSQL fixtures were
repeated at that exact commit and pass with cleanup0.

Protected run33260411345 passed at b65688b, but final-confirmation discussion
3886966492 found that cold negative misses reached the owner fence before either
coordination boundary. Corrected exact
`62afee15240ab1d197aac84b4d63e1a0e1dce382` coalesces each negative key in process
and leases it across instances before querying the owner. Catalog243/243,
affected73/73 and repeated Redis/PostgreSQL fixtures pass; corrected protected CI
and confirmation remain pending.

Corrected confirmation discussions3887086778/82 found that concurrent fence work
could cross a request-time visibility boundary and Redis wrong-type keys bypassed
malformed cleanup. Exact `2930332e7b1c049c081bfad8c5d62c71009f03bf` scopes
fence coalescing by title, time and policy, and classifies non-string Redis keys
inside the bounded script. Catalog244/244, Redis17/17 and the complete affected
73/73 gate pass. Real PostgreSQL and Redis fixtures pass with exact cleanup;
Redis additionally proves `wrongTypeDeleted=true`.

Latest confirmation discussion3887146000 found that an exact absence marker
without bounded Redis expiry could survive beyond the ten-second consistency
contract. Exact `f50acbb7cbb26cef480b0bb87018510660da48ca` timestamps negative
envelopes and deletes missing, future or over-age values before owner recheck.
Catalog245/245 and affected73/73 pass. Repeated real Redis proves
`unboundedNegativeDeleted=true`; the complete PostgreSQL fixture also passes with
cleanup0.

Protected run33265036497 passed exact `4afe12f`, but its exact-head review
discussion3887201296 found that coalesced waiter buckets included the refresh
owner and shifted every measurement. Exact `6088bf8` counts only attached
callers for both fence and positive refreshes. Catalog245/245 and affected73/73
pass. Real fixtures were not repeated because cache bytes, Redis wire, source
coordination, visibility and failure behavior are unchanged.

Exact-head review discussion3887242213 then found that a bounded control-byte
string was rejected as an invalid vendor reply before Catalog could delete the
malformed envelope. Exact `997ef27` accepts only its bounded transport shape and
leaves semantic parsing to Catalog. Redis17/17, Catalog245/245, affected73/73 and
the repeated real Redis fixture pass; `controlValueDeleted=true` and cleanup0.

Protected run `33266926624` passed exact `edf7bc8`, but exact-head discussions
`3887280597`/`3887280599` found that malformed lease keys could contend permanently and an
entry with no active caller could be reattached while sibling work remained yet
record the second waiter bucket. Exact
`d93afbcc8bf87f71dc926c9010c2180820aeccfb` adds bounded atomic type/expiry lease
recovery and separates monotonic attachment counts from active cancellation
waiters. Redis17/17 and Catalog246/246 pass. Repeated real Redis proves
non-expiring and wrong-type lease recovery, one Catalog-path cross-instance
negative fence read and cleanup 0. After one unrelated Identity terminal-fallback
timing failure, focused Identity passed 147/147 and the concurrency-capped affected
gate passed 73/73 with 59 cached in 90.953 seconds. Hosted gates remain.

Protected run `33268669701` passed exact `d05dad3`, but exact-head discussion
`3887360355` found that invalid UTF-8 could expand after the Redis-side byte bound
and reset the shared connection. Exact
`ce97596794c05bdd5b92fb9a75dde2a9e4be159f` keeps the Lua reply binary through
the raw 16 KiB validation and applies fatal UTF-8 decoding. Redis 17/17, Catalog
246/246 and affected 73/73 pass with 50 cached in 126.735 seconds. The repeated
real Redis fixture seeds 16 KiB of invalid bytes and proves malformed rejection,
a live connection probe, exact deletion and cleanup 0. Corrected hosted gates remain.

Exact-head discussion `3887423663` then found that a finite lease TTL above the
requested two-second policy remained contended for its full duration. Exact
`f014ebe2534f7c151020e46912cf2e7d9161ac81` compares the atomic remaining TTL
with that requested window and replaces longer-lived contamination. Redis17/17,
Catalog246/246 and repeated real Redis pass with a seeded 24-hour lease recovered
and cleanup0. The complete affected gate passes73/73 with51 cached in107.438
seconds. At that checkpoint, corrected hosted gates remained. PR37 exact
`cb86c37` later passed run33270889083 and confirmation comment5464418106,
squash-merged as `903f7b4`, and exact-main run33272501078 passed.
