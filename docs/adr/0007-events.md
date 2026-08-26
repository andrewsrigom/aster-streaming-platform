# ADR-0007: Use Transactional Outboxes and At-Least-Once Events

- Status: Accepted
- Date: 2026-08-25
- Related requirements: CAT-R04, ENG-R01, OPS-R06

## Context

Context-owned state changes must update projections and trigger asynchronous workflows. Publishing directly to a broker before or after a database transaction creates dual-write failure.

## Decision

Write domain state and an outbox record in one PostgreSQL transaction. A relay publishes versioned events to a Kafka-compatible broker. Consumers are idempotent and projection rebuild is documented.

Delivery is at least once. Ordering is scoped by selected aggregate or partition key.

## Consequences

### Positive

- No lost event after a committed state change under the modeled failure.
- Source writes can continue during a bounded broker outage.
- Consumers explicitly handle duplicates and versions.
- Event history supports projection recovery within retention.

### Negative

- Relays, outbox cleanup, lag, and replay require operation.
- Consumers need idempotency storage or version constraints.
- Event schema evolution becomes a compatibility responsibility.

## Alternatives considered

### Direct broker publish

Rejected because it cannot atomically commit with PostgreSQL state.

### Database polling without broker

Could serve early local behavior, but a broker is retained for realistic fan-out and lag control once the phase requires it.

### Distributed transactions

Rejected due to complexity and weak support across selected components.

## Revisit triggers

Broker technology may change without changing event semantics if contracts and delivery guarantees are preserved.
