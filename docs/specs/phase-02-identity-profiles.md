# Phase 02 — Identity and Viewer Profiles

## Objective

Implement secure account access and profile ownership as the foundation for personalized product behavior.

## Product traceability

- Primary: `IDP-R01`, `IDP-R02`, `IDP-R03`, `IDP-R04`, `IDP-R05`.
- Supports: `GQL-R03`, `QLT-R01`, `QLT-R04`.

## Prerequisites

- Phase 01 is verified.
- Identity adapter options have been evaluated against local, hosted, security, and maintenance requirements.

## Deliverables

- identity adapter ADR
- account and session integration
- profile domain model and persistence
- profile GraphQL subgraph schema
- profile authorization policies
- audit events and profile deletion behavior
- browser-independent integration tests
- deterministic local demo identity that requires no hosted account or secret

## Requirements

### P02-R01

Select and record the identity adapter, session model, claim validation, and local-development method. The local method must issue or resolve a synthetic account through a server-controlled trust boundary without hosted credentials, public identity headers, or a code path that can be enabled accidentally in hosted environments.
### P02-R02

Implement account resolution from a verified identity without trusting public identity headers.
### P02-R03

Create profiles with normalized display name, locale, maturity setting, and configured account limit.
### P02-R04

List only profiles owned by the authenticated account.
### P02-R05

Update and delete profiles with owner-side authorization and idempotent behavior where applicable.
### P02-R06

Expose an explicit active-profile selection mechanism without treating a client-provided profile ID as proof of ownership.
### P02-R07

Define profile deletion propagation, retention, audit, and retry behavior.
### P02-R08

Write versioned profile-created, profile-updated, and profile-deleted outbox records in the owning transaction. Phase 02 verifies durable outbox creation but does not require broker delivery; Phase 08 activates and verifies the relay and consumer behavior.
### P02-R09

Return sanitized stable error codes for authentication, authorization, validation, conflict, and limit outcomes.
### P02-R10

Cover token/session expiry, wrong-account access, identifier substitution, duplicate request, and concurrent profile-limit checks.

## Invariants

- An account cannot access another account's profiles.
- Profile count cannot exceed the configured limit under concurrency.
- Deleting a profile cannot delete account-level identity.
- Public clients cannot grant themselves operator or account roles.
- Identity secrets never enter GraphQL responses, logs, traces, or client state.

## Implementation sequence

1. Write the identity adapter ADR.
2. Model account and profile invariants.
3. Create migrations and repositories.
4. Implement application policies and use cases.
5. Add GraphQL transport.
6. Add audit and outbox behavior.
7. Run authorization and concurrency tests.
8. Document session and deletion behavior.

## Required tests

- Account resolution with valid, expired, malformed, wrong-issuer, and wrong-audience identity.
- Concurrent creation at the profile limit.
- Cross-account profile read, update, and delete attempts.
- Profile deletion retry.
- Database transaction rollback on audit or outbox failure.
- GraphQL error sanitization.
- Local demo identity startup from empty state and rejection when a hosted environment attempts to enable the local-only adapter.

## Required evidence

Store the phase evidence index under `evidence/phase-02/` when implementation begins.

- identity decision record
- authorization test matrix
- concurrent profile-limit test
- sample sanitized trace
- migration and rollback output
- subgraph schema artifact

Every measured result must identify commit, environment, exact command, workload, raw artifact, interpretation, and limitations.

## Non-goals

- Watchlists and progress
- Catalog preferences
- Recommendations
- Billing
- Social login breadth beyond the selected initial adapter
- Public signup, password recovery, email verification, and multi-factor enrollment UI

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

- Identity trust boundaries
- Owner-side authorization
- Concurrent invariant enforcement
- Clean architecture around external identity systems

## Agent constraints

- Load `skills/agent.md` and every skill related to this phase.
- Do not implement later-phase capabilities to hide an incomplete requirement.
- Do not add placeholder services, dashboards, events, or metrics.
- Use requirement IDs in the active change plan.
- Stop and write an ADR when a fixed architecture decision must change.
