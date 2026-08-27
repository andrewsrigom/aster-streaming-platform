# Work Item: Owned Profiles and Transactional Profile Events

- Status: IN_PROGRESS
- Owner: Identity and Profiles
- Phase: 02
- Requirement IDs: P02-R03, P02-R04, P02-R05, P02-R06, P02-R07, P02-R08, P02-R09, P02-R10
- Created: 2026-08-27
- Updated: 2026-08-27

## Outcome

Implement bounded owned-profile creation, listing, update, active selection and idempotent deletion with audit and versioned outbox facts in the same durable transaction. No browser or broker relay is part of this item.

## Current behavior

P02-R01/R02 are locally verified on feat/p02-identity-session: guarded signed identity, durable account/session policies, explicit PostgreSQL repositories, migration 0001 and bounded one-client transactions. Current source passes 91 Identity tests, 29 PostgreSQL tests, all 49 source tasks, audit and real database failure/migration checks. Health-only runtime remains released behavior; product transport is unwired.

## Proposed behavior

Build profile invariants and application ports inside Identity, extend its schema with migration 0002, then prove owner isolation, concurrent limits, atomic audit/outbox and retry-safe deletion against the existing isolated PostgreSQL fixture. Define concrete normalization, configuration, version, idempotency and retention policies before implementing their contracts.

## Boundaries

- Owner/data: Identity and Profiles owns accounts, sessions, profiles, selection and profile audit/outbox writes.
- Paths: services/identity domain, application, infrastructure/persistence, migrations and tests; use the existing packages/postgres transaction owner.
- Trust: require an authenticated durable session; a supplied account/profile ID alone is never authorization.
- Events: durable identity.profile-created, identity.profile-updated and identity.profile-deleted, schema version 1. No publication before commit; relay and consumers remain Phase 08.
- Dependencies: current PostgreSQL and Node primitives; no new ORM, broker client, service or hosted resource.
- Relevant decisions: ADR-0002, ADR-0004, ADR-0007 and ADR-0013; product IDP-R02 through IDP-R05.

## Invariants

- An account cannot read, mutate or select another account's profile, including identifier substitution.
- Configured profile count holds under concurrent transactions; acquire the account lock before count/write.
- Normalize and bound display name, locale and maturity input at the owner; reject unknown/unsafe values.
- Deletion cannot delete its account or leave a selected deleted profile usable.
- State, audit and outbox changes commit together; failure in any part rolls back all.
- Duplicate/stale mutations have documented bounded idempotency/version behavior.
- Events/audit contain necessary opaque identifiers and facts, never credentials or unnecessary profile display data.

## Failure behavior

| Failure | Expected behavior | Evidence |
|---|---|---|
| Missing, expired or revoked durable session | Unauthenticated before profile access | Application and real DB tests |
| Unknown or wrong-account profile | Stable non-disclosing outcome; no side effects | Owner-isolation matrix |
| Concurrent create at the configured limit | No committed excess profile | Barrier-coordinated DB test |
| Stale update or duplicate mutation | Defined version/idempotency outcome | Domain and DB tests |
| Audit/outbox insert failure | Profile and related state rolled back | Real transaction fault injection |
| Repeated deletion or selected-profile deletion | Retry-safe result and unusable deleted selection | Application and DB tests |
| Database timeout/cancel/outage | Fail closed, retire uncertain lease, no automatic write retry | Existing transaction proof plus affected profile cases |

## Data and contracts

- Migration 0002 is additive to accounts/sessions; define ownership, constraints, indexes and restrictive rollback before executing it.
- Reuse the account lock and bounded SQL seam; keep each result within its 64-row bound.
- Resolve profile limit/default, display-name normalization, locale/maturity values and optional avatar policy from the minimal accepted product scope; record exact choices here before code.
- Define selection scope (session/request), deletion retention/retry behavior, audit/outbox limits and later cleanup/relay ownership explicitly; no unbounded process cache or silent retention default.
- Use the existing versioned event envelope with opaque IDs, producer, aggregate version, correlation/causation and optional trace context.
- GraphQL/error transport remains the next item. Current application outcomes must be ready to map to stable public codes without raw database causes.

## Security and privacy

Revalidate durable session and profile ownership in the owning application transaction. Never accept a request-selected account as authority or log session credentials. Use synthetic fixtures only. Profile deletion removes display/preference data according to the recorded policy; retained audit/outbox facts must be minimally identifying and have explicit retention/replay bounds.

## Implementation steps

1. Inspect existing product/context contracts and select reversible bounded profile, selection, idempotency and deletion policies.
2. Add profile domain/application behavior and deterministic tests before transport.
3. Add migration 0002, owner repositories, audit/outbox writes and transaction composition.
4. Prove real owner isolation, concurrent limits, duplicate/stale behavior, deletion and rollback on audit/outbox faults.
5. Capture evidence, complete candidate/full checks and one initial plus confirmation review; checkpoint locally with coherent code, not metadata-only publication.

## Tests

- Domain: normalization, locale/maturity, configured count, versions, deletion and duplicate semantics.
- Application: authenticated ownership on create/list/update/delete/select; stable errors.
- Integration: real concurrency, session expiry/revocation, cross-account substitution, audit/outbox atomicity, migration up/down and deadline retirement.
- Events: exact versioned envelope and required facts; no secrets or unnecessary preference fields.
- Browser/media/broker delivery: not applicable until their owning items.

## Evidence

- Iteration gate: dependency-aware focused build, profile/session tests and affected static checks.
- Candidate gate: pnpm check:changed and the real profile PostgreSQL scenario.
- Complete gate: all named owner/security/data/failure tests, migration evidence, complete source graph and audit; protected exact-head CI before eventual merge.
- Artifact: evidence/phase-02/profiles-outbox.txt.
- Heavyweight repeat triggers: behavior changes to profile SQL, migrations, transactions, failure handling or fixture ownership repeat affected DB proof. Prose/type-only changes with passing source checks retain unchanged evidence.
- Review stopping rule: one complete initial review plus one confirmation; further rounds only for demonstrated requirement, security, data, availability or public-contract blockers.

## Rollback or recovery

Keep migration 0001 and account/session validity intact. Test restrictive rollback of only the new profile-owned schema objects against disposable data. No destructive user-data recovery, hosted migration or unrelated Docker cleanup is authorized. Before real retained profile data exists, document when roll-forward is required.

## Documentation updates

Record actual profile policies, deletion/retention and event contracts in the relevant product/phase/operations documents; update evidence and concise repository memory at the coherent candidate checkpoint.

## Completion checklist

- [ ] Requirements satisfied
- [ ] Tests pass
- [ ] Evidence captured
- [ ] Documentation current
- [x] .ai state updated
- [x] Remaining risks recorded
