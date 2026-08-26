# Skill: Testing and Evidence

## Purpose

Verify behavior at the cheapest layer that can catch the relevant failure while retaining realistic boundary tests.

## Test layers

### Domain tests

Pure, fast tests for invariants, transitions, ordering, and policy decisions.

### Application tests

Use fakes for ports to test orchestration, transaction intent, idempotency, and error mapping.

### Integration tests

Use real PostgreSQL, Redis, broker, object storage, and GraphQL composition where their semantics matter.

Do not replace Redis atomicity or PostgreSQL locking tests with in-memory maps.

### Contract tests

Verify:

- GraphQL schema composition and compatibility;
- event envelope and version behavior;
- object-storage layout and manifest references;
- client trusted-operation manifests.

### Browser tests

Cover complete user journeys and accessibility-critical behavior.

### Performance and failure tests

Use controlled workloads with raw evidence. Keep functional assertions inside load tests so fast failures are not misread as high performance.

## Determinism

Control time, randomness, identifiers, and external scheduling where possible. Concurrency tests should coordinate execution barriers rather than rely on arbitrary sleeps.

## Test data

Use builders with explicit defaults. Keep rights metadata realistic but synthetic unless testing a reviewed public title.

## Coverage

Coverage is a signal, not the goal. Prioritize:

- business invariants;
- authorization;
- concurrency;
- idempotency;
- retries;
- cache degradation;
- schema boundaries;
- migrations;
- failure recovery.

## Evidence standard

Every measured claim identifies environment, commit, command, workload, raw output, and limitations. Store summaries in Markdown and raw artifacts outside generated source directories.
