# Quality Gates

These gates become executable during Phase 00 and expand in later phases.

## Current execution status

Formatting, linting, strict TypeScript compilation, focused repository-tool tests, repository-memory consistency, documentation-link and structure validation, canonical terminology, unsupported status-claim checks, unresolved merge-marker checks, public-contribution contract validation, redacting secret scans, CI-policy checks, and dependency-free local-platform policy checks are executable through `pnpm check`. Current evidence is in [`evidence/phase-00/source-quality-foundation.txt`](../evidence/phase-00/source-quality-foundation.txt), [`evidence/phase-00/documentation-validation.txt`](../evidence/phase-00/documentation-validation.txt), [`evidence/phase-00/ci-security-foundation.txt`](../evidence/phase-00/ci-security-foundation.txt), [`evidence/phase-00/community-governance.txt`](../evidence/phase-00/community-governance.txt), [`evidence/phase-00/public-repository-governance.txt`](../evidence/phase-00/public-repository-governance.txt), [`evidence/phase-00/ai-state-workflow.txt`](../evidence/phase-00/ai-state-workflow.txt), [`evidence/phase-01/local-platform-checkpoint.txt`](../evidence/phase-01/local-platform-checkpoint.txt), and [`evidence/phase-01/local-reset.txt`](../evidence/phase-01/local-reset.txt).

High-severity registry audit is executable locally, and the hosted `main` and protected pull-request decisions passed. Pull-request dependency and license review is configured and its first hosted execution passed. P01-R01 adds a path-aware Docker Compose model and smoke lane; protected remediation run `32948639792` passed immutable pull, health-gated startup, protocol/version checks, and unique-project cleanup. P01-R02 expands the platform gate to 18 focused tests, makes reset changes select the isolated Docker job, and verifies refusal, exact teardown, postconditions, recovery, and unrelated-resource preservation locally and from a clean public checkout. Later-phase gates remain planned until their owning phase implements and verifies them.

## Always required

- formatting
- linting
- strict TypeScript compilation
- unit tests for changed behavior
- documentation-link validation
- repository-memory consistency validation
- public contribution contract validation
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
