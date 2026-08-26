# ADR-0005: Keep Redis Non-Authoritative

- Status: Accepted
- Date: 2026-08-25
- Related requirements: DSC-R04, OPS-R02

## Context

Aster needs low-latency catalog reads, home rails, request coalescing, rate limits, and short-lived coordination. Redis is well suited, but treating cached state as truth creates data loss and recovery ambiguity.

## Decision

Use Redis for:

- cache-aside;
- stale-while-revalidate;
- negative caching;
- request coalescing support;
- bounded refresh leases;
- rate limiting;
- selected ephemeral delivery data.

PostgreSQL remains authoritative. Every key family defines degraded behavior, TTL, schema version, cardinality, invalidation, and metrics.

Redis leases are not sufficient for irreversible durable side effects.

## Consequences

### Positive

- Redis outages degrade performance rather than corrupt truth.
- Cache designs can be evaluated independently.
- Recovery does not require restoring cache state.

### Negative

- Source systems must absorb bounded cache misses.
- Correct invalidation and stale policy require discipline.
- Some low-latency paths need fallback design.

## Alternatives considered

### Redis as durable engagement store

Rejected because accepted progress and watchlist state require stronger recovery guarantees.

### No Redis

Rejected because advanced cache and concurrency behavior is a product and engineering requirement.

## Revisit triggers

A future Redis-backed durable feature requires its own ADR, persistence settings, recovery tests, and consistency model.
