# Testing Strategy

## Objective

Tests protect product invariants, context contracts, security boundaries, operational behavior, and user journeys. The suite should identify the smallest responsible boundary while retaining realistic tests where infrastructure semantics matter.

## Test pyramid by responsibility

### Domain

Pure tests:

- title lifecycle;
- rights completeness;
- profile limit policy;
- progress sequence and completion;
- watchlist idempotency;
- playback eligibility;
- fallback selection.

### Application

Use fake ports to verify:

- authorization invocation;
- transaction intent;
- outbox coupling;
- idempotency flow;
- dependency error mapping;
- cancellation propagation.

### Infrastructure integration

Use real containers for:

- PostgreSQL constraints, locking, transactions, migrations, and query plans;
- Redis Lua atomicity, TTL, failover behavior available locally, and malformed values;
- broker duplicate delivery and partition ordering;
- object-storage multipart upload, metadata, and object layout;
- GraphQL subgraph execution and supergraph composition.

### Contract

- Federation schema composition;
- known GraphQL operations;
- event schema versions;
- media publication manifest;
- configuration schema;
- browser telemetry envelope.

### Browser

Critical journeys:

1. public browse;
2. title attribution;
3. account and profile;
4. playback;
5. progress and resume;
6. watchlist;
7. search;
8. degraded home;
9. keyboard player;
10. error recovery.

### Performance and failure

- operation-mix load;
- cache stampede;
- N+1 query count;
- event-loop block;
- stream memory;
- soak and memory retention;
- dependency outage;
- GraphQL abuse;
- media-worker resource failure.

## Test data

Use synthetic accounts and profiles.

Catalog fixtures:

- published title;
- draft title;
- disputed title;
- retired title;
- title with missing locale;
- title with approved rights;
- title with invalid rights;
- title with multiple media versions.

Use small generated media fixtures for fast CI. Full open-film processing runs in a dedicated workflow after rights review and is not required for every unit test.

## Deterministic concurrency

Avoid arbitrary sleep.

Use:

- barriers;
- controlled clocks;
- transaction locks;
- test hooks at adapters;
- deterministic IDs;
- seeded randomness;
- explicit event ordering.

Concurrency tests should prove the invariant under competing writes, not merely run the code twice.

## Migration tests

For each migration:

- apply from previous schema;
- run compatible old/new code checks when needed;
- validate data;
- test backfill;
- inspect lock/runtime for large tables;
- verify rollback or roll-forward.

## Flaky-test policy

A flaky test is a defect.

When identified:

1. preserve failure evidence;
2. quarantine only with an issue, owner, and expiry;
3. fix timing, isolation, data, or environment cause;
4. remove quarantine;
5. record recurrence prevention.

Increasing timeout without evidence is not a fix.

## CI tiers

### Pull request

- format;
- lint;
- types;
- unit;
- focused integration;
- schema and docs;
- security baseline.

### Main branch

- full integration;
- browser suite;
- container and dependency scans;
- media fixture;
- load smoke.

### Scheduled

- full load;
- soak;
- full-film media processing;
- restore test;
- extended security and accessibility;
- dependency update validation.

## Exit criteria

A test must fail for the behavior it protects. Tests that only execute lines without meaningful assertions do not satisfy requirements.
