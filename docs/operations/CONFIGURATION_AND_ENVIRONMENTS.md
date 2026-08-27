# Configuration and Environments

## Principles

- Validate configuration before readiness.
- Keep secrets out of source, logs, traces, and client bundles.
- Use one schema per runtime unit.
- Reject unknown critical values where practical.
- Prefer explicit environment names.
- Do not infer production from a missing flag.
- Configuration changes follow review and deployment controls.

## Phase 01 reference runtime

P01-R03 implements the first server-only configuration contract in `@aster/config`; released P01-R08 adds its listener and total-startup inputs; the local P01-R10 checkpoint adds optional separate database-password and OTLP metrics endpoint inputs. It belongs to the Phase 01 reference Node.js runtime, which requires PostgreSQL and Redis. It is not a universal schema for every future service. A runtime unit with different dependencies owns a different schema and must not add unused variables to this contract.

The process-start order is:

1. receive environment entries from the operator or runtime orchestrator;
2. convert the operating-system-bounded process environment with `Object.entries(process.env)`, retain only names beginning with the contract-owned prefixes, and pass those entries to `loadReferenceRuntimeConfig` before initializing logging, telemetry, transports, or dependency clients;
3. stop with a classified configuration error when validation fails;
4. continue initialization only with the returned frozen typed object.

The CLI captures the real process environment into entries once and filters unrelated host names before applying the package bound; unexpected names with an owned prefix remain present so typos fail closed. The public loader accepts only an actual array of at most 256 own two-item tuples, snapshots its length once, and rejects sparse, inherited, malformed, duplicate-known, excessive, or throwing input before schema parsing. This externally bounded representation prevents an arbitrary record or proxy from forcing eager materialization of an unbounded key list inside the loader. The package does not load `.env` files, contact a secret manager, connect to PostgreSQL or Redis, infer an environment, or start a service.

### Implemented variables

The Identity entrypoint (`pnpm identity:start`) uses this exact contract before creating resources. `integration` maps to the telemetry package's `test` environment while retaining the configured logger environment. Export is process-local by default. P01-R10 enables OTLP/HTTP only when the explicit optional metrics endpoint is supplied; vendor SDK environment variables do not enable it implicitly. The controlled diagnostic supplies its own synthetic entries and never reads hosted credentials.

| Variable | Classification | Required behavior |
|---|---|---|
| `ASTER_ENV` | Non-secret server runtime | Required; one of `local`, `integration`, `staging`, or `production` |
| `ASTER_HTTP_HOST` | Non-secret reference listener | Required; loopback `127.0.0.1` or container wildcard `0.0.0.0` |
| `ASTER_HTTP_PORT` | Non-secret reference listener | Required; unprivileged decimal port from `1024` through `65535` |
| `ASTER_SERVICE_NAME` | Non-secret server runtime | Required; 1–63 lowercase alphanumeric or hyphen characters |
| `ASTER_STARTUP_DEADLINE_MS` | Non-secret reference startup | Required; integer `5000` through `300000` milliseconds |
| `DATABASE_URL` | Secret | Required; bounded PostgreSQL URL using `postgres:` or `postgresql:` |
| `REDIS_URL` | Secret | Required; bounded Redis URL using `redis:` or `rediss:` |
| `ASTER_DATABASE_PASSWORD` | Secret | Optional; omit to retain the original URL contract; when supplied, requires a non-empty explicit URL username and no URL/query password |
| `ASTER_OTLP_METRICS_ENDPOINT` | Secret server-only endpoint | Optional; complete HTTP(S) metrics URL without credentials, query or fragment; omit for no export |
| `ASTER_LOCAL_DEMO_ENABLED` | Non-secret local product mode | Optional `true`/`false`; only `true` enables Identity product routes, requires `ASTER_ENV=local` and the public origin |
| `ASTER_PUBLIC_ORIGIN` | Non-secret local HTTP origin | Required only with the enabled demo; exact `http://127.0.0.1:<1024..65535>`, no trailing slash/path/credentials/query; rejected when mode is absent/false |

Database and Redis URLs are secret even when a local value has no credential because the same fields may carry credentials in another environment. All provided values are limited to 2048 characters before schema parsing. The optional password rejects empty/undefined supplied values and control characters, is percent-encoded into the effective database URL, and cannot override an existing authority or query-string password. The resulting URL also has a 2048-character limit. Existing seven-variable callers retain their exact URL. Diagnostics add only a configured secret marker when the separate password is present; no credential is printed. The runtime ignores unrelated host variables, rejects unexpected names beginning with `ASTER_`, `DATABASE_`, or `REDIS_`, and reports no more than eight issues.

The optional OTLP endpoint rejects supplied empty/undefined values, malformed URLs, whitespace/control characters, user information, queries and fragments. Diagnostics print only its configured marker. It is operator-owned configuration, never browser input. Local HTTP is for the isolated Collector; authenticated hosted telemetry is not implemented. Identity exports every 5 seconds with a 1-second attempt timeout and 2-second flush/shutdown stage bounds. Collector failure records failed exports but does not change Identity readiness; shutdown can truthfully report `degraded`. The normal ten-second overall lifecycle deadline still applies.

