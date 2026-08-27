# Work Item: Guarded Local Identity Subgraph

- Status: IN_PROGRESS
- Owner: Identity and Profiles
- Phase: 02
- Requirement IDs: P02-R01, P02-R02, P02-R03, P02-R04, P02-R05, P02-R06, P02-R07, P02-R08, P02-R09, P02-R10
- Created: 2026-08-27
- Updated: 2026-08-27

## Outcome

Expose the implemented session/profile policies through a bounded local Federation v2 subgraph, with protected cookie transport, stable errors and a reproducible empty-state product startup. Publish one coherent candidate only after local acceptance; no browser UI or Router trust shortcut.

## Current behavior

P02-R01 through P02-R08 are locally verified: local signed assertions, account/session persistence, owned profiles/selection and transactional audit/outbox. Identity has 111 passing tests; real profile scenario and all 49 source tasks pass. Evidence: evidence/phase-02/profiles-outbox.txt. Runtime still exposes Phase 01 health only; product modules are unwired and this branch is not pushed.

## Proposed behavior

Use the existing Express adapter and maintained Apollo integration. Select exact compatible Federation/schema dependencies from current primary sources, create a small owner schema/resolver boundary, protect every local credential/mutation request, compose sessions/profiles into runtime, and verify real HTTP-to-database behavior. Preserve health-only startup when local product mode is disabled.

## Boundaries

- Owner/data: Identity and Profiles; existing PostgreSQL schema and bounded transaction adapter.
- Paths: services/identity transport/composition/migrations/tests; packages/config and packages/http-express only where shared runtime contracts require extension; existing local Compose/CI scripts for runnable acceptance.
- Trust: browser input/cookies/Host/Origin/GraphQL are untrusted. Authenticate and authorize in owner application code; no public account/role header.
- Decisions: ADR-0002, 0003, 0004, 0007, 0011 and 0013.
- Skills: agent, architecture, node-runtime, graphql-federation, security, resilience, observability, data-events, testing, release-operations and documentation.
- No hosted provider, Router, broker relay, new service or UI before its owning phase. Phase 04 defines protected Router-to-subgraph context.

## Invariants

- Local activation requires local environment, explicit opt-in and canonical HTTP loopback origin. No hosted flag-only bypass.
- Credentials exist only in host-only HttpOnly/SameSite=Strict cookies and owner verification; never GraphQL data/errors, URLs, logs or client state.
- Mutations, including unauthenticated sign-in, require exact Host/Origin, non-simple JSON and an explicit CSRF request header; reject forged/ambiguous headers and cross-origin requests before execution.
- Runtime credentials cannot migrate or change ownership keys. Migrations are separate finite owner work; startup cannot blindly recreate/drop retained state.
- Resolvers translate typed use cases, not SQL/business rules. Owner isolation remains enforced on entity resolution and list/read/mutation paths.
- Cap bodies, tokens, aliases/depth/cost, batch size, concurrency and execution time. Propagate request AbortSignal; no retry of uncertain writes.
- Product startup/shutdown has one resource owner; preserve finite health/recovery and graceful drain.

## Failure behavior

| Failure | Expected behavior | Telemetry |
|---|---|---|
| Invalid origin/host/CSRF/cookie or unsupported method | Reject before credentials or mutation execution | Stable code, no request content |
| Invalid/expired/revoked session or wrong-account profile | Owner-checked sanitized unauthenticated/not-found outcome | Bounded operation/result labels |
| Invalid input, stale version, profile/journal limit | Stable validation/conflict/limit/backpressure code | No raw schema/database cause |
| Database unavailable, cancelled or unknown commit | Fail closed; no automatic write retry; receipt semantics preserved | Existing bounded dependency status |
| Oversized or abusive operation | Reject before unbounded resolver/database work | Finite rejection categories |
| Process shutdown or failed product startup | Stop admission, cancel/drain, close each constructed owner once | Sanitized lifecycle status |

## Data and contracts

- Preserve migrations 0001/0002 and existing profile retention/deletion policies in services/identity/migrations/README.md.
- Plan schema artifacts under services/identity transport; stable Profile key, explicit owned viewer/selection and mutation metadata. Never expose raw persistence session records.
- Profile entity batching must be request-scoped, owner-authorized and bounded; no process-wide data cache.
- Single-subgraph composition proves Federation compatibility now; multi-context composition/routing and hosted trusted operations remain Phase 04.
- Use a distinct local cookie name and no Domain attribute. Absolute cookie expiry must match the durable 30-minute session; clear on acknowledged logout only, never pretend failed revocation succeeded.
- Source/metadata compatibility research and exact operation budgets must be recorded before implementing those boundaries.

## Security and privacy

Read SECURITY.md and skills/security.md. Reject client-selected identity/roles, duplicate credentials and spoofed forwarding headers; do not trust proxy headers by default. Same-origin JSON/custom-header CSRF policy includes sign-in; CORS does not allow foreign origins. Public errors are fixed messages/codes without documents, variables, token fragments or database causes. Test real sockets and actual owner persistence.

## Implementation steps

1. Restore transport/runtime/configuration contracts and verify exact Apollo/Federation compatibility.
2. Implement local Host/Origin/CSRF/cookie policy and focused adverse tests.
3. Build owner schema/resolvers, sanitized errors and bounded request-scoped entity batching; prove composition and operation controls.
4. Wire finite product startup/migration ownership and existing local packaging without weakening health-only behavior.
5. Verify empty-state sign-in/profile/selection/update/delete/sign-out and adversarial/failure cases against real PostgreSQL and HTTP.
6. Capture candidate evidence; initial plus confirmation review; publish once, wait protected exact-head CI, squash and verify post-merge before Phase 03.

## Tests

- Domain/application: retain existing suites and add only new required policies.
- Transport: real sockets for headers/cookies/CSRF, errors, expiry/revocation, ownership/substitution, duplicate/concurrent requests, cancellation and bounded abuse.
- Contract: schema build/composition, entity ownership/batching, supported operations, no credential fields.
- Runtime: empty-state migration/start, separate privileges, repeated start without data loss, shutdown/failure cleanup and exact package contents.
- Browser UI: not applicable until Phase 05; browser-independent HTTP acceptance required now.

## Evidence

- Iteration gate: cheapest focused dependency-aware build/test/static check for the changed boundary.
- Candidate gate: pnpm check:changed, schema/operation checks and affected real HTTP/database scenario.
- Complete gate: Phase 02 acceptance from clean local state, full protected exact-head CI including combined integration and Docker product proof, dependency audit.
- Raw artifact: evidence/phase-02/identity-subgraph.txt; update phase index at candidate checkpoints.
- Heavyweight repeat triggers: changes affecting HTTP security, schema/SQL, startup/migration/image or failure semantics repeat that evidence; documentation/type-only changes retain unchanged runtime proof.
- Review stopping rule: one complete initial review and one confirmation; another round only for a demonstrated requirement, security/data/availability or public-contract blocker.

## Rollback or recovery

Disable local product mode without dropping Identity data; keep the released health-only path. Roll forward retained schema data and pending facts. Disposable integration reset remains exact project-scoped and explicit; no broad Docker/WSL cleanup.

## Documentation updates

Record public operations/cookie policy, exact local product commands, migration ownership, limits, evidence and concise repository memory at coherent checkpoints. Do not claim hosted readiness or playable media.

## Completion checklist

- [ ] Requirements satisfied
- [ ] Tests pass
- [ ] Evidence captured
- [ ] Documentation current
- [x] .ai state updated
- [x] Remaining risks recorded
