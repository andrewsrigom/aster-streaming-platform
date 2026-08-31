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

`infra/router/known-operations.graphql` remains the authoritative current
first-party source. The bounded composition command applies Apollo Client's
link-ready `__typename` transform, prints every named operation, hashes that
exact UTF-8 wire body with SHA-256 and deterministically generates:

- Apollo persisted-query manifest format version 1, containing operation name,
  type, exact link-ready body and ID;
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
values fail startup. Known names retain their finite operation label in audit
mode so local SLI diagnostics remain useful; an unknown name is always `other`.
Local Compose sets `local`/`audit` explicitly. A disposable integration overlay
proves `enforce` against the real Router.

The Web build must keep sending documents represented by the generated manifest,
and a test captures the actual `HttpLink` request body. Schema changes use
add-first evolution. During a document transition,
`infra/router/retained-operations.graphql` may retain one obsolete reviewed body
per name, so the generated matcher accepts at most two distinct hashes for that
name. Retained operations are parsed and schema-validated, but their reviewed
source slices are preserved and hashed byte-for-byte rather than reprinted by
the current GraphQL/Apollo toolchain. Deploy the union and Router policy before
the client, observe the overlap, then remove the obsolete body in a later
reviewed release. Once the new client hash has served traffic, the union Router
image becomes the rollback floor: a client rollback keeps that Router until
old browser bundles drain and telemetry proves the new hash is absent. A faulty
union Router must roll forward to another image containing both hashes; never
restore a pre-union Router while either client version may remain active.

## Consequences

### Positive

- Hosted first-party traffic has a deterministic finite operation surface.
- Operation review remains offline, versioned and reproducible.
- Local diagnosis remains possible through an explicit non-hosted mode.
- The policy does not add a service, credential, database or external outage
  dependency.

### Negative

- Any client wire-document formatting change changes its hash and must ship
  through the bounded overlap rollout.
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

Composition tests prove deterministic current generation, byte-exact retained
name/body/hash preservation, artifact bounds, the two-version ceiling, the union
rollback floor and altered-hash rejection.
Web tests capture actual Apollo `HttpLink` request bodies and compare them with
the manifest. Source policy tests prove explicit environment/mode validation,
artifact packaging, finite telemetry and absence of query/hash labels. The
disposable Router proof accepts one canonical operation and rejects altered,
unknown and missing operations in enforce mode. Protected CI must pass before
merge.

## Migration and rollback

Generate and commit the complete artifact set, build Router with both artifacts,
run local audit-mode compatibility, then run the disposable enforce-mode proof.
Hosted deployment may use only enforce mode. Before any new client traffic, the
preceding Router image remains a valid rollback. After the new hash serves, roll
back the client while retaining the union Router; existing browser bundles are
not assumed to drain immediately. Remove either hash only after the compatibility
window and telemetry prove it inactive. If the union Router itself fails after
new-client exposure, roll forward to a compatible union image. There is no data,
schema, event, cache or credential migration.

## Sources

- [Apollo persisted queries](https://www.apollographql.com/docs/graphos/routing/security/persisted-queries)
- [Apollo Router Rhai customization](https://www.apollographql.com/docs/graphos/routing/customization/rhai)
- [Apollo Router Rhai API reference](https://www.apollographql.com/docs/graphos/routing/customization/rhai/reference)
