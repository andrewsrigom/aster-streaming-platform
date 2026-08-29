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
the invalid size sample. Catalog240/240 and the repeated73/73 affected gate pass;
the recorded PostgreSQL/Redis experiments remain applicable because no fence,
wire, TTL, lease, outage or concurrency behavior changed.
