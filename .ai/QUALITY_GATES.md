# Quality Gates

These gates become executable during Phase 00 and expand in later phases.

## Current execution status

Formatting, linting, strict TypeScript compilation, focused repository-tool tests, documentation-link and structure validation, canonical terminology, unsupported status-claim checks, and unresolved merge-marker checks are executable through `pnpm check`. Current evidence is in [`evidence/phase-00/source-quality-foundation.txt`](../evidence/phase-00/source-quality-foundation.txt) and [`evidence/phase-00/documentation-validation.txt`](../evidence/phase-00/documentation-validation.txt).

Secret scanning and dependency vulnerability review remain planned for P00-R06. Later-phase gates remain planned until their owning phase implements and verifies them.

## Always required

- formatting
- linting
- strict TypeScript compilation
- unit tests for changed behavior
- documentation-link validation
- secret scanning
- dependency vulnerability review
- no unsupported implementation claims
- no unresolved merge markers
- no skipped tests without an approved issue

## Architecture-sensitive changes

Require:

- linked requirement IDs;
- linked ADRs;
- boundary and ownership review;
- migration and rollback plan;
- failure-mode review;
- observability update;
- focused integration tests.

## GraphQL changes

Require:

- successful subgraph schema build;
- successful supergraph composition;
- ownership review;
- authorization review;
- N+1 review;
- operation-cost review;
- compatibility check for first-party operations.

## Persistence changes

Require:

- forward migration;
- backward-compatible deployment sequence when needed;
- rollback or roll-forward strategy;
- index and query-plan evidence for performance-sensitive paths;
- concurrency tests for ordering-sensitive behavior.

## Media changes

Require:

- rights record;
- checksum verification;
- isolated processing;
- rendition validation;
- manifest validation;
- playback test;
- attribution generation;
- cleanup and retry test.

## Release gate

A release requires:

- all phase acceptance criteria;
- successful CI;
- environment smoke tests;
- backup and restore readiness;
- dashboards and alerts;
- rollback readiness;
- release notes;
- current runbooks;
- known-risk review.
