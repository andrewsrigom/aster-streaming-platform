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

P01-R03 implements the first server-only configuration contract in `@aster/config`. It belongs to the Phase 01 reference Node.js runtime, which requires PostgreSQL and Redis. It is not a universal schema for every future service. A runtime unit with different dependencies owns a different schema and must not add unused variables to this contract.

The process-start order is:

1. receive environment entries from the operator or runtime orchestrator;
2. call `loadReferenceRuntimeConfig(process.env)` before initializing logging, telemetry, transports, or dependency clients;
3. stop with a classified configuration error when validation fails;
4. continue initialization only with the returned frozen typed object.

The package reads the injected environment directly. It does not load `.env` files, contact a secret manager, connect to PostgreSQL or Redis, infer an environment, or start a service.

### Implemented variables

| Variable | Classification | Required behavior |
|---|---|---|
| `ASTER_ENV` | Non-secret server runtime | Required; one of `local`, `integration`, `staging`, or `production` |
| `ASTER_SERVICE_NAME` | Non-secret server runtime | Required; 1–63 lowercase alphanumeric or hyphen characters |
| `DATABASE_URL` | Secret | Required; bounded PostgreSQL URL using `postgres:` or `postgresql:` |
| `REDIS_URL` | Secret | Required; bounded Redis URL using `redis:` or `rediss:` |

Database and Redis URLs are secret even when a local value has no credential because the same fields may carry credentials in another environment. All four values are limited before schema parsing. The runtime ignores unrelated host variables, rejects unexpected names beginning with `ASTER_`, `DATABASE_`, or `REDIS_`, and reports no more than eight issues.

### Focused diagnostic

After the frozen workspace install, run the process-start diagnostic without starting dependencies or an application:

```bash
ASTER_ENV=local \
ASTER_SERVICE_NAME=config-check \
DATABASE_URL=postgresql://postgres:5432/aster \
REDIS_URL=redis://redis:6379/0 \
pnpm config:check
```

A successful result contains the two non-secret values and only `configured` status for the secret variables:

```json
{"event":"aster.configuration.valid","status":"ok","variables":[{"name":"ASTER_ENV","classification":"non-secret","status":"configured","value":"local"},{"name":"ASTER_SERVICE_NAME","classification":"non-secret","status":"configured","value":"config-check"},{"name":"DATABASE_URL","classification":"secret","status":"configured"},{"name":"REDIS_URL","classification":"secret","status":"configured"}]}
```

Invalid configuration exits with status 1. Its stable issue contract contains only a variable name, classification, and reason such as `missing`, `empty`, `invalid`, `too_long`, `too_many`, or `unexpected`. It never includes an input value or a third-party validation message. Run the ten focused success, failure, limit, and redaction tests with:

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
OTEL_EXPORTER_OTLP_ENDPOINT
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
