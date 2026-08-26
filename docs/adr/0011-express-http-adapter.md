# ADR-0011: Use Express 5 behind a Bounded HTTP Adapter

- Status: Accepted
- Date: 2026-08-26
- Owners: Aster shared transport infrastructure
- Related requirements: P01-R11
- Supersedes: None
- Superseded by: None

## Context

Aster subgraphs will run Apollo Server behind Node.js HTTP. The first transport must make middleware order, body limits, asynchronous failures, client cancellation, and HTTP drain behavior explicit without making Express part of domain or application code.

Apollo Server 5 distributes web-framework support separately. Apollo maintains the Express 5 integration and documents the required order: start Apollo, install JSON parsing before `expressMiddleware`, and attach the HTTP drain plugin for graceful shutdown. Fastify provides stronger server-level defaults for body parsing, prototype protection, and shutdown, but its Apollo integration is maintained by the community. Native Node.js HTTP avoids a framework dependency but would make Aster own routing, body parsing, media-type handling, error dispatch, and Apollo integration behavior before those are product differentiators.

This decision selects a transport adapter. It does not create a service, a public product schema, authentication, CORS policy, process lifecycle, or readiness behavior.

## Decision

Use exact-pinned Express `5.2.1` behind `@aster/http-express`. Keep Express imports and middleware types inside transport and runtime adapters. Domain and application packages depend only on their own ports.

Use the Apollo-maintained `@as-integrations/express5` package when a subgraph mounts Apollo Server. The P01-R11 compatibility fixture pins Apollo Server `5.5.1`, the integration `1.1.2`, and GraphQL.js `16.14.2`; product schemas and Federation support remain owned by later phases.

The adapter exposes a Node.js `RequestListener` and a one-time GraphQL middleware mount. Its request path is ordered as follows:

1. reject traffic with a stable `503` until GraphQL middleware is mounted;
2. match the fixed `/graphql` route boundary and reject nested paths;
3. create a request-local cancellation signal;
4. require `application/json` for `POST` requests;
5. parse strict JSON with a 64 KiB default and a reviewed 256 KiB hard maximum;
6. classify only parser-originated malformed or oversized failures;
7. invoke the supplied GraphQL middleware;
8. return stable JSON for unmatched routes and sanitize every unhandled error.

Apollo's HTTP drain plugin owns Apollo-to-HTTP drain compatibility. P01-R05 owns process signals, readiness transitions, generalized in-flight tracking, dependency closure, the overall shutdown deadline, and forced termination behavior. There is one future lifecycle coordinator, not competing transport shutdown mechanisms.

## Rationale

The maintained Apollo integration reduces compatibility ownership at the exact boundary Aster needs to learn and demonstrate. Express 5 automatically forwards rejected middleware promises to error middleware, and the repository verifies that behavior through a real Node.js socket and a terminal sanitizer. The adapter remains small and removable, so choosing Express does not couple product rules or persistence to the framework.

Fastify's richer built-in server behavior is valuable, but the current slice has no measured requirement that outweighs Apollo's maintenance ownership. Selecting it now would also require separately validating its community Apollo integration and reconciling its logging and lifecycle conventions with the already selected runtime boundaries.

## Consequences

### Positive

- Apollo documents and maintains the selected Express 5 integration.
- Middleware ordering and HTTP disclosure behavior are repository-owned and executable.
- Rejected promises, parser failures, client disconnects, and Apollo drain behavior have real-socket tests.
- Node.js services can share one bounded adapter without placing Express in domain or application layers.

### Negative

- Express has a material transitive dependency graph for a small HTTP boundary.
- Body limits, media-type policy, request cancellation, and safe terminal errors require explicit middleware rather than framework defaults.
- Express does not provide Fastify's built-in schema validation, prototype-poisoning policy, or lifecycle hooks.
- The transport package exposes an Express middleware type at its own mounting seam; that type must not cross into inner layers.

### Operational

- `POST /graphql` without supported UTF-8 JSON media type or with unsupported content encoding returns `415`.
- Malformed JSON returns `400`; a body above the configured bound returns `413` before Apollo runs.
- Requests before mount return `503`; unmatched and nested paths return `404`.
- The adapter disables Express disclosure and ETag generation. CORS is intentionally absent until an owning deployment or application requirement defines it.
- The compatibility diagnostic binds only to an ephemeral loopback port and leaves no durable state.

### Security and privacy

- Raw parser errors, rejected values, messages, stacks, headers, bodies, GraphQL documents, tokens, cookies, identifiers, and internal URLs are never reflected by the adapter.
- Parser classification occurs immediately after the parser, so middleware cannot forge a parser category to select a different response.
- The request cancellation signal is request-local and removed after response completion.
- Authentication and authorization remain service-owned controls; the adapter trusts no identity header.

## Alternatives considered

### Fastify 5

Not selected now. Fastify `5.12.1` has useful body-limit, secure JSON parsing, hook, and shutdown behavior. Its compatible `@as-integrations/fastify@3.1.0` package is community maintained, while Apollo maintains the selected Express integration. Fastify remains the primary replacement candidate if measured service behavior or maintenance posture justifies migration.

### Native Node.js HTTP

Not selected now. It minimizes framework dependencies, and Apollo Server 5 uses native HTTP for its standalone server. The standalone path offers less HTTP-level composition, while a custom integration would make Aster own more low-level parsing, routing, error, and lifecycle code than this phase requires.

### Apollo standalone server

Not selected for services. It is useful for minimal examples, but Aster needs an explicit transport seam for bounded parsing, request cancellation, future health routes, shared lifecycle coordination, and controlled middleware ordering.

## Validation

P01-R11 must pass strict build and type checks plus real-socket tests for pre-mount behavior, exact route matching, parser ordering, media type, malformed and oversized bodies, async rejection sanitization, client disconnect cancellation, Apollo query execution, in-flight HTTP drain, diagnostic output, and declaration boundaries.

Dependency license, registry security, blocked lifecycle script, process observation, complete repository graph, clean public checkout, protected CI, and independent review evidence are recorded in `evidence/phase-01/http-adapter.txt`.

## Revisit triggers

Reconsider the adapter when any of the following is observed:

- representative subgraph load misses its accepted latency, throughput, event-loop, or memory budget and transport cost is material in the profile;
- Apollo stops maintaining the Express integration or the pinned compatibility chain cannot move to a supported release;
- a security advisory cannot be mitigated inside the bounded adapter on the required timeline;
- required HTTP/2, schema-driven validation, hook, or lifecycle behavior would create more repository-owned Express code than a Fastify adapter;
- Express types escape transport/runtime adapters or services begin depending on framework-specific product behavior.

## Migration

Introduce a replacement transport package behind the same Node.js HTTP and request-cancellation responsibilities, run the Apollo and lifecycle contract suite against both implementations, then move service composition roots one at a time. Remove Express and its integration only after no service imports them. No durable data migration or client contract change is required.
