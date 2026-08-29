# Phase 10 Evidence Index

Status: local candidate evidence complete; hosted review, protected CI, merge and
exact-main acceptance remain. No Phase 10 requirement is released yet.

## Active slice

P10-R01/R02/R03/R05/R06/R07/R10 implements a rights-safe Catalog public-title
cache. [ADR-0037](../../docs/adr/0037-rights-safe-catalog-cache.md) defines the
PostgreSQL fence, bounded key/value/TTL contract, negative cache, process
coalescing, tokenized lease, degraded behavior and finite measurements.

## Candidate artifacts

- [Contract](catalog-cache-contract.txt): focused/static suites and complete
  affected candidate gate.
- [PostgreSQL](catalog-cache-postgres.txt): current fence, exact source and stale
  dispute behavior.
- [Runtime](catalog-cache-runtime.txt): real Redis expiry, negative reuse, outage,
  metrics and exact cleanup.
- [Concurrency](catalog-cache-concurrency.txt): cold-key amplification, warm
  reuse, cross-instance lease contention and compare-delete safety.

Every artifact records the exact implementation commit, environment, command,
workload, raw result, interpretation and limitations. They support the local
candidate only; release requires the remaining hosted gates.

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
