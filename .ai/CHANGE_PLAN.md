# Work Item: Provisioned Operational Overview

- Status: IN_PROGRESS
- Owner: Platform
- Phase: 12
- Requirement IDs: P12-R12
- Created: 2026-08-30
- Updated: 2026-08-30

## Outcome

Aster has one version-controlled operational overview that separates user
impact, dependency health and runtime saturation. An evaluator can start the
bounded local observability profile, open the loopback-only dashboard without
hosted credentials and trace every panel to a released metric and an operational
question.

## Current behavior

Prometheus 3.14.0 receives bounded Collector and Router metrics, retains one
hour and exposes four executable SLI ratios. PR48 squash main `a99d3d5`, tree
`2374279`, and exact-main run `33314309449` release P12-R05/R06. No dashboard
backend or implemented dashboard is currently claimed.

## Proposed behavior

Add one pinned Grafana OSS 13.2.0 container to the existing observability/full
profile. Bake a read-only Prometheus data source and a provisioned Aster
operational-overview dashboard into a repository-owned image. Bind Grafana only
to `127.0.0.1:3001`, allow finite local anonymous Viewer access, disable writes
and external update/plugin activity, bound measured startup to 0.5 CPU,384 MiB
and128 PIDs, and verify dashboard structure plus live provisioning in protected
CI.

## Boundaries

- Owning context: Platform owns the disposable operational projection; product contexts own the emitted facts.
- Affected services/packages: observability Compose overlay, Grafana image/provisioning, platform validators, CI and operations documentation.
- Authoritative data: PostgreSQL and product owners remain authoritative; dashboard output grants no product decision.
- Read models/caches: Grafana reads only the disposable one-hour Prometheus projection and uses disposable local SQLite state.
- Trust boundaries: a local browser reaches loopback Grafana; Grafana proxies bounded PromQL to private Prometheus on the edge network.
- External dependencies: official Grafana OSS `13.2.0`, pinned by multi-platform digest and governed by AGPL-3.0-only terms.

## Invariants

- Grafana is optional and cannot affect product readiness or serving.
- The overview has explicit user-impact, dependency-health and saturation sections.
- Every data panel uses a released finite metric and answers a documented operational question.
- No identifier, credential, signed URL, raw GraphQL document or arbitrary label enters a query or dashboard variable.
- Local anonymous access is Viewer-only, loopback-only and bounded; provisioned resources are not UI-editable.
- Grafana can reach Prometheus but not PostgreSQL, Redis, broker, storage or owner services.
- Empty/no-traffic SLI results remain empty and never become synthetic success.
- User-impact panels use the released SLO IDs and current instant values; an
  older non-empty sample cannot mask a currently absent recording.

## Failure behavior

| Failure | Expected behavior | Telemetry |
|---|---|---|
| Grafana unavailable | product and Prometheus remain healthy | dashboard readiness fails without changing product readiness |
| Prometheus unavailable | dashboard panels show no data | Grafana data-source health/query failure only |
| Empty SLI population | panel reports no data | no fabricated ratio or compliance result |
| Invalid provisioning/dashboard JSON | image/runtime verification fails | candidate cannot publish |
| Expensive or unbounded panel query | repository validator rejects it | candidate cannot publish |
| Browser attempts non-loopback access or mutation | no host exposure; Viewer cannot save provisioned resources | request denied or unreachable |

## Data and contracts

- Schema/migration: none; Grafana state is disposable tmpfs.
- GraphQL: none.
- Events: none.
- Cache: none.
- Compatibility: additive local port `3001`, service `grafana`, dashboard UID and Prometheus data-source UID.
- Retention/deletion: Grafana state disappears with the container; Prometheus retains the existing one-hour bounded volume.

## Security and privacy

- Authorization: anonymous local access has Viewer role only; there is no hosted or operator authorization claim.
- Input limits: no dashboard variables; fixed PromQL, refresh interval and panel/query counts; Prometheus keeps its query limits.
- Sensitive data: only already-reviewed finite aggregate metrics are queried; dashboard JSON contains no credentials or personal data.
- Abuse cases: arbitrary proxy queries, host exposure, UI mutation, plugin download, unbounded refresh, data-source substitution and network reach expansion.

## Implementation steps

1. Record ADR-0042 for the bounded local Grafana topology, license and rollback.
2. Add the pinned image, immutable provisioning and three-section overview.
3. Extend platform/reset/CI validators with adverse dashboard and isolation checks.
4. Verify static structure, official image configuration and protected live provisioning.
5. Update operations, architecture, evidence and repository memory.

## Tests

- Domain: not applicable; no product rule changes.
- Application: not applicable; dashboard is an operational projection.
- Integration: Compose validates and protected CI starts Grafana, verifies health, data source, dashboard UID and representative live queries.
- Contract: repository validator checks finite panels, SLO-contract IDs, instant user-impact values, released metric names, fixed data source, section coverage, links and no prohibited labels.
- Browser: one loopback HTTP/dashboard API acceptance; no product browser journey changes.
- Performance/failure: finite resources, refresh/query bounds, Prometheus absence and Grafana failure do not affect product health.

## Evidence

- Commands: dashboard/platform focused tests, Compose render, image metadata, affected gate and protected live Grafana/Prometheus proof.
- Raw artifact path: `evidence/phase-12/operational-overview.txt` and version-controlled dashboard JSON.
- Acceptance result: the provisioned overview distinguishes all three required operational layers with live released metrics.
- Iteration gate: dashboard contract validator and optional-platform tests.
- Candidate gate: `pnpm check:changed`, documentation/AI checks, secret scan and `git diff --check`.
- Heavyweight repeat triggers: repeat live Docker provisioning only when image, Compose, provisioning, dashboard query, network or CI assertion changes.
- Review stopping rule: one initial review and one confirmation; extend only for requirement, security/privacy, measurement-integrity, availability or public-contract blockers.

## Rollback or recovery

Remove the additive Grafana service/image/provisioning and restore the prior
observability overlay. No product state or Prometheus history requires migration.

## Documentation updates

- ADR-0042, observability architecture, local development and operational overview guide.
- Phase12 evidence index and dashboard artifact evidence.
- Repository state, queue, session log, decisions ledger and handoff.

## Completion checklist

- [x] Requirements satisfied
- [x] Tests pass
- [x] Evidence captured
- [x] Documentation current
- [x] `.ai/` state updated
- [x] Remaining risks recorded
