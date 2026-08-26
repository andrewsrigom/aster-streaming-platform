# Work Item: Select the Express HTTP Adapter and Verify the Transport Boundary

- Status: IN_PROGRESS
- Owner: Aster shared transport infrastructure
- Phase: 01
- Requirement IDs: P01-R11
- Created: 2026-08-26
- Updated: 2026-08-26

## Outcome

Record the Phase 01 HTTP-framework decision through an ADR and provide one concrete Express 5 transport package whose middleware ordering, bounded JSON parsing, sanitized asynchronous errors, request cancellation, and Apollo Server drain compatibility are executable and testable without creating a product service or GraphQL schema.

## Current behavior

P01-R04 is released on `main` through protected squash `e33f90b`; post-merge run `32967185247` passes. The repository has validated configuration and structured logging packages but no HTTP framework dependency, transport adapter, inbound request cancellation signal, Apollo integration probe, service runtime, or lifecycle orchestration.

## Proposed behavior

Accept Express 5 as the service HTTP adapter after comparing it with Fastify 5 and Node.js HTTP. Add `@aster/http-express` as a transport-only package backed by exact-pinned Express `5.2.1`. It will construct the fixed `/graphql` middleware boundary, disable framework disclosure, bound JSON bodies, attach a per-request `AbortSignal`, and return only sanitized parser or unexpected-error responses. Focused tests will run exact-pinned Apollo Server `5.5.1`, the Apollo-maintained Express 5 integration `1.1.2`, and GraphQL.js `16.14.2` against a synthetic compatibility schema. P01-R05 remains responsible for process signals, readiness state, generalized in-flight tracking, and the complete bounded-shutdown coordinator.

## Boundaries

- Owning context: Shared transport infrastructure; no product bounded context or product data owner changes.
- Affected services/packages: New `packages/http-express`; root task aliases and lockfile; ADR, technology baseline, evidence, and repository memory. No deployable service.
- Authoritative data: None. Parsed request bodies and cancellation state are request-local and non-authoritative.
- Read models/caches: None.
- Trust boundaries: HTTP method/path/headers/body, JSON parser output, connection abort/close events, caller-supplied Express middleware, asynchronous exceptions, and HTTP response disclosure.
- External dependencies: Exact Express `5.2.1` plus `@types/express@5.0.6`; exact Apollo Server `5.5.1`, Apollo-maintained `@as-integrations/express5@1.1.2`, and GraphQL.js `16.14.2` for executable compatibility tests. Fastify is evaluated but not installed in the repository.

## Invariants

- Express types remain inside the transport adapter package and never enter domain or application packages.
- The GraphQL request body limit is finite, enforced before Apollo middleware, and cannot be widened beyond the reviewed package bound.
- Each accepted request exposes one `AbortSignal` that aborts when its client disconnects and is cleaned up after a completed response.
- Rejected asynchronous middleware and parser failures produce stable JSON status/code responses without stack, message, header, body, path, token, or cause disclosure.
- Apollo middleware starts only after Apollo Server is ready; shutdown compatibility uses Apollo's HTTP drain plugin and does not invent a second lifecycle owner.
- The package contains no Identity rule, resolver, Federation schema, authorization decision, telemetry backend, or process-signal handler.

## Failure behavior

| Failure | Expected behavior | Telemetry |
|---|---|---|
| Invalid adapter options or middleware | Fail construction with one stable cause-free adapter issue | No logger is available during invalid construction |
| Request arrives before GraphQL mount | Return stable `503` JSON without entering the route stack | Later readiness telemetry distinguishes startup from public availability |
| Missing or unsupported `POST` media type | Return bounded `415` JSON before parsing or GraphQL execution | Later request metrics classify the stable response code |
| Malformed JSON content | Return bounded `400` JSON without parser internals | Later request metrics classify the stable response code |
| JSON body exceeds the reviewed limit | Return bounded `413` before Apollo middleware executes | Later metrics count a stable body-limit rejection |
| Express middleware rejects or throws | Express 5 forwards the failure to the terminal sanitizer, which returns bounded `500` JSON | Later logging records only stable error category and correlation |
| Client disconnects during useful request work | Abort the request-local signal once; downstream work may cancel through the signal | Later request telemetry records cancellation without client identifiers |
| Apollo/HTTP shutdown begins with an in-flight operation | Stop new accepts and allow the exercised request to complete inside the drain interval | P01-R05 later owns bounded-drain metrics and timeout outcome |

