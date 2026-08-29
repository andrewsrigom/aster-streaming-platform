# Work Item: Bounded Discovery stale-while-revalidate

- Status: IN_PROGRESS
- Owner: Discovery; Platform owns the bounded Redis adapter
- Phase: 10
- Requirement IDs: P10-R01, P10-R04, P10-R05, P10-R06, P10-R07, P10-R10
- Created: 2026-08-29
- Updated: 2026-08-29

## Outcome

Home-rail requests may reuse one bounded Discovery-owned snapshot and serve it
explicitly as stale while one bounded refresh runs. A response never crosses the
maximum stale age or any cached title visibility expiry. Redis loss returns to
the existing PostgreSQL path and does not change Catalog, Playback or profile
authority.

## Current behavior

Released Discovery reads projection state and four independent PostgreSQL rail
selections for every home request. It returns explicit stale or unavailable state
without rails when the projection or store cannot serve. PR37 released the
reviewed Redis primitives as main `903f7b4330db8c47896ea82f5f487a268d817d88`;
this branch is rebased onto that exact release.

## Proposed behavior

Add a cache port around the existing Discovery home use case. Cache at most the
twelve valid `first` variants under a schema-v1 key. A completed page whose rail
codes are only completed, empty or fallback is reusable as fresh for fifteen
seconds plus deterministic zero-to-five-second jitter. It remains eligible as
stale for at most sixty seconds from capture, shortened by the earliest title
visibility expiry. Redis storage expiry adds only deterministic cleanup jitter;
the envelope timestamp is the serving authority.

A fresh hit returns without PostgreSQL. A stale hit returns immediately with the
existing GraphQL `STALE` code and its bounded page, then starts one background
refresh. Cold misses wait for one coalesced refresh. Per-key process work, a
tokenized Redis lease, finite deadlines and lifecycle draining bound duplicate
work. Missing, malformed, expired or unavailable cache state falls back to the
existing owner read. Source failure without an eligible stale page retains the
existing explicit result.

The rebased local implementation now uses the shared atomic recoverable lease
instead of a plain conditional write. It replaces wrong-type, non-expiring or
longer-than-two-second contamination while preserving valid holders inside the
requested window. Monotonic refresh attachments are tracked separately from
active cancellation waiters so the first coalesced request records `one`.

## Boundaries

- Owning context: Discovery owns home ordering, cache policy and refresh;
  Catalog remains current title metadata, publication and rights authority.
- Affected services/packages: `services/discovery`, `packages/telemetry`, local
  Compose, Web's strict public projection and Phase 10 documentation/evidence.
- Authoritative data: Discovery PostgreSQL projection derived from Catalog; Redis
  is disposable.
- Read models/caches: whole bounded home page keyed only by environment and valid
  `first`; search, personalization, Catalog entities and progress are excluded.
- Trust boundaries: GraphQL input, Redis keys/bytes/timestamps, PostgreSQL result,
  time, cancellation and background lifecycle.
- External dependencies: existing pinned Redis 8.10.0 and PostgreSQL 18.6.

## Invariants

- A cached title reference is never served at or after its `visibleUntil` value;
  Catalog still resolves every reference under current owner policy.
- Cache capture age never exceeds sixty seconds, regardless of Redis TTL.
- Only schema-valid pages without transient failed rail results enter the cache.
- One caller cannot cancel refresh work still used by another caller.
- Shared cold source work is revalidated against each caller's request time; a
  visibility-boundary crossing performs a new owner read.
- A lease coordinates disposable refresh only and authorizes no durable write.
- Background work is finite, observed and drained or cancelled during shutdown.

## Failure behavior

| Failure | Expected behavior | Telemetry |
|---|---|---|
| Redis timeout, outage or capacity rejection | Execute the existing PostgreSQL source | cache `bypass`; Redis dependency outcome |
| Malformed, oversized or expired envelope | Delete exact key best-effort and use source | cache `malformed` or `miss` |
| Eligible stale hit | Return `STALE` with rails immediately; refresh in background | cache `stale_hit` and refresh outcome |
| Refresh lease contention | Keep serving stale; do not create a request wait loop | cache `lease_contended` |
| Lease key is wrong-type, non-expiring or longer than two seconds | Atomically replace only that contaminated key with the caller's finite lease | cache `lease_acquired` |
| Refresh source unavailable | Retain eligible stale bytes until maximum age | cache `refresh_failed` |
| No eligible stale value and source failure | Return existing unavailable, cancelled or indeterminate result | source result and cache outcome |
| Caller or service cancellation | Stop that wait; abort orphaned work and drain lifecycle | bounded cancellation outcome |

## Data and contracts

- Schema/migration: no PostgreSQL migration.
- GraphQL: no field or enum addition. `STALE` may carry the existing nullable home
  page fields when a bounded cache fallback is served; source-projection stale
  without cache still carries no page.
