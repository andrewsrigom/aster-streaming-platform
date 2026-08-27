# Work Item: Private subgraphs behind the local Apollo Router

- Status: IN_PROGRESS
- Owner: Platform transport; Identity and Catalog retain their data
- Phase: 04
- Requirement IDs: P04-R02, P04-R03, P04-R06, P04-R07, P04-R09
- Created: 2026-08-27
- Updated: 2026-08-27

## Outcome

The local GraphQL entry point will execute the composed Identity/Catalog schema through the real Apollo Router, preserve owner-validated sessions and demonstrate bounded partial failure without publishing subgraph ports.

## Current behavior

All Phase 04 local requirements and author confirmation pass at source b5d7ab7. PR 21's first protected run 33100857323 exposed stale compatibility wiring: the Identity demo omitted --compose-router, and the standalone Catalog probe inherited private-only networking and an unused credential mount. The correction uses the documented internal Router route and explicit standalone diagnostic overlay without owner trust mounts. Cleanup permits only exact owned PostgreSQL data and unused disposable trust volumes, with labels and foreign attachments checked. CI regression tests 25/25, Catalog guards 3/3, the exact Identity command and fresh Catalog Docker proof pass. Normal runtime trust, topology, deadlines and permissions do not change. Publish one combined remediation after the candidate gate; protected release remains open.

## Proposed behavior

Use the pinned upstream Router with source-owned YAML/Rhai hooks, generated SDL and private subgraphs. Define the separate local Router credential and cookie boundary in ADR-0017 before wiring it. Keep standalone owner transports available only through an explicit diagnostic configuration. Do not add an aggregation server or a hosted dependency.

## Boundaries

- Owning context: Identity authorizes sessions/profiles; Catalog owns published reads.
- Affected services/packages: apps/router, packages/http-express and config, services/identity and catalog, infra/router, infra/compose, tools and focused tests.
- Authoritative data: existing owner PostgreSQL records, unchanged.
- Read models/caches: unchanged; Router credentials are not product authority.
- Trust boundaries: public loopback HTTP to Router; separate authenticated private owner transport; public cookies go only to Identity.
- External dependencies: pinned unmodified Apollo Router image, local Docker and existing PostgreSQL/Redis. No GraphOS account, license key or paid service.

## Invariants

- Only Router publishes GraphQL in the target topology; public identity/forwarding headers cannot confer authority.
- Identity retains signature, durable session/revocation, ownership, Origin and CSRF checks.
- No raw operations, variables, cookies, service keys or account/profile IDs in telemetry.
- No schema, database migration, owner boundary or event change. No unsafe mutation retries.

## Failure behavior

| Failure | Expected behavior | Telemetry |
|---|---|---|
| Invalid public headers or private credential | Reject before owner execution | Bounded rejection outcome |
| Missing/malformed service key or SDL | Fail startup closed | Sanitized initialization error |
| One subgraph unavailable or timed out | Nullable mixed query retains healthy owner's data | Subgraph/duration/outcome and trace |
| Body/concurrency limit | Bounded rejection, no queue growth | Rejection outcome |
| Client cancellation/shutdown | Cancel fetches; bounded drain | Runtime outcome |
| Telemetry sink unavailable | Product work remains bounded | Export failure, no credentials |

## Data and contracts

- Schema/migration: none; use existing generated supergraph and twelve known operations.
- GraphQL: preserve nullable ViewerAndTitle roots, sanitized public errors and session cookies.
- Events/cache/retention: unchanged. Runtime trust material is disposable and purpose-separated.
- Compatibility: old direct HTTP checks use an explicit diagnostic mode; the normal demo uses Router.

## Security and privacy

- Authorization: owners remain authoritative; per-owner local service credentials authenticate transport only.
- Input limits: 32 KiB bodies, finite headers, bounded edge parsing, existing owner depth/alias limits, deadlines and concurrency. Do not configure GraphOS-key-gated native operation limits.
- Sensitive data: read-only secret mounts; no credentials in source, commands, evidence or logs.
- Abuse cases: forged headers, direct calls, cookie leakage, duplicate credentials, cross-account access, query saturation and unavailable subgraphs.

## Implementation steps

1. Verify exact Router license/configuration support; record ADR and credential lifecycle.
2. Implement/test owner trust adapters and Router hooks/configuration.
3. Wire resource-bounded Docker topology and diagnostic compatibility.
4. Exercise real sessions, negative boundaries, partial failure, limits, query plans and traces.
5. Review one coherent candidate, capture evidence and complete protected release gates.

## Tests

- Domain/application: existing owner suites; no business behavior changes.
- Integration: real Router, Identity, Catalog and PostgreSQL; sign-in/select/revoke, private access and partial timeout.
- Contract: schema check; Router startup against pinned version; transport negative tests.
- Acceptance-gate remediation: use Node test MockTimers for the broker late-connect/close ordering test; retain its pending/closing/closed and late-result assertions. Run the focused broker suite, then repeat clean-source full acceptance. This test-only change does not invalidate Router, SQL, media or real-broker runtime evidence.
- The forced clean run also exposed the same clock race in the S3 capacity fixture and a 3-second child-process startup cutoff during cold AWS SDK loading. Freeze only that fixture's timers and give the diagnostic process a finite 10-second startup/execution envelope; its actual 100/150/500 ms connection/operation/close deadlines and outcome assertions remain unchanged. Repeat the S3 suite and the complete gate, retaining successful unchanged task evidence.
- Browser: not applicable before the web phase; HTTP cookie journey here.
- Performance/failure: bounded admission, cancellation, body limit and one owner failure; no throughput claim.

## Evidence

- Commands: focused package builds/tests, Router config/runtime probe, pnpm check:changed and pnpm check.
- Raw artifact path: evidence/phase-04/.
- Acceptance result: local runtime, author review, full clean-source and fresh Docker acceptance pass; evidence/phase-04/clean-acceptance.txt. Exact protected CI and release remain pending.
- Iteration gate: changed transport tests and pinned Router config/startup probe.
- Candidate gate: affected-scope checks plus the full phase runtime acceptance and schema compatibility.
- Heavyweight repeat triggers: changes to trust, routing, Docker packaging, deadlines, cookie propagation or telemetry repeat affected runtime checks; prose-only changes do not repeat Docker/media work.
- Review stopping rule: one initial and one confirmation review; repeat only for a changed blocking requirement/security/data/availability/public-contract boundary.

## Rollback or recovery

Stop only the owned verification stack. Revert this runtime slice to the verified schema commit, leaving owner PostgreSQL data intact. Recreate ephemeral Router credentials and restart their consumers together to rotate trust. No broad Docker cleanup or production migration.

## Documentation updates

ADR-0017, Router usage, local topology/runbook, phase evidence and repository memory at meaningful checkpoints.

## Completion checklist

- [ ] Requirements satisfied
- [ ] Tests pass
- [ ] Evidence captured
- [ ] Documentation current
- [ ] `.ai/` state updated
- [ ] Remaining risks recorded
