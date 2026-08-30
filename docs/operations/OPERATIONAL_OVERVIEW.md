# Operational Overview

## Current scope

P12-R12 provisions one local Grafana dashboard over Aster's released Prometheus
metrics. It is an optional diagnostic projection. It does not authorize product
decisions, change product readiness or prove historical SLO compliance.

Start the existing observability profile from the repository root:

```bash
docker compose --project-name aster --file infra/compose/compose.yml --file infra/compose/observability.yml --profile observability up --build --wait --wait-timeout 120
```

Open
<http://127.0.0.1:3001/d/aster-operational-overview/aster-operational-overview>.
Prometheus remains available at <http://127.0.0.1:9090>. Both listeners are
loopback-only. Grafana needs no local login and grants only the bounded anonymous
Viewer role described by [ADR-0042](../adr/0042-bounded-local-operational-overview.md).

## Reading the three layers

### User impact

Start with the four SLI ratio panels. They answer whether admitted supergraph,
Catalog title-read, playable-session and progress-write attempts currently meet
their good-event definitions. Each ratio is an instant query of the current
five-minute recording, so an older non-empty sample cannot mask current
no-traffic. Check `SLI measured population` before treating a gap as failure. No
traffic deliberately produces no ratio.

### Dependency health

Use outcome rate to identify a failing dependency/operation/outcome, p95 latency
to distinguish slow work, and active operations to detect accumulation. These
are finite aggregate dimensions; they do not expose request IDs, users, URLs or
raw GraphQL documents.

### Runtime saturation

Compare peak process CPU, resident memory, event-loop p99 and PostgreSQL pool
state. The current Collector intentionally does not convert service resource
attributes into unbounded metric labels, so the first three panels show the
peak instrumented process rather than pretending to identify an owner they
cannot truthfully distinguish.

## Expected failure behavior

- Grafana unavailable: the product and Prometheus continue; only the dashboard
  disappears.
- Prometheus unavailable: panels show no data; no product state changes.
- Empty SLI population: the ratio remains empty, not 100% or 0%.
- Restart/recreate: Grafana rebuilds its disposable database from checked-in
  provisioning. Do not delete PostgreSQL or other product volumes.

Inspect bounded logs and health without exposing additional ports:

```bash
docker compose --project-name aster --file infra/compose/compose.yml --file infra/compose/observability.yml --profile observability ps --all
docker compose --project-name aster --file infra/compose/compose.yml --file infra/compose/observability.yml --profile observability logs --no-color --tail 100 grafana prometheus
```

Stop the exact profile while preserving PostgreSQL and Prometheus volumes:

```bash
docker compose --project-name aster --file infra/compose/compose.yml --file infra/compose/observability.yml --profile "*" down
```

## Limits

The dashboard refreshes every 30 seconds. Prometheus keeps at most three days/
128 MB and limits query duration, concurrency and samples. This is enough to
demonstrate diagnosis and the burn-alert mechanics locally but cannot establish
28/30-day reliability. Alert labels do not imply external delivery. Three
recorded diagnostic exercises and hosted identity/retention remain later
Phase 12/14 work.
