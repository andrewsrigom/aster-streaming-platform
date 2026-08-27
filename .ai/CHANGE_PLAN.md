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

The guarded local Federation v2 API now composes signed assertions, durable sessions, owned profiles/selection and transactional audit/outbox. All 49 source tasks and 144 Identity tests pass at the initial candidate checkpoint. The eleven-scenario matrix passes (162778 ms; cleanup 2732 ms, zero remaining). Review corrected late-response header handling; focused HTTP and a fresh real subgraph scenario pass afterward (12545 ms; cleanup 1387 ms). The rebuilt Docker product smoke passes with retained data and restricted runtime credentials. Final pre-push gate and protected publication remain. Evidence: evidence/phase-02/identity-subgraph.txt. This branch is not yet pushed.

## Proposed behavior

Use the existing Express adapter and maintained Apollo integration. Select exact compatible Federation/schema dependencies from current primary sources, create a small owner schema/resolver boundary, protect every local credential/mutation request, compose sessions/profiles into runtime, and verify real HTTP-to-database behavior. Preserve health-only startup when local product mode is disabled.

The owner authorized Elastic-2.0 Apollo dependencies and standing compatible licensing decisions on 2026-08-27; [ADR-0014](../docs/adr/0014-apollo-federation-license-policy.md) accepts Elastic-2.0 and 0BSD while Aster stays MIT. Exact pins: Apollo Server 5.5.1, subgraph/composition 2.14.4, GraphQL 16.14.2, Express 5.2.1, maintained Express integration 1.1.2 and DataLoader 2.2.3. Audit has no high/critical findings and one moderate uuid 9 advisory (GHSA-w5hq-g745-h8pq); installed Apollo internals call v1() and query-graphs calls v4(), without buffers, not the affected v3/v5/v6 paths. Retain the compatible dependency graph and recheck reachability on upgrades, rather than force a transitive major override. All 189 packaged third-party name/version entries match the installed frozen source graph; checked Apollo/tslib notices remain packaged.

## Boundaries

- Owner/data: Identity and Profiles; existing PostgreSQL schema and bounded transaction adapter.
- Paths: services/identity transport/composition/migrations/tests; packages/config and packages/http-express only where shared runtime contracts require extension; existing local Compose/CI scripts for runnable acceptance.
- Trust: browser input/cookies/Host/Origin/GraphQL are untrusted. Authenticate and authorize in owner application code; no public account/role header.
- Decisions: ADR-0002, 0003, 0004, 0007, 0011, 0013 and 0014.
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
- Planned owner API: Federation v2 Profile keyed by id; queries me, profiles, profile(id) and activeProfile(id); mutations demoSignIn, signOut, createProfile, updateProfile, deleteProfile and selectProfile. Viewer exposes accountId/absolute expiry, never a session id or credential. Mutation payloads carry fixed outcome codes and correlation ids; profile writes retain mutationId/expectedVersion semantics. Entity references are untrusted ids resolved through one request-scoped authorized list snapshot (maximum 16), preserving order/misses without cross-request caching.
- Planned local operation budgets: one named query or one-root-field mutation per document, no subscriptions, batching, APQ, multipart or introspection; 64 KiB HTTP body, 16 KiB source, 2048 parser tokens, depth 8, 16 aliases, 128 expanded fields, weighted cost 512 (profile/entity lists multiply by 16), input depth 8/256 nodes/16 array elements. Reject fragment cycles/expansion and oversized variable/default/literal inputs before Apollo execution. Eight in-flight operations, no queue, one process-local token bucket (64 burst, eight/sec) and 3 s deadline including owner work. A cancelled non-cooperative operation retains its admission slot until it actually settles; cookie writes are refused after cancellation. These local controls do not replace Phase 04/10 distributed or hosted policy.
- Apollo disables document/APQ caches, reporting, inline tracing and landing-page plugins for this boundary. Emit only generated correlation/trace ids, fixed operation/result labels and measured duration through the existing logging boundary; never query text, variables, cookies or raw errors. HTTP integration owns request cancellation; runtime owns shutdown, not Apollo process signal handlers.
- Product wiring uses optional ASTER_LOCAL_DEMO_ENABLED=true plus canonical ASTER_PUBLIC_ORIGIN; absent/false retains health-only behavior, and integration/staging/production reject activation before constructing resources. Runtime checks effective non-administrative role membership and required product columns during PostgreSQL readiness; it never migrates.
- The local Compose Identity initializer is a finite command in the existing image, separate from the HTTP process. Reuse exact source-owned migrations 0001/0002, serialize with a nonblocking PostgreSQL session advisory lock, accept only absent/[1]/[1,2] version state, and create the dedicated aster_identity_local login inheriting the restricted owner role. Never reset data, reapply successful migrations or overwrite an existing password. Migrate with local admin credentials; runtime receives only the dedicated login. Preserve a 10 s overall deadline, bounded connection/query timeouts and cancellation by closing the one admin connection. Keep migration SQL/notices in packaged output and reject unknown schema versions. PostgreSQL 18 advisory-lock and CREATE ROLE documentation were checked; no new database library is needed (pg is already pinned).
- Use a distinct local cookie name and no Domain attribute. Absolute cookie expiry must match the durable 30-minute session; clear on acknowledged logout only, never pretend failed revocation succeeded.
- Source/metadata compatibility research and exact operation budgets must be recorded before implementing those boundaries.
- Local HTTP checkpoint: POST /graphql only (no URL query), exact configured Host/Origin, X-Aster-CSRF: 1 and JSON UTF-8; no CORS allowance. Optional Sec-Fetch-Site must be same-origin. Reject duplicate headers, Authorization/Forwarded/X-Forwarded-* and reserved X-Aster-* identity headers. Bound 64 header fields/16 KiB, 32 cookies/8 KiB and the session credential to 3800 ASCII bytes so its serialized cookie fits a 4 KiB envelope. Local cookie is aster_local_session with HttpOnly, SameSite=Strict, Path=/, no Domain/Secure; absolute expiry comes from the committed session, not renewal. This remains a local-only boundary, not the Phase 04 Router or Phase 14 hosted contract.
- Primary references checked 2026-08-27: [OWASP custom-header CSRF](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html), [cookie attributes](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie), [Apollo CORS/CSRF](https://www.apollographql.com/docs/apollo-server/security/cors), [maintained Express integration](https://www.apollographql.com/docs/apollo-server/api/express-middleware). Custom-header CSRF here uses strict origin verification and no CORS, not a secret token; all browser requests include the header, even sign-in.

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
