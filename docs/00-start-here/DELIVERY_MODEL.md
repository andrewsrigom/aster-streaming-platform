# Delivery Model

## Why phase-gated delivery

Aster contains distributed-system concerns, but those concerns should not produce a repository full of disconnected scaffolding. The delivery model builds complete vertical capabilities in a controlled order.

Each phase has:

- prerequisites;
- numbered requirements;
- architecture constraints;
- implementation sequence;
- failure behavior;
- test requirements;
- evidence requirements;
- completion gate;
- explicitly excluded work.

The [`Engineering Demonstration Contract`](ENGINEERING_DEMONSTRATION.md) adds two cross-phase obligations without changing phase order: every required engineering subject must progress through explanation, implementation, adverse verification, measurement, and operation; and every named checkpoint must remain reproducible through the documented local execution path.

## Phase state machine

```text
PLANNED
  → READY
  → IN_PROGRESS
  → IMPLEMENTED
  → VERIFIED
  → CLOSED
```

A phase may move backward when evidence reveals a defect.

### Planned

Requirements exist, but prerequisites may not be satisfied.

### Ready

Prerequisites are verified and the first work item is actionable.

### In progress

Exactly one phase is active. Work is recorded in `.ai/`.

### Implemented

Required code and documentation exist, but final evidence may still be incomplete.

### Verified

Acceptance checks and evidence pass.

### Closed

State files, roadmap, handoff, and release notes are updated.

## Vertical-slice rule

A vertical slice should cross only the layers required to produce a user-visible or operator-visible outcome.

For example, “published title appears on the catalog page” may include:

- catalog domain rule;
- PostgreSQL migration;
- application use case;
- GraphQL field;
- web rendering;
- authorization;
- trace and metrics;
- tests;
- documentation.

It should not include progress tracking, recommendations, or future playback concerns.

## Evidence before optimization

The optimization loop is:

1. define the outcome;
2. create a representative workload;
3. establish a baseline;
4. identify the bottleneck;
5. change one meaningful variable;
6. rerun the workload;
7. record result and trade-offs;
8. keep or revert the change.

A library name or design pattern is not performance evidence.

## Feedback before ceremony

Repository controls are tiered by feedback speed and risk. A coherent work item may contain several related file changes and should not be split into microcommits to satisfy a process metric.

- commit hooks inspect only fast changed-file and commit-metadata concerns;
- affected checks run before push;
- ready pull requests run the authoritative merge gate once per revision;
- phase and release gates own heavyweight clean-start, container, browser, media, failure, load, and soak evidence;
- duplicate branch-push and pull-request pipelines are prohibited for the same revision;
- superseded runs are cancelled and cache behavior is measured.

The complete policy is in [`Repository Governance`](../operations/REPOSITORY_GOVERNANCE.md).

## Sufficient verification

A work item stops when its written requirements, acceptance behavior, named failure modes, and applicable security, data, availability, and public-contract boundaries pass. Lower-risk hardening that does not protect one of those boundaries is recorded for its owning future work.

Use focused checks during edits, `pnpm check:changed` for a stable candidate, and the complete work-item gate before merge. Collect a full review round before remediation, batch related findings, and use one confirmation review. Repeat review or heavyweight evidence only when a later change can invalidate the protected behavior. This is scope control, not permission to ignore a failed requirement or material risk.

An external CI, review, or merge outage must not serialize all local engineering. A work item may become `WAITING_EXTERNAL` only after its exact coherent candidate, applicable local acceptance, evidence, rollback, and sole external condition are recorded. One later item may proceed on a dependent branch based on that frozen head, but it cannot publish, merge, or release first. A predecessor change requires rebase and affected verification. Unresolved product decisions, failing tests, blocking findings, missing evidence, credentials, and architecture decisions never qualify.

## Decision timing

Resolve decisions at the last responsible moment, not after implementation has already depended on them.

- Phase 00 selects repository tooling.
- Phase 01 selects concrete service adapters.
- Phase 02 selects the identity adapter.
- Phase 06 selects hosted-compatible media profiles and storage layout.
- Phase 14 selects hosted providers.

Every deferred decision must name:

- the phase that owns it;
- the evidence required to decide;
- the safe behavior before resolution;
- whether it blocks the phase or only hosted release.

Deferral is intentional only when these four facts are recorded in `.ai/DECISIONS_LEDGER.md` or the relevant phase specification.

## Progressive controls

Some controls begin as safe baselines and receive final acceptance only after representative behavior exists:

| Control | Baseline | Final acceptance |
|---|---|---|
| Runtime lifecycle, deadlines, and telemetry | Phase 01 | Phases 11 and 12 |
| GraphQL body, timeout, and concurrency limits | Phase 04 | Phase 13 |
| First-party operation inventory | Phases 04 and 05 | Trusted-operation enforcement in Phase 13 |
| Outbox persistence | Phases 02 and 03 | Broker relay and idempotent consumers in Phase 08 |
| Playback telemetry | Phase 07 | SLI, SLO, privacy, and retention acceptance in Phase 12 |
| Redis primitives and operation limits | Phase 10 | GraphQL-specific calibration in Phase 13 |
| Security and accessibility checks | Every affected phase | Release acceptance in Phase 14 |

A baseline may satisfy its phase requirement but must not be described as final product verification when a later primary acceptance phase remains.

## Synthetic fixtures

Synthetic accounts, profiles, metadata, and small generated media fixtures are allowed for deterministic tests. A synthetic published-title fixture must satisfy the same Catalog publication reference shape and technical manifest checks as a real title. It does not bypass rights review for real media and cannot be presented as released catalog content.

## Scope changes

A scope change must state:

- new product outcome;
- reason;
- phase placement;
- dependency impact;
- architecture impact;
- operations impact;
- what is removed or delayed.

New scope does not automatically extend the current phase.

## Autonomous execution

The first `READY` work item is the autonomous resume point. Once its change plan is complete, implementation proceeds without repeated preference questions when decisions are reversible, phase-owned, and inside accepted ADRs.

Autonomous execution includes:

- selecting compatible supported versions from official sources;
- choosing the smallest dependency that satisfies recorded criteria;
- adding focused tests, documentation, and local tooling required by the active requirement;
- correcting an internal inconsistency without changing product meaning;
- recording evidence and updating repository memory.

Autonomous execution excludes:

- creating or modifying a public remote repository;
- provisioning paid or hosted resources;
- using private credentials;
- changing product scope, architecture invariants, licensing, or data ownership;
- accepting uncertain media rights;
- making destructive hosted changes.

Those exclusions are stop conditions unless the repository owner has explicitly authorized the exact action.
