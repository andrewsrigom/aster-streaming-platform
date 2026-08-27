# HTTP Transport

## Current status

Released P01-R11 provides the first shared HTTP transport boundary in `@aster/http-express`. The active P01-R08 candidate adds fixed process-health routes without adding a service or dependency I/O. Current evidence is in [`evidence/phase-01/http-adapter.txt`](../../evidence/phase-01/http-adapter.txt) and [`evidence/phase-01/runtime-composition.txt`](../../evidence/phase-01/runtime-composition.txt).

This package is not an application service. It contains no product schema, resolver, identity rule, database connection, Redis client, telemetry SDK, public port, or process-signal handler.

## Ownership boundary

`@aster/http-express` owns only:

- constructing a hidden Express application behind a Node.js `RequestListener`;
- mounting one GraphQL middleware at the fixed `/graphql` route boundary;
- bounding and parsing JSON before GraphQL middleware;
- creating and cleaning a request-local `AbortSignal`;
- translating transport failures into stable JSON responses;
- serving exact non-cacheable liveness and readiness snapshots from a repository-owned provider;
- disabling Express framework and ETag disclosure.

Future service composition roots may import the adapter and the Apollo Express integration. Domain and application packages may not import Express, Apollo, HTTP objects, database clients, Redis clients, or telemetry SDKs.

## Startup order

The future GraphQL composition order is:

1. validate process configuration;
2. create the process logger;
3. create the Express adapter and Node.js HTTP server;
4. create Apollo Server with `ApolloServerPluginDrainHttpServer` for that HTTP server;
5. await `apollo.start()`;
6. mount `expressMiddleware` and provide the request-local signal through Apollo context;
7. begin GraphQL traffic only after all mandatory startup work succeeds;
8. allow the lifecycle coordinator to mark the service ready.

The adapter returns `503 HTTP_ADAPTER_NOT_READY` for GraphQL traffic before mount. Exact health routes bypass that gate so a starting or dependency-degraded process remains diagnosable. This is defense in depth, not a substitute for the required startup order or readiness control.

## Health routes

`GET` and `HEAD` `/health/live` and `/health/ready` read one process-local snapshot per request. Both routes serialize only `liveness`, `phase`, `readiness`, and `reason`, set `Cache-Control: no-store`, and invoke no dependency adapter. Liveness returns `200` only for `live`; readiness returns `200` only for `ready`; the other state returns `503`. `HEAD` preserves the decision and headers without a response body.

The provider may publish only coherent lifecycle and dependency-readiness combinations. A throw, accessor-backed field, additional field, invalid value, or incoherent combination returns stable `500 INTERNAL_HTTP_ERROR` without reflecting the provider value. Other methods return `405 HTTP_METHOD_NOT_ALLOWED` and `Allow: GET, HEAD` without invoking the provider. Routes remain strict and case-sensitive.

## Request path

The fixed route stack is:

1. exact health-route handling;
2. pre-mount GraphQL availability gate;
3. exact `/graphql` route matching;
4. request cancellation setup;
5. `POST` media-type enforcement;
6. strict bounded JSON parsing;
7. parser-only error translation;
8. parsed-body presence enforcement for `POST`;
9. caller-supplied GraphQL middleware;
10. stable not-found and terminal error handlers.

The default JSON bound is `65,536` bytes. A composition root may lower it or raise it only to the package maximum of `262,144` bytes. The bound is enforced before Apollo executes. `POST` requires uncompressed UTF-8 `application/json`; malformed media parameters, duplicate charset parameters, unsupported charsets, and every non-identity request content encoding return the same stable `415` category without reflecting the header. `GET` remains available for GraphQL query semantics and does not require a body media type. Routing is strict and case-sensitive: `/graphql/internal`, `/graphql/`, and `/GRAPHQL` do not enter the GraphQL middleware.

## Stable responses

| Condition | Status | Response code |
|---|---:|---|
| Adapter not mounted | 503 | `HTTP_ADAPTER_NOT_READY` |
| Unsupported health method | 405 | `HTTP_METHOD_NOT_ALLOWED` |
| Invalid health provider result | 500 | `INTERNAL_HTTP_ERROR` |
| Unsupported or missing `POST` media type, charset, or non-identity content encoding | 415 | `UNSUPPORTED_MEDIA_TYPE` |
| Missing or malformed strict JSON body | 400 | `INVALID_JSON_BODY` |
| JSON body over the configured bound | 413 | `REQUEST_BODY_TOO_LARGE` |
| Unmatched route | 404 | `HTTP_NOT_FOUND` |
| Unexpected middleware or parser failure | 500 | `INTERNAL_HTTP_ERROR` |

Responses contain only the stable code. The adapter never reflects an error message, stack, rejected value, request path, body, header, GraphQL document, credential, identifier, or signed media URL.

## Cancellation and shutdown

`getExpressRequestAbortSignal(response)` returns the signal created for the active request. It aborts once if the client aborts the request or the response closes before completion. The response-to-signal association is removed on finish or close, so a completed response cannot retain request state through the adapter.

Downstream operations that can outlive the request must propagate this signal into their own deadline and cancellation APIs. The signal does not make an unsafe database operation idempotent and does not replace an outbound deadline.

The Apollo drain plugin proves that Apollo can stop accepting new work and allow the exercised in-flight request to finish. The current P01-R05 runtime source owns process signals, readiness changes, dependency-close order, a single overall shutdown budget, timeout telemetry, and forced termination. Compose the plugin with that coordinator and do not add a second process-signal handler inside this package. The complete contract is in [Runtime Lifecycle](RUNTIME_LIFECYCLE.md).

## Run the compatibility checks

From a frozen checkout using the supported Node.js and pnpm versions:

```bash
pnpm http:test
pnpm http:check
```

`http:test` builds the package and runs the direct, real-socket, Apollo, drain, subprocess, and declaration tests. `http:check` builds the package, starts a synthetic Apollo query on an ephemeral loopback port, verifies the response, drains the server, and emits one stable JSON diagnostic line.

The current dependency, failure, lifecycle, and process evidence is in the [P01-R11 evidence](../../evidence/phase-01/http-adapter.txt). The architectural choice and replacement triggers are in [ADR-0011](../adr/0011-express-http-adapter.md).

## Limitations and recovery

The current slice does not implement CORS, authentication, authorization, persisted operations, GraphQL cost limits, rate limiting, access logs, request metrics, tracing, a product schema, or a deployable service. Their owning phases must compose those controls without weakening this boundary.

The adapter owns no durable state. Rollback removes `@aster/http-express`, its root command aliases, its exact dependencies and lock entries, ADR-0011, and P01-R11 documentation. A replacement must pass the same request, cancellation, Apollo, and lifecycle contract before service composition moves to it.
