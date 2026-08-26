# Phase 10 — Advanced Redis and Concurrency

## Objective

Introduce measured Redis patterns for cache latency, stampede control, rate limiting, and hot-path protection while preserving durable correctness.

## Product traceability

- Supports: `DSC-R04`, `GQL-R04`, `OPS-R02`, `OPS-R03`, `QLT-R01`, `QLT-R02`, `QLT-R04`.
- Phase 10 delivers reusable cache and limiter behavior; Phase 13 applies and calibrates final GraphQL-specific controls.

## Prerequisites

- Catalog, Engagement, and Discovery have measurable source queries.
- Representative concurrent workloads exist.

## Deliverables

- cache design records
- versioned Redis key conventions
- catalog cache-aside
- discovery stale-while-revalidate
- negative caching and TTL jitter
- in-process coalescing and Redis leases
- rate and concurrency limiters
- Redis outage and hot-key evidence

## Requirements

### P10-R01

Document owner, key, schema, source, TTL, jitter, invalidation, size, consistency, degraded mode, and metrics for every cache.
### P10-R02

Implement Catalog cache-aside with safe malformed-entry recovery.
### P10-R03

Implement short negative caching only for valid absent resources.
### P10-R04

Implement Discovery stale-while-revalidate with maximum stale age and explicit fallback.
### P10-R05

Apply TTL jitter to avoid synchronized expiration.
### P10-R06

Coalesce concurrent in-process refreshes with bounded map size and correct cancellation semantics.
### P10-R07

Use a tokenized Redis lease with atomic acquire and compare-and-delete release for cross-instance cache refresh.
### P10-R08

Implement operation-specific rate limiting with documented identity partition and Redis-failure behavior.
### P10-R09

Implement concurrency limiting for expensive search or refresh paths with finite queue behavior.
### P10-R10

Measure hit rate, source load, refresh amplification, lease contention, latency, and Redis error outcomes.
### P10-R11

Demonstrate that Redis loss does not lose or corrupt durable progress, rights, or publication state.
### P10-R12

Document and test hot-key mitigation without premature sharding.

## Invariants

- Redis is never the only copy of durable product state.
- Cache values are versioned and bounded.
- Lease expiration cannot authorize an irreversible write.
- Rate limiting remains layered with GraphQL cost and concurrency controls.
- Cache failure cannot create a false successful mutation.

## Implementation sequence

1. Measure uncached baselines.
2. Write cache design records.
3. Implement cache-aside and metrics.
4. Add jitter and negative caching.
5. Add stale-while-revalidate.
6. Add in-process coalescing.
7. Add Redis lease.
8. Add rate and concurrency limits.
9. Run stampede and outage experiments.

## Required tests

- Hit, miss, stale, malformed, and timeout paths.
- Concurrent cold-key burst with and without coalescing.
- Lease owner crash and expiry.
- Compare-and-delete safety.
- TTL distribution.
- Redis outage under browse and progress traffic.
- Rate-limit boundary and identity partition.
- Hot-key workload.

## Required evidence

Store the phase evidence index under `evidence/phase-10/` when implementation begins.

- before/after database query count
- stampede load report
- cache hit and stale metrics
- lease contention report
- Redis outage report
- rate-limit atomicity test
- memory/cardinality estimate

Every measured result must identify commit, environment, exact command, workload, raw artifact, interpretation, and limitations.

## Non-goals

- Redis as primary database
- Distributed locks for media publication
- Unlimited cache warmup
- Global cache invalidation by key scan
- Final trusted-operation and GraphQL cost enforcement

## Exit gate

The phase is `VERIFIED` only when:

- every requirement has a linked implementation or documented non-applicability;
- all required tests pass from a clean environment;
- evidence is stored and reviewed;
- security, accessibility, failure, and operational effects are documented;
- no planned behavior is described as implemented;
- `.ai/CURRENT_STATE.md`, `.ai/WORK_QUEUE.md`, `.ai/SESSION_LOG.md`, and `.ai/HANDOFF.md` are current;
- the next phase prerequisites are explicitly checked.

## Learning outcomes

- Cache-aside
- TTL jitter
- Stale-while-revalidate
- Cache stampede
- Atomic Lua
- Rate and concurrency limiting

## Agent constraints

- Load `skills/agent.md` and every skill related to this phase.
- Do not implement later-phase capabilities to hide an incomplete requirement.
- Do not add placeholder services, dashboards, events, or metrics.
- Use requirement IDs in the active change plan.
- Stop and write an ADR when a fixed architecture decision must change.
