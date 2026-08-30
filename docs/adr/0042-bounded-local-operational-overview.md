# ADR-0042: Provision a bounded local operational overview

- Status: Accepted
- Date: 2026-08-30
- Owners: Platform
- Related requirements: P12-R12
- Supersedes: none
- Superseded by: ADR-0043 for the local Prometheus time ceiling only

## Context

Aster exports reviewed finite metrics to a one-hour local Prometheus store and
defines four executable SLIs. Prometheus can execute those queries, but its query
UI does not give an evaluator one stable view that separates current user impact,
dependency health and runtime saturation. A custom product UI would duplicate a
general observability concern and spend Web scope on an operational surface.

The overview is local and optional. It must start without hosted credentials,
must not become product authority or readiness, and must not widen access to
PostgreSQL, Redis, the broker, object storage or owner services. Local anonymous
access is acceptable only if the listener is loopback-only and cannot mutate the
provisioned resources. The selected runtime is also a separately licensed
dependency in this public repository.

## Decision

Use the unmodified official Grafana OSS `13.2.0` image, pinned by its
multi-platform index digest. A repository-owned child image copies only a
version-controlled Prometheus data source and one dashboard. The upstream
runtime remains under AGPL-3.0-only terms; Aster-authored configuration and
documentation remain MIT. No Grafana source is modified or relicensed.

Grafana joins only the `edge` network and reaches Prometheus at its private
service address. It does not join `platform`. The host listener is
`127.0.0.1:3001`; no non-loopback publication is allowed. The service runs as
UID 472 with a read-only root, dropped capabilities, `no-new-privileges`, 0.5
CPU, 384 MiB memory, 128 PIDs and two bounded tmpfs mounts. Grafana's disposable
SQLite state is not a named volume and never becomes product data.

The local surface enables anonymous Viewer access for at most eight devices,
disables basic/login-form access and initial administrator creation, and disables
sign-up, organization creation, external snapshots, plugin administration,
plugin preinstallation/automatic update, analytics and update checks.
Provisioned resources are non-editable and cannot be deleted through the UI.
This is a local-demo policy, not a hosted authentication design.

The `Aster Operational Overview` dashboard contains exactly three ordered
layers:

1. user impact: four five-minute SLI ratios plus their measured populations;
2. dependency health: finite outcome rate, p95 latency and active operations;
3. runtime saturation: peak process CPU, resident memory, event-loop p99 and
   PostgreSQL pool state.

Each data panel has one fixed Prometheus query and an explicit diagnostic question.
The dashboard has no variables, identifiers, raw GraphQL documents, signed URLs
or arbitrary label input. Refresh is 30 seconds; Prometheus retains its existing
query, sample, concurrency and bounded retention limits. A zero population
remains no data rather than synthetic success. ADR-0043 later extends only the
local time ceiling to three days while preserving the 128 MB size ceiling.

Grafana health is part of the optional profile start and protected dashboard
acceptance, but not `platform-status` or any product readiness path. Grafana or
Prometheus failure therefore removes the view without changing product serving
or durable state.

## Rationale

Grafana provides the smallest credible, version-controlled operational view over
the already selected Prometheus store. Immutable provisioning makes the demo
repeatable, while the narrow network and disposable state keep the operational
projection separate from product owners. Fixed queries make cost, vocabulary and
privacy review executable.

## Consequences

### Positive

- An evaluator gets one localhost operational surface with no hosted account.
- Dashboard JSON, queries and data-source identity are reviewable and testable.
- The three diagnostic layers reuse released metrics without product changes.
- Dashboard loss cannot gate GraphQL, playback or durable writes.

### Negative

- The optional profile adds one 384 MiB container and another image pull/build.
- Local anonymous Viewer access is unsuitable for a remotely reachable host.
- Bounded local data demonstrates mechanics, not 28/30-day SLO compliance.

### Operational

- Open `http://127.0.0.1:3001/d/aster-operational-overview` after the
  observability or full profile is healthy.
- Grafana state is disposable. Recreate the container to recover provisioning;
  do not repair it by deleting product volumes.
- Alert routing, traces/log backends and hosted identity remain separate work.

### Security and privacy

- Loopback binding is the only host exposure; Grafana can reach only the edge
  network and the already loopback-exposed Prometheus service.
- Fixed PromQL and no variables prevent user-controlled query construction in
  the provisioned dashboard. A local Viewer can still use browser/API behavior
  exposed by Grafana, so this policy must not be copied to a hosted listener.
- Aggregate released metrics contain no credentials, personal data, signed URLs
  or arbitrary GraphQL text.

## Alternatives considered

### Use the Prometheus expression browser only

Rejected because it requires an evaluator to reconstruct the diagnostic model
and does not supply the required three-layer operational overview.

### Build a custom dashboard in Next.js

Rejected because it duplicates observability UI and Prometheus proxy concerns in
the product client, expands bundle/security scope and does not improve the core
learning objective.

### Use hosted Grafana or Grafana Enterprise

Deferred. It requires credentials, hosted resources and an authentication/data-
retention decision outside this local portfolio slice.

### Add Tempo and Loki now

Deferred until a concrete diagnostic exercise requires them. The overview can
meet P12-R12 with released metrics; empty backend scaffolding is prohibited.

## Validation

Repository checks reject a changed image pin, host/network widening, persistent
state, elevated role, editable provisioning, variables, unreviewed metrics,
unbounded refresh or changed query set. Protected CI must build and start the
image, verify anonymous health, data-source health and the dashboard UID, then
stop Grafana and prove product platform health remains healthy.

## Revisit triggers

- Any non-loopback or hosted deployment requires authenticated operator access,
  origin/TLS policy and a separate threat review.
- More than one overview, dynamic variables, plugins or a persistent Grafana
  database require a new cost/cardinality/authority decision.
- Modifying or distributing a modified Grafana runtime requires another license
  and corresponding-source review.

## Migration

Build the additive image, start it only through `observability` or `full`, verify
the provisioned resources and publish the localhost guide. Rollback removes the
Grafana service, image and provisioning files. No schema, product data,
Prometheus history, credential or media migration is required.

## Sources

- [Grafana Docker installation](https://grafana.com/docs/grafana/latest/setup-grafana/installation/docker/)
- [Grafana provisioning](https://grafana.com/docs/grafana/latest/administration/provisioning/)
- [Grafana configuration](https://grafana.com/docs/grafana/latest/setup-grafana/configure-grafana/)
- [Grafana licensing](https://grafana.com/licensing/)
- [Grafana 13.2.0 release](https://github.com/grafana/grafana/releases/tag/v13.2.0)
