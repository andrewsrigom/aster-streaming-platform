# Work Item: Rights-safe Catalog cache-aside

- Status: IN_PROGRESS
- Owner: Catalog; Platform owns the bounded Redis adapter
- Phase: 10
- Requirement IDs: P10-R01, P10-R02, P10-R03, P10-R05, P10-R06, P10-R07, P10-R10
- Created: 2026-08-29
- Updated: 2026-08-29

## Outcome

Repeated public-title entity reads may reuse a bounded Redis projection only
after Catalog PostgreSQL confirms the current publication, rights and title
version. Cold bursts share bounded refresh work. Redis loss or corrupt data
changes latency and source load, never public visibility or durable truth.

## Current behavior

Released main reads Catalog public entities from bounded PostgreSQL transactions
and has no product cache. The active branch contains the locally passing
candidate below; it is not released behavior.

## Proposed behavior

The local candidate adds exact bounded Redis get, set-with-expiry,
conditional-set, delete and atomic compare-and-delete operations. Catalog public
entity reads use a cache port and adapter while browse remains unchanged.
PostgreSQL first returns a compact current-visibility fence; only an exact
versioned cache entry for that fence is reusable. Misses load the source, populate
a positive or valid-absence entry with deterministic TTL jitter, and use bounded
process coalescing plus a tokenized Redis refresh lease. Confirmation found that
Redis reads were bounded only after materialization, mixed batches coalesced by
the whole batch instead of each hot title, and oversized corruption could lose
its malformed metric. Corrected implementation
`2a9b86c221180f2df8caf74f66d9a2495c794888` uses one bounded Redis-side read,
per-title process identities with batched new-title refresh, and finite malformed
observations. Protected CI, final confirmation and release remain pending.
The first final confirmation then found that cold/expired absence checks reached
PostgreSQL before either coalescing boundary. Correction
`62afee15240ab1d197aac84b4d63e1a0e1dce382` gives each exact negative key the
same bounded process sharing and tokenized Redis lease before the owner fence
read; valid positive fence checks and Redis-outage fallback remain unchanged.

## Boundaries

- Owning context: Catalog owns title visibility and every returned field;
  Platform owns Redis transport only.
- Affected services/packages: `services/catalog`, `packages/redis`, local Compose,
  operations documentation and Phase 10 evidence.
- Authoritative data: Catalog PostgreSQL; Redis remains disposable.
- Read models/caches: only `Title` entity reads by valid ID; browse ordering,
  Discovery projection and Playback authority are excluded.
- Trust boundaries: title IDs, PostgreSQL rows, Redis keys/bytes, timeouts and
  cancellation signals.
- External dependencies: existing pinned PostgreSQL 18.6 and Redis 8.10.0 images.

## Invariants

- A positive hit follows a current owner visibility/version fence.
- An absent marker is written only after the owner reports no currently public
  candidate; its bounded TTL is the only publication-visibility delay.
- Keys, values, TTLs, waiters and coalescing entries are finite and versioned.
- One caller cannot cancel shared work still needed by another caller.
- Lease expiry or duplicate refresh cannot authorize a durable write.
- Redis failure bypasses the cache without retries inside the product request.

## Failure behavior

| Failure | Expected behavior | Telemetry |
|---|---|---|
| Redis timeout/unavailable/capacity rejection | Read PostgreSQL directly | cache outcome `bypass`; Redis dependency outcome |
| Malformed, oversized or wrong-version value | Delete the exact key best-effort and rebuild | cache outcome `malformed` |
| Lease not acquired or expires | Wait once within a finite budget, then source fallback; duplicates are safe | lease outcome `contended` or `lost` |
| Caller cancels while sharing refresh | That caller exits; shared work continues only for remaining bounded waiters | coalescing outcome and waiter bucket |
| PostgreSQL fence/source unavailable | Return existing Catalog unavailable/cancelled result; cached bytes cannot override it | source outcome `unavailable` |
| Title changes after fence read | Exact source load must match the fence; bounded re-check or miss, never mismatched data | source outcome `fence_changed` |

