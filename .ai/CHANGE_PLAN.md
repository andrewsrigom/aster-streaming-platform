# Work Item: Trusted First-Party GraphQL Operations

- Status: IN_PROGRESS
- Owner: Platform
- Phase: 13
- Requirement IDs: P13-R01, P13-R02, P13-R12
- Created: 2026-08-30
- Updated: 2026-08-30

## Outcome

Aster produces one deterministic, versioned manifest for every reviewed
first-party GraphQL operation and packages an exact matcher with Apollo Router.
Explicit local and integration audit mode preserves development, while enforce
mode rejects missing, unknown or altered operations before query planning.
Staging and production cannot start in audit mode. A documented rollout orders
manifest, Router, schema and client changes without breaking active clients.

## Current behavior

Apollo Router 2.17.0 Core composes five owner schemas and accepts 25 named
operations from `infra/router/known-operations.graphql`. Composition validates
those operations and records their hashes in the general schema manifest. The
Router uses a finite operation-name vocabulary for telemetry, but a request can
reuse a known name with a different valid document. APQ and introspection are
disabled. Owners still enforce authorization and bounded product inputs.

Phase12 is released through PR51 main
`2b77a32f43a87fcdfc5032faf856f369de183998`; exact-main run `33348247619`
passed every required job. Item64 starts from that exact main.

## Proposed behavior

Generate an Apollo persisted-query-manifest v1 document and a bounded Rhai
module from the same parsed operation definitions used by composition. Each
entry contains the canonical printed body, operation name/type and SHA-256 ID.
The generated module exposes only finite name and exact name/hash matching.

At Router startup, validate `ASTER_ENV` and
`ASTER_ROUTER_TRUSTED_OPERATIONS_MODE`. `audit` is valid only for `local` and
`integration`; `enforce` is valid for all four environments and mandatory for
`staging` and `production`. Missing or invalid configuration stops startup.
For every supergraph request, require a name and query, hash the raw query bytes
and classify the result as `matched`, `unknown` or `missing`. Enforce mode
rejects non-matches with one sanitized response. Audit mode executes them but
retains the finite classification. Neither mode logs query text or hashes.

## Boundaries

- Owning context: Platform owns edge admission and generated operation artifacts; each bounded context retains schema fields, product decisions and authorization.
- Affected services/packages: `@aster/router`, Apollo Router Rhai/configuration/image, local Compose, CI/runtime verification, GraphQL/security/release documentation and Phase13 evidence.
- Authoritative data: owner PostgreSQL stores remain authoritative; the manifest is a source-derived delivery contract, not product data.
- Read models/caches: no product read model or cache changes; the Router query-plan cache remains bounded and APQ remains disabled.
- Trust boundaries: browser-supplied operation name, document, variables and environment configuration are untrusted.
- External dependencies: existing unmodified Apollo Router 2.17.0 Core and existing GraphQL/composition dependencies; no new package, service, account or paid feature.

## Invariants

- A known operation name alone never authorizes an altered document in enforce mode.
- Missing name/query, unknown name, name/hash mismatch and multi-operation documents fail closed in enforce mode.
- Audit mode is impossible in staging or production and is always explicit.
- Operation hashes, documents, variables, identifiers and credentials never enter telemetry.
- Owner-side authorization remains authoritative after edge admission.
- APQ stays disabled because runtime registration conflicts with a safelist.
- Generated artifacts are deterministic, bounded and stale-output checked.
- Schema/client rollout publishes every required operation before enforcing a client that uses it.

## Failure behavior

| Failure | Expected behavior | Telemetry |
|---|---|---|
| Missing/invalid environment or mode | Router startup fails before readiness | sanitized startup failure only |
| Missing operation name or query | enforce rejects; audit executes only in local/integration | `aster.trusted_operation=missing`, rejected/completed outcome |
| Unknown name or altered body | enforce rejects before planning; audit records and executes | `aster.trusted_operation=unknown`, finite operation label |
| Generated artifact is stale or malformed | schema check/build fails; no image publication | deterministic build failure without document output |
| Matcher/module fails to load | Router remains unready | bounded container startup logs |
| Manifest and active client drift | rollout gate blocks promotion or rollback restores prior compatible artifacts | rejected-operation rate and named release evidence |

## Data and contracts

