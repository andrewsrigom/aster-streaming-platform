# Runtime Logging

## Current status

P01-R04 is **verified** at public candidate commit `34e3cb9ec339981b733fe623349d8e66d3df4e43`. Focused and complete local gates, a clean public checkout, protected CI, hosted dependency review, and independent automated review pass. The implementation is the logging slice of `@aster/runtime`. It does not include an application service, HTTP middleware, an OpenTelemetry SDK, a Collector, a log backend, retention, dashboards, or alerts.

## Startup order

The reference runtime follows this order:

1. validate process configuration through `@aster/config`;
2. create one process logger with the validated service and environment plus the build version;
3. initialize future telemetry, transport, and dependency adapters;
4. emit stable operational events through the repository-owned logger API.

Invalid logger construction options fail startup with `ASTER_LOGGING_INVALID_OPTIONS`. The error contains only a bounded option name and stable reason. It has no caller value or preserved cause.

## Output contract

`createAsterLogger` writes one newline-delimited JSON object per accepted call. Every record contains:

- `time` as an ISO 8601 timestamp;
- `level` as `trace`, `debug`, `info`, `warn`, `error`, or `fatal`;
- fixed `service`, `environment`, and `version` process context;
- a stable dotted `event` name.

Optional reviewed fields are `operation`, `outcome`, `requestId`, `eventId`, `errorCategory`, `durationMs`, scalar `attributes`, a sanitized error chain, and valid trace correlation. Caller objects never become top-level bindings, so they cannot replace the logger-owned timestamp, severity, process identity, or trace fields.

The API returns `written`, `filtered`, or `failed`. A disabled level is filtered before the entry is inspected. A synchronous destination exception returns `failed` without retrying or throwing into application work. The current lifecycle coordinator gives telemetry one bounded flush hook and ignores logger failure; export queues and drop metrics still belong to P01-R06 and its telemetry owner.

## Input bounds

The current contract applies these limits before serialization:

- service names: 63 ASCII lowercase kebab-case characters;
- versions: 64 stable ASCII version characters;
- event, operation, and error-category names: 128 stable lowercase characters;
- request and event IDs: 64 opaque ASCII identifier characters;
- duration: finite and between zero and 24 hours in milliseconds;
- attributes: at most 32 own two-item tuples;
- attribute names: 64 ASCII alphanumeric or underscore characters and canonicalized to lowercase;
- attribute strings: 512 characters;
- error causes: four frames.

Attribute values are strings, finite safe-range numbers, booleans, or null. Arrays with inherited holes, accessor-backed entries, duplicate canonical names, excessive length, non-scalar values, or prohibited account/profile/title/user identifier keys are invalid. An invalid or hostile entry produces one `aster.logging.invalid` record without reading arbitrary values.

## Redaction and privacy

Pino `10.3.1` is exact-pinned behind the repository-owned API. Its initialization-time redaction is configured for reviewed sensitive names under both top-level and `attributes` paths. The wrapper also replaces those attribute values with `[Redacted]` before Pino receives the record.

The reviewed set covers common authorization, cookie, password, passphrase, token, session, API/client/private key, credential, CSRF, database/Redis URL, secret, and signed-URL variants after canonicalization. Raw request bodies, headers, GraphQL documents, configuration objects, user/profile/title IDs, and signed media URLs do not belong in this baseline API.

Redaction cannot infer that a value is secret when a caller assigns it an innocent-looking name. Call sites still own semantic classification and must pass only reviewed non-sensitive attributes. Adding an accepted field requires a disclosure review and a negative test.

Raw `Error` messages, stacks, and arbitrary properties are never serialized. The logger records only a recognized built-in error type, an optional stable uppercase code, the stable caller-supplied error category, and at most four causes. Name and cause accessors are not invoked.

## Trace correlation

The logger accepts a synchronous active-context provider rather than importing an OpenTelemetry SDK. A future telemetry adapter can read the active OpenTelemetry span and return its context through this port.

Correlation is emitted only when both values follow the OpenTelemetry/W3C representation:

- `traceId`: 32 lowercase hexadecimal characters with at least one non-zero value;
- `spanId`: 16 lowercase hexadecimal characters with at least one non-zero value;
- optional `traceFlags`: an integer from 0 through 255.

If the provider throws, exposes accessors, or returns an invalid or partial context, the requested event is emitted without trace fields. Span context failure does not become an application failure.

## Run the current diagnostic

From a frozen checkout on the supported Node.js and pnpm versions:

```bash
pnpm logging:check
pnpm logging:test
```

`logging:check` builds `@aster/runtime` and prints two JSON records to standard output: one correlated success record and one warning with a representative redacted authorization attribute plus sanitized error causes. The command exits nonzero if either write fails. `logging:test` runs the focused direct and subprocess suite.

The current dependency, redaction, process-cost, and adverse-input results are in the [P01-R04 evidence](../../evidence/phase-01/runtime-logging.txt).

## Recovery and extension

The logger owns no durable state. Rollback removes `@aster/runtime`, Pino, the root logging command aliases, and P01-R04 documentation. Pino types do not appear in generated public declarations, so a future implementation can replace the adapter without changing service call sites.

Do not add pretty printing or network export inside a service process by default. Standard output remains the local process boundary. [Runtime Lifecycle](RUNTIME_LIFECYCLE.md) owns the overall termination deadline and flush opportunity; later Collector work owns bounded export queues, transport, drop metrics, storage, and retention.