- Events: unchanged; Catalog events continue to update the Discovery projection.
- Cache: `aster:{environment}:discovery:home:v1:{first}`, schema-v1 JSON, maximum
  16 KiB, fresh fifteen seconds plus zero-to-five jitter, maximum stale sixty
  seconds, physical expiry no later than stale bound plus zero-to-ten jitter.
- Compatibility: old binaries ignore the new key; strict clients continue to
  accept the existing `STALE` enum and are updated to validate both legal shapes.
- Retention/deletion: finite TTL only; no key scan. Exact malformed keys may be
  deleted best-effort.

## Security and privacy

- Authorization: unchanged public Discovery operation and Catalog entity
  resolution; cache state grants neither playback nor publication.
- Input limits: `first` one through twelve, twelve key variants, 256-byte key,
  16-KiB value, bounded work map and finite deadlines.
- Sensitive data: public title identifiers and projection timing only; no query,
  profile, progress, rights record, credential, token or media URL.
- Abuse cases: strict envelope parsing, byte limits before materialization,
  deterministic keys/jitter, no scans and finite metric labels.

## Implementation steps

1. Record the exact Discovery cache and stale contract in ADR-0038.
2. Add the Discovery cache port, strict envelope projection and Redis adapter.
3. Wrap home source reads with fresh/stale/miss behavior and bounded refresh.
4. Compose optional Redis lifecycle, metrics and local configuration.
5. Accept and render the explicit `STALE` page shape in Web.
6. Prove focused behavior, real Redis/PostgreSQL, Router/Web contract and outage.
7. Rebase onto the predecessor squash, repeat affected gates and publish after
   its exact-main acceptance. Completed on main `903f7b4`.

## Tests

- Domain: envelope timestamp, page shape, visibility and size bounds.
- Application: fresh hit, stale serve, maximum age, malformed value, source
  fallback, cancellation, coalescing and refresh failure.
- Integration: real Redis expiry, lease ownership, bounded read and outage; real
  PostgreSQL remains source after bypass.
- Contract: existing GraphQL shape/composition and strict Web projection for both
  legal `STALE` forms.
- Browser: stale rails remain usable with a visible refresh warning; expired or
  unavailable data falls back to Catalog browse.
- Performance/failure: concurrent stale burst, source refresh count, Redis loss
  and cleanup.

## Evidence

- Commands: focused Discovery/Web/telemetry tests, strict static checks, affected
  gate, disposable Redis/PostgreSQL and runtime/browser experiment where changed.
- Raw artifact path: `evidence/phase-10/discovery-swr-*.txt` and Phase 10 index.
- Acceptance result: Discovery99/99, telemetry11/11, Web111/111, scoped static
  checks and real Redis pass. The Redis fixture proves 24 cold callers to one
  source read, 24 stale callers to one detached refresh, cross-instance
  excessive-TTL recovery, outage fallback and cleanup0. Final candidate
  checkpoint `0417ffd` passes the complete affected gate 73/73 with61 cached in
  148.029 seconds. Exact `8faf35a` passes the eleven-service PostgreSQL/Router
  outage runtime in 395884 ms with cleanup0.
- Initial exact-head automated review found no issue. The complete local review
  additionally found cross-time cold coalescing, a rejected cache write masking
  completed owner data, and sibling shutdown short-circuiting. The batched
  correction revalidates caller visibility, makes writes best-effort and attempts
  all consumer closures; exact `5a5f5e2` passes Discovery103/103, static gates
  and the complete affected gate73/73 with56 cached in106.071 seconds.
- Iteration gate: focused Discovery cache, Web projection and telemetry tests plus
  strict typecheck/lint.
- Candidate gate: `pnpm check:changed`, real Redis/Discovery fixture and affected
  public runtime checks.
- Heavyweight repeat triggers: predecessor changes; Redis wire/envelope,
  visibility timestamp, runtime composition or public stale shape changes repeat
  their affected dependency/runtime/browser proof.
- Review stopping rule: one complete initial review and one confirmation; reopen
  only for requirement, security/data, availability or public-contract blockers.

## Rollback or recovery

Disable the optional Discovery cache and restore the prior compatible Discovery
and Web artifacts. Let versioned keys expire without a scan or flush. Preserve
Discovery projection generations, events, Catalog, Engagement and media.

## Documentation updates

ADR-0038, Discovery/Redis architecture, runtime configuration, Web behavior,
Phase 10 evidence and repository memory.

## Completion checklist

- [x] Requirements satisfied
- [x] Focused tests pass
- [x] Iteration evidence captured
- [x] Documentation current
- [x] `.ai/` state updated
- [x] Remaining risks recorded