- Schema/migration: no GraphQL schema or database migration.
- GraphQL: the existing 25 canonical operations become the first trusted-operation set; exact link-ready Apollo documents remain the client transport and one obsolete reviewed body per name may overlap during rollout.
- Events: none.
- Cache: APQ remains disabled; no response-cache or Redis change.
- Compatibility: local/integration audit mode preserves ad hoc diagnostic requests; enforce mode accepts the canonical Apollo Client printer output.
- Retention/deletion: generated artifacts follow source history and immutable image retention; no user data is retained.

## Security and privacy

- Authorization: the Router admits document shape only; owning applications still authorize account/profile/operator/product access.
- Input limits: existing 32 KiB body, 2,000 parser-token, recursion, selection, concurrency and deadline controls remain; later Phase13 items calibrate shape/cost controls.
- Sensitive data: only finite result labels reach metrics/traces/logs; query, hash and variables are absent.
- Abuse cases: known-name substitution, whitespace/comment mutation, unnamed operations, multiple definitions, audit in hosted environments, APQ registration and manifest drift are rejected or tested.

## Implementation steps

1. Record the source-owned manifest, Core Rhai enforcement and environment rollout in ADR-0045.
2. Generate deterministic manifest and matcher artifacts during schema composition.
3. Package the artifacts and enforce the startup/request policy in Router Rhai.
4. Add local/integration audit configuration and a disposable enforce-mode runtime proof.
5. Add deterministic, adverse, telemetry/privacy, Docker-context and CI-policy tests.
6. Document safe operation/schema rollout and capture Phase13 evidence.

## Tests

- Domain: not applicable; no product domain rule changes.
- Application: artifact generation rejects unnamed, duplicate, excessive, malformed and incompatible operation sources.
- Integration: the pinned real Router starts in audit/enforce modes, accepts a canonical operation and rejects altered, unknown and missing inputs in enforce mode.
- Contract: Apollo manifest format/version/body/ID/type, generated-module determinism, artifact bounds/staleness, Docker packaging and environment matrix.
- Browser: existing Docker-only demo proves Apollo Client canonical operations still work; no UI behavior changes.
- Performance/failure: bounded startup failure and finite rejection telemetry; operation hash cost is calibrated later with the Phase13 cost/load slice.

## Evidence

- Commands: focused Router build/tests, schema check/update, Router source/platform policy, exact Router config/startup proof, `pnpm check:changed`, documentation/AI checks, secret scan and protected CI.
- Raw artifact path: `evidence/phase-13/trusted-operations.txt` and generated artifacts under `infra/router/generated/`.
- Acceptance result: corrected source `0e4a4b3`, Router11/11, Web118/118,
  focused policy36/36 and the 49/49 affected candidate gate pass; the corrected
  pinned packaged Router proof passed protected run `33352310376`. Confirmation
  review discussion `3891493400` identified that verifier-only changes could skip
  that proof; the bounded CI-classifier correction and repeated gates remain.
- Iteration gate: Router composition tests plus Router source/runtime policy tests and `git diff --check`.
- Candidate gate: `CI=true NODE_OPTIONS=--max-old-space-size=1536 TURBO_CONCURRENCY=4 pnpm check:changed`, documentation/AI checks and zero-finding secret scan.
- Heavyweight repeat triggers: repeat the real Router enforce-mode proof when operation generation, matcher logic, startup mode policy, Router image/config/Rhai packaging or rejection telemetry changes; repeat the Docker playable journey when canonical client documents or admission behavior changes.
- Review stopping rule: one complete initial review and one confirmation; extend only for requirement, manifest integrity, security/privacy, availability, authorization or public-contract blockers.

## Rollback or recovery

Restore the previous Router image/config/Rhai and eight-artifact composition
set. No schema, database, Redis, event, media or credential rollback is needed.
During a compatible rollout, retain the old reviewed wire body in
`infra/router/retained-operations.graphql`; generation permits at most two
distinct bodies per name. Remove it only after active clients no longer use it.

## Documentation updates

- ADR-0045, GraphQL/security architecture, configuration and release process.
- Router README, Phase13 evidence index, repository state, queue, decision ledger, session log and handoff.
- Phase12 evidence closeout with final protected/main release coordinates.

## Completion checklist

- [ ] Requirements satisfied
- [ ] Tests pass
- [x] Evidence captured
- [x] Documentation current
- [x] `.ai/` state activated
- [x] Remaining risks recorded