## Data and contracts

- Schema/migration: additive read query only; no table migration expected.
- GraphQL: existing schema, response shape, nullability and twenty-ID batch stay
  unchanged.
- Events: existing Catalog publication events stay unchanged; no event is required
  for correctness because keys contain the owner fence.
- Cache: schema-v1 positive projection, schema-v1 short absence marker, 120-second
  positive TTL plus 0–30 seconds deterministic jitter, 5-second negative TTL plus
  0–5 seconds jitter, value at most 16 KiB, key at most 256 UTF-8 bytes.
- Compatibility: old binaries ignore new keys; new binaries ignore unknown values.
- Retention/deletion: all entries expire. No scan-based deletion. Absence markers
  can delay discovery of a new publication by at most ten seconds; versioned
  positive keys age out.

## Security and privacy

- Authorization: unchanged public Catalog policy and PostgreSQL fence; a Redis
  entry never grants playback or publication.
- Input limits: at most twenty valid UUIDs, 256-byte keys, 16-KiB values, 128
  process coalescing entries, finite lease/wait deadlines.
- Sensitive data: cache contains only already-public bounded metadata; no rights
  record, credential, profile data, token, cookie or signed media URL.
- Abuse cases: reject crafted keys/values/TTLs, hash lease identities, avoid key
  scans, cap admission and expose only finite metric labels.

## Implementation steps

1. Record the exact cache/fence/lease design in ADR-0037 and evidence index.
2. Extend `@aster/redis` with exact bounded data and compare-delete commands.
3. Add Catalog fence reads, cache port/adapter, deterministic jitter and safe
   malformed-entry recovery.
4. Add bounded process coalescing, token lease and finite measurements.
5. Compose optional non-critical Redis lifecycle into Catalog and local Docker.
6. Verify focused behavior, real PostgreSQL/Redis, outage and cold-key burst.
7. Complete one review, one confirmation and protected release.

## Tests

- Domain: key/value parsing, fence equality, deterministic jitter and bounds.
- Application: hit, miss, valid absence, non-public title, malformed entry,
  cancellation and order/duplicate preservation.
- Integration: real PostgreSQL fence/source races; real Redis expiry, NX lease and
  atomic compare-delete.
- Contract: unchanged GraphQL entity shape and public policy.
- Performance/failure: concurrent cold key, waiter/map bounds, Redis outage and
  source-query amplification.

## Evidence

- Commands: focused package/service tests, strict typecheck/lint, affected gate,
  disposable PostgreSQL/Redis experiment and audit.
- Raw artifact path: `evidence/phase-10/catalog-cache-*.txt` and Phase 10 index.
- Acceptance result: corrected local candidate PASS: Catalog243/243,
  Redis17/17, telemetry11/11, affected73/73, real PostgreSQL
  fence/source/dispute and real Redis bounded read/positive-plus-negative
  concurrency/outage/cleanup. Protected CI, corrected confirmation and release
  remain pending.
- Iteration gate: affected Redis/Catalog tests, strict typecheck and scoped lint.
- Candidate gate: `pnpm check:changed`, real dependency fixture and audit.
- Heavyweight repeat triggers: Redis wire contract, cache envelope/fence query,
  Catalog runtime composition or degraded behavior changes repeat real fixtures;
  pure prose and metric wording do not.
- Review stopping rule: one complete initial review and one confirmation; reopen
  only for requirement, security/data, availability or public-contract blockers.

## Rollback or recovery

Disable the optional Catalog cache, restore the prior compatible Catalog and Redis
artifacts, and let all versioned keys expire. Preserve PostgreSQL, media, rights,
events and other services. No data migration or cache flush is required.

## Documentation updates

ADR-0037, Redis architecture, Catalog/Redis READMEs, configuration, Phase 10
evidence and repository memory.

## Completion checklist

- [ ] Requirements satisfied
- [x] Tests pass
- [x] Evidence captured
- [x] Documentation current
- [x] `.ai/` state updated
- [ ] Remaining risks recorded