## Data and contracts

- Schema/migration: None.
- GraphQL: A synthetic test-only schema proves middleware compatibility; no product or Federation schema is added.
- Events: None.
- Cache: None.
- Compatibility: Repository-owned adapter options/errors plus Express types confined to `@aster/http-express`; Apollo integration packages remain replaceable at the transport boundary.
- Retention/deletion: Request-local body and cancellation state are not retained by this package.

## Security and privacy

- Authorization: Not implemented here. Future owning services enforce authorization inside application policies; the adapter does not trust public identity headers.
- Input limits: Fixed `/graphql` route, exact content type parsing, reviewed body limit with a hard maximum, bounded adapter options, and no unrestricted middleware collection.
- Sensitive data: Error responses omit raw messages, stacks, headers, request bodies, GraphQL documents, tokens, cookies, identifiers, and internal URLs. The package performs no request logging.
- Abuse cases: Oversized JSON, malformed JSON, prototype-oriented payload keys, rejected promises, accessor/proxy options, duplicate callbacks, slow in-flight work, client disconnects, keep-alive shutdown, and attempts to bypass middleware order.

## Implementation steps

1. Capture current official Express, Apollo integration, Fastify alternative, Node support, maintenance, license, dependency, security, installed-cost, and exit-strategy evidence.
2. Add ADR-0011 selecting Express 5 and state why the Apollo-maintained integration outweighs Fastify's richer built-in server features for this subgraph boundary.
3. Add `@aster/http-express` with bounded options, fixed middleware order, request-local cancellation, safe parser classification, and terminal sanitized errors.
4. Add direct and real-socket tests for initialization, ordering, JSON success/invalid/oversized behavior, async rejection, framework disclosure, abort propagation, Apollo execution, and HTTP drain compatibility.
5. Add a runnable compatibility diagnostic or focused integration command without a product schema, service, public port, or Docker dependency.
6. Run focused type, lint, formatting, unused-code, architecture, secret, license, audit, process observation, complete graph, clean public checkout, protected CI, and automated review evidence.

## Tests

- Domain: Not applicable; no product rule changes.
- Application: Not applicable; no use case is created. Request cancellation is a transport-to-application port exercised with synthetic work.
- Integration: Real Node.js HTTP sockets, Express 5 middleware, Apollo Server, the Apollo-maintained Express 5 integration, and the HTTP drain plugin.
- Contract: Stable JSON error/status shape, fixed middleware order, body bound, abort signal behavior, generated declarations, and architecture-boundary enforcement.
- Browser: Not applicable; no browser UI or public CORS policy is introduced.
- Performance/failure: Deterministic barriers for abort and drain, oversized and malformed requests, rejected promises, no arbitrary sleeps for correctness, and one labeled non-benchmark process/resource observation.

## Evidence

- Commands: Registry and official-source review; focused package build/test/diagnostic; strict typecheck, lint, formatting, unused-code, architecture and secret checks; license inventory; high-severity audit; complete forced graph; clean public checkout; protected CI and automated review.
- Raw artifact path: `evidence/phase-01/http-adapter.txt`.
- Acceptance result: Pending implementation and verification.

## Rollback or recovery

Remove `@aster/http-express`, its exact dependencies, root aliases, ADR-0011, lockfile entries, and P01-R11 evidence/state references. No service, schema, durable data, container, port, or hosted resource requires migration or cleanup.

## Documentation updates

- Add ADR-0011 and link it from the decisions ledger and technology baseline.
- Document the implemented transport contract, middleware order, security boundaries, diagnostic command, lifecycle handoff to P01-R05, and Fastify revisit triggers.
- Update Phase 01 evidence, current state, work queue, session log, and handoff without claiming a product API or complete lifecycle.

## Completion checklist

- [ ] Requirements satisfied
- [ ] Tests pass
- [ ] Evidence captured
- [ ] Documentation current
- [ ] `.ai/` state updated
- [ ] Remaining risks recorded
