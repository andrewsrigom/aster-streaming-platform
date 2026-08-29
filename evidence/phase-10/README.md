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
