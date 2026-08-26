# Skill: Data and Events

## Purpose

Preserve authority, consistency, ordering, and recoverability across context boundaries.

## Transactions

A use case defines its transaction boundary. Repositories do not begin independent hidden transactions.

Keep transactions short. Avoid network calls while holding database locks.

## Migrations

Every migration defines:

- forward change;
- deployment compatibility;
- data backfill;
- validation;
- rollback or roll-forward;
- expected lock and runtime impact.

Use expand-and-contract for breaking changes.

## Outbox

When a state change must publish a domain event:

1. write domain state and outbox row in one PostgreSQL transaction;
2. commit;
3. relay the event;
4. mark publication with retry-safe semantics;
5. let consumers deduplicate by event ID.

Do not publish before the transaction commits.

## Event envelope

Each event includes:

- event ID;
- event type;
- schema version;
- occurred-at time;
- producer;
- aggregate ID and version when applicable;
- correlation ID;
- causation ID;
- payload;
- trace context where supported.

Do not put secrets or unnecessary personal data in events.

## Consumer behavior

Consumers must be:

- idempotent;
- version-aware;
- bounded in concurrency;
- retryable;
- observable;
- able to quarantine poison messages;
- able to rebuild projections.

A dead-letter destination without a replay procedure is incomplete.

## Ordering

Choose an ordering key based on the invariant. Playback progress is ordered per profile and title, not globally.

Use monotonic sequence or version checks at the durable owner. Arrival time alone is not sufficient.

## Read models

Document acceptable staleness and rebuild procedure. A read model may be unavailable without making the source transaction unavailable.