Listener ports and startup budgets accept canonical decimal integers only; whitespace, leading zeros, fractions, exponent notation, and out-of-range values fail closed. The 5-second startup minimum remains above the planned 3-second PostgreSQL connection budget. The reference 15-second startup value is a test starting point, not a production SLO. `0.0.0.0` is intended for an isolated container listener; P01-R10 owns loopback-only host port publication.

### Focused diagnostic

After the frozen workspace install, run the process-start diagnostic without starting dependencies or an application:

```bash
ASTER_ENV=local \
ASTER_HTTP_HOST=127.0.0.1 \
ASTER_HTTP_PORT=3100 \
ASTER_SERVICE_NAME=config-check \
ASTER_STARTUP_DEADLINE_MS=15000 \
DATABASE_URL=postgresql://postgres:5432/aster \
REDIS_URL=redis://redis:6379/0 \
pnpm config:check
```

A successful result contains the five non-secret values and only `configured` status for the secret variables:

```json
{"event":"aster.configuration.valid","status":"ok","variables":[{"name":"ASTER_ENV","classification":"non-secret","status":"configured","value":"local"},{"name":"ASTER_HTTP_HOST","classification":"non-secret","status":"configured","value":"127.0.0.1"},{"name":"ASTER_HTTP_PORT","classification":"non-secret","status":"configured","value":"3100"},{"name":"ASTER_SERVICE_NAME","classification":"non-secret","status":"configured","value":"config-check"},{"name":"ASTER_STARTUP_DEADLINE_MS","classification":"non-secret","status":"configured","value":"15000"},{"name":"DATABASE_URL","classification":"secret","status":"configured"},{"name":"REDIS_URL","classification":"secret","status":"configured"}]}
```

Invalid configuration exits with status 1. Its stable issue contract contains only a variable name, classification, and reason such as `missing`, `empty`, `invalid`, `too_long`, `too_many`, or `unexpected`. It never includes an input value or a third-party validation message. Run the twenty focused success, failure, listener, budget, password-source conflict/encoding, limit, URL-normalization, unexpected-source, and redaction tests with:

```bash
pnpm config:test
```

The raw compatibility, redaction, dependency, and process-cost results are in the [P01-R03 evidence](../../evidence/phase-01/runtime-configuration.txt).

## Configuration classes

### Build-time public

Safe to include in client bundles:

- public application origin;
- public CDN base when not signed;
- build version;
- supported locale list;
- non-sensitive feature presentation.

### Server runtime

- service ports;
- dependency endpoints;
- timeouts;
- concurrency limits;
- cache TTLs;
- telemetry endpoints;
- processing recipe selection.

### Secret

- database credentials;
- Redis credentials;
- broker credentials;
- identity client secrets;
- signing keys;
- object-storage credentials;
- telemetry exporter credentials.

### Dynamic operational control

Only use for values that genuinely require runtime change:

- feature disablement;
- failure isolation;
- emergency rate limits;
- rollout percentage.

Dynamic control needs audit, defaults, validation, and failure behavior.

## Environment policy

### Local

- synthetic data;
- local credentials;
- verbose diagnostics;
- controlled failure injection;
- open local observability;
- no public accessibility.

### Integration

- automated tests;
- ephemeral credentials;
- synthetic data;
- schema and contract validation;
- limited retention.

### Staging

- production-like topology and controls;
- sanitized or synthetic data;
- release candidate;
- real alert routing in test mode;
- restore and rollback exercises.

### Production

- least privilege;
- private service network;
- trusted operations;
- strict failure-injection disablement;
- controlled introspection;
- managed secrets;
- backup and retention policies;
- audited changes.

## Naming

Use consistent names:

```text
ASTER_ENV
ASTER_SERVICE_NAME
ASTER_BUILD_VERSION
DATABASE_URL
REDIS_URL
BROKER_BROKERS
OBJECT_STORAGE_ENDPOINT
ASTER_OTLP_METRICS_ENDPOINT
```

Service-specific values use a service namespace when they are not common.

## Secret rotation

A secret-dependent adapter defines whether two values can overlap during rotation.

Rotation procedure:

1. create new credential;
2. grant least privilege;
3. deploy consumers that accept or use new credential;
4. verify;
5. revoke old credential;
6. verify no stale users;
7. record completion.

## Timeouts and limits

Configuration values include units in names or typed parsing. Avoid ambiguous integers.

Examples:

```text
DISCOVERY_TIMEOUT_MS
GRAPHQL_MAX_COST
MEDIA_MAX_SOURCE_BYTES
MEDIA_JOB_TIMEOUT_SECONDS
CATALOG_CACHE_TTL_SECONDS
```

Validate relationships, not only individual values. An attempt timeout must be less than the overall deadline.

## Environment templates

Commit a non-secret `.env.example` generated or reviewed against configuration schemas. Every variable includes purpose, owner, required environments, and safe local example where possible.

CI verifies that server-only variables are not referenced by client modules.
