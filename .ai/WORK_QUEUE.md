# Work Queue

Only one item may be `IN_PROGRESS`.

Phases 00–03 are released. PR 20 squash 135484183253ede7a6b6436f737794bfee2049d8 and post-merge run 33091716358 pass; [release evidence](../evidence/phase-03/release.txt). Phase 04 has local requirement acceptance at b5d7ab7; [clean evidence](../evidence/phase-04/clean-acceptance.txt). P04-R02 remains IN_PROGRESS for PR 21's CI remediation and protected release. Two stale diagnostic paths failed run 33100857323; their focused and real Docker corrections pass locally, awaiting the combined candidate gate and same-PR publication.

| Order | Work item | Requirement | Status |
|---:|---|---|---|
| 1 | Select and record the source-code license | P00-R01 | DONE |
| 2 | Reconcile Phase 00 traceability, sequence, and public-repository workflow | P00-R08 | DONE |
| 3 | Define engineering demonstration, local demo, and repository governance contracts | P00-R11 | DONE |
| 4 | Select and pin the supported Node.js and pnpm versions | P00-R03 | DONE |
| 5 | Initialize Git policy, pnpm workspace, Turborepo, and deterministic ignores | P00-R02 | DONE |
| 6 | Add strict TypeScript, formatting, linting, unused-code, import-boundary, and commit checks | P00-R04 | DONE |
| 7 | Add link, terminology, and unsupported-status-claim validation | P00-R05 | DONE |
| 8 | Add CI for install integrity, code checks, tests, documentation, secrets, and dependency review | P00-R06 | DONE |
| 9 | Add public contribution governance and repository templates | P00-R07 | DONE |
| 10 | Create the authorized public GitHub repository and apply verified protections | P00-R07 | DONE |
| 11 | Integrate `.ai/` state checks into the normal contribution workflow | P00-R08 | DONE |
| 12 | Document exact bootstrap, check, demo, and cleanup commands | P00-R09 | DONE |
| 13 | Verify a clean checkout, capture the Phase 00 evidence index, and close the phase | P00-R10 | DONE |
| 14 | Select local platform versions, resource bounds, and the first Docker runtime checkpoint | P01-R01 | DONE |
| 15 | Add an explicit project-scoped destructive local reset | P01-R02 | DONE |
| 16 | Validate process-start configuration and classify secrets | P01-R03 | DONE |
| 17 | Implement structured logging with redaction and trace correlation | P01-R04 | DONE |
| 18 | Select the HTTP adapter through an ADR and create the transport boundary | P01-R11 | DONE |
| 19 | Calibrate risk-proportionate verification and affected-scope feedback | P00-R06 | DONE |
| 20 | Implement lifecycle, health, and bounded graceful shutdown | P01-R05 | DONE |
| 21 | Define the bounded telemetry contract and runtime metrics | P01-R06 | DONE |
| 22 | Implement narrow PostgreSQL, Redis, broker, object-storage, clock, ID, and telemetry adapters | P01-R07 | DONE |
| 23 | Compose startup deadlines, dependency readiness, health routes, and the Identity reference skeleton | P01-R08 | DONE |
| 24 | Prove the reference runtime against real local dependencies | P01-R09 | DONE |
| 25 | Publish resource-aware profiles, troubleshooting, and the clean Docker-only Phase 01 closeout | P01-R10 | DONE |
| 26 | Select identity/session trust and implement the guarded local assertion boundary | P02-R01 | DONE |
| 27 | Resolve accounts and implement durable revocable local sessions | P02-R02 | DONE |
| 28 | Implement owned profiles, active selection, deletion policy and transactional outbox (also P02-R04 through P02-R08) | P02-R03 | DONE |
| 29 | Expose the Identity subgraph and verify sanitized authorization and concurrency behavior (also P02-R10) | P02-R09 | DONE |
| 30 | Model rights review, attribution and the title publication lifecycle | P03-R01 | DONE |
| 31 | Persist structured rights revisions and immutable review provenance | P03-R02 | DONE |
| 32 | Implement authorized operator workflow and publication/retirement transactions | P03-R06 | DONE |
| 33 | Implement published-only browse/detail, locale fallback and Catalog Federation schema | P03-R05 | DONE |
| 34 | Verify generated HLS publication, candidate-source reviews and the Catalog Docker runtime | P03-R04 | DONE |
| 35 | Compose versioned Identity/Catalog schemas and protect known operations | P04-R01 | DONE |
| 36 | Run Apollo Router with private subgraphs, trusted context, telemetry and partial-failure acceptance | P04-R02 | IN_PROGRESS |

P02-R09 is complete: [release evidence](../evidence/phase-02/release.txt). P03-R01 has [domain evidence](../evidence/phase-03/catalog-domain.txt); P03-R02 has [persistence evidence and its completed plan](../evidence/phase-03/catalog-persistence.txt). Phase 03 publication is PR 20; no actual-film approval exists.

## Work-item rules

- Move one item to `IN_PROGRESS` before changing code.
- `WAITING_EXTERNAL` requires a frozen evidenced candidate and permits only one later dependent local item under the predecessor-first release rule in `AGENTS.md`.
- Record its plan in `.ai/CHANGE_PLAN.md`.
- Do not mark `DONE` without linked evidence.
- Add newly discovered work only if it belongs to the active phase.
- Record future-phase ideas under the relevant specification rather than implementing them early.
- `READY` items after the active item are ordered runway, not authorization to start them concurrently.
