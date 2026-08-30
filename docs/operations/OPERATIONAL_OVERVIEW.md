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

## Disposable trace-led exercise

The P12-R10 candidate adds an automated diagnostic lane without changing the
retained `aster` project:

```bash
pnpm diagnostics:run
```

The command accepts no target or flags. It creates one random
`aster-p12-diagnostics-<uuid>` project, starts the targeted Catalog diagnostic
topology on ephemeral IPv4 loopback ports and checks Grafana's immutable
`aster-tempo` data source.
It then drives three Catalog title-read scenarios in order:

1. Catalog service unavailable: the SLI source records a failed request and the
   trace identifies the Router-to-Catalog boundary.
2. PostgreSQL unavailable during an admitted authoritative read: the request
   fails and the same trace identifies the Catalog-to-PostgreSQL boundary.
3. Redis unavailable: PostgreSQL remains authoritative, the request completes
   and trace/log signals identify cache degradation.

Each result is emitted as one bounded JSON event containing the diagnosis,
source-counter delta, released five-minute ratio when present and finite
boundary categories. It contains no GraphQL document, canary ID, credential,
SQL text or media URL. Recovery is exercised after each failure. Final teardown
uses only the exact generated project and requires zero matching containers,
networks and volumes.

This candidate uses Tempo only for disposable trace search. Docker's bounded
structured logs remain the log source; Loki is not provisioned. The normal
dashboard at port 3001 and the playable demo do not gain Tempo. Real runtime
acceptance passed in protected run `33336386466`. Earlier run `33331974187` passed Catalog
diagnosis, PostgreSQL recovery and clean teardown, but its V1 trace read preceded
the PostgreSQL boundary's query visibility and Redis did not run. Run
`33332980729` then proved the exact PostgreSQL TraceQL boundary, recovery and
cleanup while its subsequent V2 read remained incomplete. The refined runner
uses the finite TraceQL-selected span as evidence. Run `33333896159` passed
Catalog and clean recovery/teardown but showed that PostgreSQL outcome must be
validated after exact dependency selection. Run `33334497056` returned the exact
dependency and exposed the classifier's missing intrinsic-error-status fallback;
run `33335112383` then stopped on an earlier dependency fact without a failure
mark. Run `33335707261` showed that the request deadline records the causal
PostgreSQL span as `cancelled` with intrinsic status `unset`. The current
TraceQL query and polling condition require the exact dependency plus one of
`timeout`, `cancelled`, `unavailable` or `error`, excluding
`success`/`rejected`. Run `33336386466` passed Catalog service-loss,
PostgreSQL-`cancelled` and Redis-`unavailable` diagnosis, recovery after every
scenario and exact clean teardown.

## Limits

The dashboard refreshes every 30 seconds. Prometheus keeps at most three days/
128 MB and limits query duration, concurrency and samples. This is enough to
demonstrate diagnosis and the burn-alert mechanics locally but cannot establish
28/30-day reliability. Alert labels do not imply external delivery. Three
diagnostic exercises remain P12-R10 acceptance work; hosted identity, durable
telemetry retention and notification delivery remain Phase 14 work.
