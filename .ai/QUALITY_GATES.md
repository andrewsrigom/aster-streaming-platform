# Quality Gates

These gates become executable during Phase 00 and expand in later phases.

## Current execution status

Formatting, linting, strict TypeScript compilation, focused repository-tool tests, repository-memory consistency, documentation-link and structure validation, canonical terminology, unsupported status-claim checks, unresolved merge-marker checks, public-contribution contract validation, redacting secret scans, CI-policy checks, and dependency-free local-platform policy checks are executable through `pnpm check`. Current evidence is in [`evidence/phase-00/source-quality-foundation.txt`](../evidence/phase-00/source-quality-foundation.txt), [`evidence/phase-00/documentation-validation.txt`](../evidence/phase-00/documentation-validation.txt), [`evidence/phase-00/ci-security-foundation.txt`](../evidence/phase-00/ci-security-foundation.txt), [`evidence/phase-00/community-governance.txt`](../evidence/phase-00/community-governance.txt), [`evidence/phase-00/public-repository-governance.txt`](../evidence/phase-00/public-repository-governance.txt), [`evidence/phase-00/ai-state-workflow.txt`](../evidence/phase-00/ai-state-workflow.txt), [`evidence/phase-01/local-platform-checkpoint.txt`](../evidence/phase-01/local-platform-checkpoint.txt), [`evidence/phase-01/local-reset.txt`](../evidence/phase-01/local-reset.txt), and [`evidence/phase-01/runtime-logging.txt`](../evidence/phase-01/runtime-logging.txt).

High-severity registry audit is executable locally, and the hosted `main` and earlier protected pull-request decisions passed. Pull-request dependency and license review is configured and remains fail-closed: P01-R07 run `33023269145` passed source quality, audit, documentation, and security but rejected transitive `bowser@2.14.1` because its `MIT AND MITNFA` classification exceeded the reviewed allowlist. ADR-0012 records the narrow policy remediation; exact-head run `33023896325` passes the corrected Dependency review, every applicable source/documentation/platform job, and the stable aggregate at `f8aa6f8`. P01-R01 adds a path-aware Docker Compose model and smoke lane; protected remediation run `32948639792` passed immutable pull, health-gated startup, protocol/version checks, and unique-project cleanup. P01-R02 expands the platform gate to 18 focused tests, makes reset changes select the isolated Docker job, and verifies refusal, exact teardown, postconditions, recovery, and unrelated-resource preservation locally and from a clean public checkout. P01-R04 adds 14 focused structured-logging tests plus a two-record diagnostic; complete local and clean-checkout graphs pass, and protected run `32966113415` passes hosted dependency review, documentation/security, source quality, audit, and the stable aggregate. Later-phase gates remain planned until their owning phase implements and verifies them.

The documentation gate also validates the canonical capability-to-proof index. It requires the
complete capability set, authoritative owners, local status vocabulary, complete columns, and
linked requirements, implementation, adverse tests, evidence, and operations. The general
documentation validator then proves those local paths and Markdown anchors exist.

## Always required

These controls are required before a work item is completed when they apply to its changed behavior. They are not a requirement to run the complete repository graph after every edit or commit.

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

## Execution cadence

- Edit: focused tests and static checks at the smallest responsible boundary.
- Candidate: `pnpm check:changed` after related changes are coherent.
- Merge: the complete acceptance gate once the candidate is stable.
- Phase or release: clean-start and other heavyweight evidence owned by the phase.

Repeat heavyweight evidence only after dependency, lockfile, bootstrap, packaging, Docker, generated-artifact, public-command, or behavior changes that can invalidate it. Consolidate evidence and repository-memory prose at candidate and closeout checkpoints. One initial review plus one confirmation is the default; another round requires a changed or newly discovered blocking boundary.

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
