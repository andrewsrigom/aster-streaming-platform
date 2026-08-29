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
Corrected confirmation then found that fence coalescing could cross a request
time/policy boundary and a wrong-type Redis key bypassed exact malformed cleanup.
Exact implementation `2930332e7b1c049c081bfad8c5d62c71009f03bf`
includes the visibility scope in the shared identity and rejects non-string keys
inside the bounded Redis script before `STRLEN`/`GET`.
The next confirmation found that a recognizable negative marker with missing or
excessive Redis expiry could outlive the ten-second publication-discoverability
contract. Exact correction `f50acbb7cbb26cef480b0bb87018510660da48ca`
embeds and strictly validates `cachedAt`; missing, future or older-than-ten-second
envelopes are malformed, deleted exactly and rechecked against Catalog.
Protected run33265036497 then passed exact `4afe12f`, but exact-head review found
that coalescing telemetry included the refresh owner in its waiter count. Exact
`6088bf8` classifies only callers attached behind the owner for both fence and
positive refresh work; cache and visibility behavior are unchanged.
Exact-head review discussion3887242213 then found that the Redis adapter rejected
a bounded control-byte string as an invalid vendor reply and destroyed the
connection before Catalog could delete it. Exact `997ef27` keeps type/byte bounds
at transport, preserves strict write inputs and lets Catalog classify/delete the
malformed envelope.
Protected run `33266926624` passed exact `edf7bc8`, but its exact-head review found
two remaining coordination defects: a wrong-type or non-expiring lease could
contend forever, and an entry with zero local callers could be reattached while a
sibling kept shared work alive but record the wrong waiter bucket. Exact
`d93afbcc8bf87f71dc926c9010c2180820aeccfb` acquires leases through one atomic
type/expiry recovery script and separates monotonic attachment telemetry from
active cancellation waiters.
Exact-head confirmation discussion `3887360355` found that node-redis could
expand Lua-bounded invalid UTF-8 while decoding it, causing the post-decode byte
validator to reset the shared connection instead of returning malformed exact-key
data. The correction will preserve the Redis-side raw-byte bound through binary
transport, reject invalid UTF-8 without resetting the connection and prove exact
deletion with focused and real Redis checks.
Exact `ce97596794c05bdd5b92fb9a75dde2a9e4be159f` implements that binary transport
and fatal decode. Redis 17/17, Catalog 246/246, the real 16 KiB invalid-byte
fixture and the complete affected gate pass; the connection probe succeeds
before exact deletion and fixture cleanup reaches zero.
Exact-head discussion `3887423663` then found that a finite but excessive lease
TTL remained contended beyond the two-second coordination window. Exact
`f014ebe2534f7c151020e46912cf2e7d9161ac81` treats a remaining TTL above the
requested lease TTL as malformed and replaces it in the same atomic script. Redis
17/17, Catalog 246/246, the real 24-hour seeded-lease recovery and the complete
affected 73/73 gate pass; corrected hosted gates remain pending.

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
  candidate; Redis TTL and the independently validated envelope age both cap the
  publication-visibility delay at ten seconds.
- Keys, values, TTLs, waiters and coalescing entries are finite and versioned.
- One caller cannot cancel shared work still needed by another caller.
- Lease expiry or duplicate refresh cannot authorize a durable write.
- Redis failure bypasses the cache without retries inside the product request.

## Failure behavior

| Failure | Expected behavior | Telemetry |
|---|---|---|
| Redis timeout/unavailable/capacity rejection | Read PostgreSQL directly | cache outcome `bypass`; Redis dependency outcome |
| Malformed, oversized, wrong-version or over-age value | Delete the exact key best-effort and rebuild | cache outcome `malformed` |
| Lease not acquired or expires | Wait once within a finite budget, then source fallback; duplicates are safe | lease outcome `contended` or `lost` |
| Lease key is wrong-type, non-expiring or longer than the requested window | Atomically replace only that malformed key with a finite owned lease | lease outcome `acquired` |
| Caller cancels while sharing refresh | That caller exits; shared work continues only for remaining bounded waiters | coalescing outcome and waiter bucket |
| PostgreSQL fence/source unavailable | Return existing Catalog unavailable/cancelled result; cached bytes cannot override it | source outcome `unavailable` |
| Title changes after fence read | Exact source load must match the fence; bounded re-check or miss, never mismatched data | source outcome `fence_changed` |

## Data and contracts

- Schema/migration: additive read query only; no table migration expected.
- GraphQL: existing schema, response shape, nullability and twenty-ID batch stay
  unchanged.
- Events: existing Catalog publication events stay unchanged; no event is required
  for correctness because keys contain the owner fence.
- Cache: schema-v1 positive projection, schema-v1 timestamped short absence
  envelope, 120-second positive TTL plus 0–30 seconds deterministic jitter,
  5-second negative TTL plus 0–5 seconds jitter and a matching ten-second
  application age ceiling, value at most 16 KiB, key at most 256 UTF-8 bytes.
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
- Acceptance result: corrected local candidate PASS: Catalog 246/246,
  Redis 17/17, telemetry 11/11, affected 73/73 (50 cached, 126.735 seconds), real
  PostgreSQL fence/source/dispute and real Redis bounded/wrong-type/over-age
  reads, positive-plus-negative concurrency, exact attached-caller waiter
  buckets, invalid-UTF-8 and control-byte deletion without connection loss,
  malformed lease recovery, outage and cleanup. One earlier affected
  attempt hit an unrelated Identity terminal-fallback timing failure; its focused
  147/147 rerun and the next complete gate pass. The latest remediation's first
  candidate attempt hit the same unchanged Identity timing assertion; focused
  Identity passed 147/147 and a concurrency-capped rerun passed 73/73. Protected
  run `33268669701` passed predecessor exact `d05dad3`; corrected confirmation
  and release remain pending.
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
