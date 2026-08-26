# Configuration and Environments

## Principles

- Validate configuration before readiness.
- Keep secrets out of source, logs, traces, and client bundles.
- Use one schema per runtime unit.
- Reject unknown critical values where practical.
- Prefer explicit environment names.
- Do not infer production from a missing flag.
- Configuration changes follow review and deployment controls.

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
