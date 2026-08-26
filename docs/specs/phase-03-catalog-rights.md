# Phase 03 — Catalog and Content Rights

## Objective

Implement a catalog whose publication lifecycle is inseparable from verified content rights and attribution.

## Product traceability

- Primary: `CAT-R01`, `CAT-R02`, `CAT-R03`, `CAT-R05`, `CAT-R06`, `CAT-R07`.
- Supports: `CAT-R04`, `GQL-R03`, `QLT-R01`, `QLT-R04`.
- Final positive acceptance of `CAT-R04` occurs in Phase 06; this phase proves that publication is rejected without validated media.

## Prerequisites

- Phase 02 is verified.
- At least one candidate film has an official source page available for rights review, but no asset download is required yet.

## Deliverables

- Catalog domain and subgraph
- title, credits, genre, localization, artwork, and rights persistence
- rights-review workflow
- title lifecycle state machine
- public browse and title detail
- operator-only catalog commands or minimal interface
- candidate source records with evidence
- deterministic synthetic publication reference and small generated HLS fixture for Catalog and later web tests

## Requirements

### P03-R01

Implement the title lifecycle and reject invalid transitions.
### P03-R02

Store complete structured rights records with evidence locations and review status.
### P03-R03

Prevent rights approval when required fields or permissions are unresolved.
### P03-R04

Prevent publication until rights are approved and a validated media publication exists. Phase 03 tests the positive path with a deterministic generated technical fixture through the same Catalog application contract; Phase 06 supplies and verifies the real worker integration.
### P03-R05

Provide public keyset-paginated browse and title detail for published titles only.
### P03-R06

Provide operator-only create, edit, review, publish, retire, and dispute commands with audit records.
### P03-R07

Generate attribution data from the approved rights record rather than freehand UI text.
### P03-R08

Record localized title metadata and deterministic locale fallback.
### P03-R09

Create reviewed candidate records for a small set of official open-film sources; record uncertainty instead of assuming permission.
### P03-R10

Retiring or disputing a title must remove it from public reads and produce a versioned event/outbox record.

## Invariants

- Only an approved rights record can support publication.
- A published title references exactly one active validated publication.
- Rights status changes are auditable.
- Public reads never expose draft or disputed titles.
- Attribution is derived from the reviewed record.

## Implementation sequence

1. Model rights and title lifecycle.
2. Create migrations and constraints.
3. Implement operator application use cases.
4. Implement public query use cases.
5. Add Catalog GraphQL schema.
6. Review candidate sources and store evidence.
7. Test state transitions and authorization.
8. Document the title lifecycle.

## Required tests

- Complete state-transition table.
- Missing or contradictory rights fields.
- Concurrent publish and dispute.
- Public filtering of non-published titles.
- Locale fallback.
- Keyset pagination stability.
- Operator authorization and audit.

## Required evidence

Store the phase evidence index under `evidence/phase-03/` when implementation begins.

- rights-review records
- state-machine tests
- public schema
- query plans for browse and title detail
- sample generated attribution
- retirement event record

Every measured result must identify commit, environment, exact command, workload, raw artifact, interpretation, and limitations.

## Non-goals

- Downloading or transcoding source media
- Processing a real catalog film
- Playback
- Search ranking
- Personalized home
- Public content upload

## Exit gate

The phase is `VERIFIED` only when:

- every requirement has a linked implementation or documented non-applicability;
- all required tests pass from a clean environment;
- evidence is stored and reviewed;
- security, accessibility, failure, and operational effects are documented;
- no planned behavior is described as implemented;
- `.ai/CURRENT_STATE.md`, `.ai/WORK_QUEUE.md`, `.ai/SESSION_LOG.md`, and `.ai/HANDOFF.md` are current;
- the next phase prerequisites are explicitly checked.

## Learning outcomes

- Domain state machines
- Rights as product data
- Keyset pagination
- Audit and publication invariants

## Agent constraints

- Load `skills/agent.md` and every skill related to this phase.
- Do not implement later-phase capabilities to hide an incomplete requirement.
- Do not add placeholder services, dashboards, events, or metrics.
- Use requirement IDs in the active change plan.
- Stop and write an ADR when a fixed architecture decision must change.
