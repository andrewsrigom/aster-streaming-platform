# Deployment Architecture

## Environments

### Local

Docker Compose or equivalent runs:

- PostgreSQL;
- Redis;
- Kafka-compatible broker;
- S3-compatible storage;
- Apollo Router;
- OpenTelemetry Collector;
- Prometheus;
- Tempo;
- Loki;
- Grafana.

Application processes may run on the host for fast feedback.

### Integration

Ephemeral or shared environment for:

- real service composition;
- migrations;
- event contracts;
- media pipeline sample;
- browser tests;
- failure injection;
- load smoke tests.

### Staging

Production-like configuration, sanitized data, release candidate validation, restore tests, alerts, and runbooks.

### Production

Hosted single-region initial deployment with independent scaling for web, router, subgraphs, workers, and managed stateful dependencies.

## Network paths

Public:

- web;
- Apollo Router;
- CDN assets.

Private:

- subgraphs;
- PostgreSQL;
- Redis;
- broker;
- object-storage administration;
- telemetry ingestion;
- media worker controls.

The router is the only public GraphQL entry point.

## Compute classes

### Request-serving

- web;
- router;
- subgraphs.

Optimized for low latency, graceful rolling deployment, and horizontal scaling.

### Background

- outbox relays;
- event consumers;
- media worker.

Optimized for durable work ownership, bounded concurrency, retries, and restart recovery.

FFmpeg workloads should not share tight CPU/memory limits with request services.

## Configuration

Configuration is validated at process start. Values are grouped by:

- non-secret build configuration;
- environment runtime configuration;
- secret;
- dynamic operational control.

Unknown or invalid required configuration causes startup failure.

## Database deployment

Migrations run as an explicit release step, not automatically from every instance.

Use expand-and-contract:

1. add compatible schema;
2. deploy code that can use both;
3. backfill;
4. switch reads/writes;
5. remove obsolete shape later.

## Router and schema delivery

Subgraph schema changes compose in CI. Hosted deployment order preserves compatibility. The router receives a versioned supergraph artifact or approved schema-delivery mechanism.

The running router reports the supergraph version.

## Media storage

Use immutable version paths. Stable catalog metadata points to an active immutable publication.

CDN invalidation is limited to stable references; versioned segments use long immutable cache headers.

## Scaling

Scale signals:

- request concurrency;
- CPU;
- event-loop delay;
- memory;
- p95/p99 latency;
- database pool pressure;
- broker lag;
- media queue age;
- transcode utilization.

Do not scale solely on average CPU when queueing or event-loop delay indicates saturation.

## Rollback

Application rollback must remain compatible with current schema and event versions. Media publication rollback changes the active pointer to a previously validated immutable version.

Infrastructure and configuration rollback procedures are tested in Phase 14.
