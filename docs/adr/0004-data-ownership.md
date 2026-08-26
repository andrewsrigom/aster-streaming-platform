# ADR-0004: Use PostgreSQL with Context-Owned Persistence

- Status: Accepted
- Date: 2026-08-25
- Related requirements: CAT-R01, CAT-R04, ENG-R01, OPS-R06

## Context

Aster requires transactions, constraints, ordered progress, idempotency, lifecycle history, and queryable metadata. Contexts must not couple through shared tables.

## Decision

Use PostgreSQL as durable authority.

Each context owns a schema or database, migration history, credentials, and repositories. Services may share a physical cluster initially but cannot read or write another context's objects.

Use database constraints and transactions to enforce durable invariants. Cross-context duplication is an explicit projection with source and rebuild semantics.

## Consequences

### Positive

- Strong transactional behavior.
- Mature indexing, locking, and recovery.
- Clear path from local single cluster to separated clusters.
- Advanced concurrency behavior can be tested directly.

### Negative

- Cross-context joins require Federation or projections.
- Operational isolation is logical before clusters separate.
- High-write paths require careful indexing and retention.

## Alternatives considered

### Shared application database model

Rejected because it makes context ownership unenforceable.

### Document database

Not selected because current relationships, constraints, and concurrency favor PostgreSQL.

### Redis as primary progress store

Rejected because eviction and failover behavior do not satisfy durable progress requirements.

## Revisit triggers

Use a specialized store only when a measured workload and invariant analysis show PostgreSQL is the limiting factor.
