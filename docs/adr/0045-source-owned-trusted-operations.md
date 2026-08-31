# ADR-0045: Enforce source-owned trusted GraphQL operations

- Status: Accepted
- Date: 2026-08-30
- Owners: Platform and Web
- Related requirements: P13-R01, P13-R02, P13-R12
- Supersedes: none
- Superseded by: none

## Context

Aster already composes and validates 25 named first-party operations, but the
runtime accepts any syntactically valid GraphQL document. Operation-name-only
telemetry cannot distinguish an approved document from an altered document that
reuses its name. Hosted GraphQL therefore needs an exact, reviewable operation
contract without making local development depend on GraphOS credentials or a
paid control plane.

Apollo Router Core supports repository-owned Rhai request policy. Its native
arbitrary APQ registration is intentionally disabled and is not a safelist.
GraphOS persisted-query-list delivery would add hosted credentials, availability
and plan constraints that belong to Phase 14.

## Decision

`infra/router/known-operations.graphql` remains the authoritative first-party
source. The existing bounded composition command prints every named operation,
hashes the exact UTF-8 body with SHA-256 and deterministically generates:

- Apollo persisted-query manifest format version 1, containing operation name,
  type, exact body and ID;
- a finite Rhai matcher containing only operation names and hashes;
- the existing delivery manifest, which hashes both generated artifacts.

Router imports the generated matcher and classifies every request as `matched`,
`unknown` or `missing`. A match requires both the exact operation name and exact
raw query hash. Query text, hash, variables and client-supplied labels never enter
logs, traces or metric attributes.

Startup requires explicit `ASTER_ENV` and
`ASTER_ROUTER_TRUSTED_OPERATIONS_MODE`. `audit` is accepted only for `local` and
`integration`; it records the finite result while allowing ad hoc diagnostic
documents. `enforce` rejects every non-match before query planning and is
mandatory for `staging` and `production`. Missing, unknown or contradictory
values fail startup. Local Compose sets `local`/`audit` explicitly. A disposable
integration overlay proves `enforce` against the real Router.

The Web build must keep using documents represented by the generated manifest.
Schema changes use add-first evolution: add compatible owner fields, update and
deploy the manifest and Router policy, deploy the client, observe the old
operation window, then remove obsolete schema and operation entries in a later
reviewed release. Rollback restores the prior complete generated set and Router
image; never hand-edit one artifact.

## Consequences

### Positive

- Hosted first-party traffic has a deterministic finite operation surface.
- Operation review remains offline, versioned and reproducible.
- Local diagnosis remains possible through an explicit non-hosted mode.
- The policy does not add a service, credential, database or external outage
  dependency.

### Negative

- Any client document formatting change changes its hash and must ship through
  the manifest rollout.
- Audit mode deliberately does not protect a public deployment and must never be
  accepted for staging or production.
- This slice does not yet replace parser, shape, cost, rate or owner authorization
  controls; later Phase 13 work remains required.

### Security and privacy

Unknown and altered documents fail before planning in enforce mode. Owner
services still authorize every owned resource; a trusted operation is not user
authority. APQ remains disabled, batching gains no alternate path, and the only
public GraphQL path remains Router POST `/graphql`.

## Alternatives considered

### Use APQ as the operation allowlist

Rejected because arbitrary clients can register new APQ entries; caching a query
does not make it trusted.

### Require GraphOS persisted query lists now

Deferred because it creates hosted credentials and control-plane dependencies
owned by Phase 14. The source manifest remains compatible with later publication.

### Match only operation names

Rejected because an attacker can reuse an approved name for an altered document.

### Disable ad hoc local operations

Rejected because bounded diagnostic and learning workflows need explicit local
queries. Audit mode makes that exception visible and impossible in hosted modes.

## Validation

Composition tests prove deterministic one-to-one name/body/hash generation,
artifact bounds and altered-hash rejection. Source policy tests prove explicit
environment/mode validation, artifact packaging, finite telemetry and absence of
query/hash labels. The disposable Router proof accepts one canonical operation
and rejects altered, unknown and missing operations in enforce mode. Protected CI
must pass before merge.

## Migration and rollback

Generate and commit the complete artifact set, build Router with both artifacts,
run local audit-mode compatibility, then run the disposable enforce-mode proof.
Hosted deployment may use only enforce mode. Rollback deploys the preceding
Router image and its preceding complete manifest/matcher set; there is no data,
schema, event, cache or credential migration.

## Sources

- [Apollo persisted queries](https://www.apollographql.com/docs/graphos/routing/security/persisted-queries)
- [Apollo Router Rhai customization](https://www.apollographql.com/docs/graphos/routing/customization/rhai)
- [Apollo Router Rhai API reference](https://www.apollographql.com/docs/graphos/routing/customization/rhai/reference)
