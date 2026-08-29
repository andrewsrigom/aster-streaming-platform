# Phase 10 Evidence Index

Status: implementation active; no Phase 10 requirement is verified yet.

## Active slice

P10-R01/R02/R03/R05/R06/R07/R10 implements a rights-safe Catalog public-title
cache. [ADR-0037](../../docs/adr/0037-rights-safe-catalog-cache.md) defines the
PostgreSQL fence, bounded key/value/TTL contract, negative cache, process
coalescing, tokenized lease, degraded behavior and finite measurements.

## Planned artifacts

- `catalog-cache-contract.txt`: focused/static and real Redis command behavior.
- `catalog-cache-postgres.txt`: current-fence and source-race behavior.
- `catalog-cache-runtime.txt`: hit/miss/malformed/outage and exact cleanup.
- `catalog-cache-concurrency.txt`: cold-key amplification, lease contention and
  compare-delete safety.

Every measured artifact will record exact commit, environment, command, workload,
raw result, interpretation and limitation. Planned names are not evidence.
